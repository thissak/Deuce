import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:uuid/uuid.dart';

import 'message.dart';

enum ConnectionStatus {
  disconnected,
  connecting,
  connected,
  reconnecting,
  error,
}

typedef AccessTokenProvider = Future<String?> Function();

class ChatController extends ChangeNotifier {
  ChatController({
    this.serverUrl = const String.fromEnvironment(
      'DEUCE_SERVER_URL',
      defaultValue: 'http://127.0.0.1:3210',
    ),
    AccessTokenProvider? accessTokenProvider,
    http.Client? httpClient,
    Uuid? uuid,
  }) : _accessTokenProvider = accessTokenProvider ?? _missingAccessToken,
       _httpClient = httpClient ?? http.Client(),
       _uuid = uuid ?? const Uuid();

  static const channelId = 'general';

  final String serverUrl;
  final AccessTokenProvider _accessTokenProvider;
  final http.Client _httpClient;
  final Uuid _uuid;
  final List<Message> _messages = [];

  io.Socket? _socket;
  bool _disposed = false;
  bool _recoveryHealthy = false;
  bool _sending = false;
  String _userId = '';
  String _displayName = '';
  String? _errorMessage;
  int _recoveryCursor = 0;
  int _recoveryGeneration = 0;
  ConnectionStatus _status = ConnectionStatus.disconnected;

  List<Message> get messages => List.unmodifiable(_messages);
  String get userId => _userId;
  String get displayName => _displayName;
  bool get sending => _sending;
  String? get errorMessage => _errorMessage;
  ConnectionStatus get status => _status;

  Future<void> connect() async {
    final previousSocket = _socket;
    _socket = null;
    final generation = ++_recoveryGeneration;
    _recoveryHealthy = false;
    previousSocket?.dispose();
    _errorMessage = null;
    _setStatus(ConnectionStatus.connecting);

    try {
      await _loadCurrentUser();
      if (_disposed || generation != _recoveryGeneration) return;

      final socket = io.io(
        serverUrl,
        io.OptionBuilder()
            .setTransports(['websocket'])
            .setAuthFn((callback) {
              unawaited(_provideSocketAuth(callback));
            })
            .setAckTimeout(5000)
            .setRetries(3)
            .enableForceNew()
            .disableAutoConnect()
            .enableReconnection()
            .build(),
      );
      _socket = socket;

      socket.onConnect((_) {
        if (_socket != socket) return;
        final recoveryGeneration = ++_recoveryGeneration;
        _recoveryHealthy = false;
        _setStatus(ConnectionStatus.connected);
        unawaited(
          _recoverMissedMessages(_recoveryCursor, recoveryGeneration, socket),
        );
      });
      socket.onDisconnect((_) {
        if (_socket != socket || _disposed) return;
        _recoveryGeneration += 1;
        _recoveryHealthy = false;
        _setStatus(ConnectionStatus.reconnecting);
      });
      socket.onConnectError((error) {
        if (_socket != socket || _disposed) return;
        _errorMessage = switch (error?.toString()) {
          'unauthorized' => '로그인이 만료되었습니다. 다시 로그인해 주세요.',
          'forbidden' => '# general 채널에 접근할 권한이 없습니다.',
          _ => '서버에 연결할 수 없습니다.',
        };
        _setStatus(ConnectionStatus.error);
      });
      socket.on('message:created', (data) {
        if (_socket != socket || data is! Map) return;
        _addMessage(Message.fromJson(Map<String, dynamic>.from(data)));
        if (_recoveryHealthy) _recoveryCursor = _highestSequence;
      });
      socket.connect();
    } catch (_) {
      if (_disposed || generation != _recoveryGeneration) return;
      _errorMessage = '사용자 정보를 확인하지 못했습니다. 다시 로그인해 주세요.';
      _setStatus(ConnectionStatus.error);
    }
  }

  void disconnect() {
    final socket = _socket;
    _socket = null;
    _recoveryGeneration += 1;
    _recoveryHealthy = false;
    socket?.dispose();
    _setStatus(ConnectionStatus.disconnected);
  }

  Future<void> revokeCurrentSession() async {
    try {
      final accessToken = await _requiredAccessToken();
      await _httpClient.post(
        Uri.parse('$serverUrl/auth/logout'),
        headers: _authorizationHeaders(accessToken),
      );
    } finally {
      disconnect();
    }
  }

  Future<bool> sendMessage(String rawBody) async {
    final body = rawBody.trim();
    final socket = _socket;
    if (body.isEmpty || socket == null || !socket.connected || _sending) {
      return false;
    }

    _sending = true;
    _errorMessage = null;
    _notify();

    try {
      final response = await socket.emitWithAckAsync('message:send', {
        'clientMessageId': _uuid.v4(),
        'channelId': channelId,
        'body': body,
      });
      if (response is! Map || response['ok'] != true) {
        throw StateError('message rejected');
      }

      final rawMessage = response['message'];
      if (rawMessage is Map) {
        _addMessage(Message.fromJson(Map<String, dynamic>.from(rawMessage)));
      }
      return true;
    } catch (_) {
      _errorMessage = '메시지를 보내지 못했습니다. 다시 시도해 주세요.';
      return false;
    } finally {
      _sending = false;
      _notify();
    }
  }

  int get _highestSequence => _messages.isEmpty ? 0 : _messages.last.sequence;

  Future<void> _loadCurrentUser() async {
    final accessToken = await _requiredAccessToken();
    final response = await _httpClient.get(
      Uri.parse('$serverUrl/me'),
      headers: _authorizationHeaders(accessToken),
    );
    if (response.statusCode != 200) {
      throw StateError('user lookup returned ${response.statusCode}');
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map || decoded['id'] is! String) {
      throw const FormatException('invalid user response');
    }
    _userId = decoded['id'] as String;
    _displayName = decoded['displayName'] as String;
  }

  Future<void> _provideSocketAuth(void Function(Map auth) callback) async {
    try {
      final accessToken = await _accessTokenProvider();
      callback(accessToken == null ? {} : {'accessToken': accessToken});
    } catch (_) {
      callback({});
    }
  }

  Future<void> _recoverMissedMessages(
    int afterSequence,
    int recoveryGeneration,
    io.Socket socket,
  ) async {
    final uri = Uri.parse('$serverUrl/messages').replace(
      queryParameters: {
        'channelId': channelId,
        'afterSequence': '$afterSequence',
      },
    );

    try {
      final accessToken = await _requiredAccessToken();
      final response = await _httpClient.get(
        uri,
        headers: _authorizationHeaders(accessToken),
      );
      if (response.statusCode != 200) {
        throw StateError('recovery returned ${response.statusCode}');
      }

      final decoded = jsonDecode(response.body);
      if (decoded is! Map || decoded['messages'] is! List) {
        throw const FormatException('invalid recovery response');
      }
      if (_socket != socket || recoveryGeneration != _recoveryGeneration) {
        return;
      }

      for (final item in decoded['messages'] as List) {
        if (item is Map) {
          _addMessage(Message.fromJson(Map<String, dynamic>.from(item)));
        }
      }
      _recoveryCursor = _highestSequence;
      _recoveryHealthy = true;
    } catch (_) {
      if (_disposed ||
          _socket != socket ||
          recoveryGeneration != _recoveryGeneration) {
        return;
      }
      _recoveryHealthy = false;
      _errorMessage = '이전 메시지를 불러오지 못했습니다.';
      _notify();
    }
  }

  Future<String> _requiredAccessToken() async {
    final accessToken = await _accessTokenProvider();
    if (accessToken == null || accessToken.isEmpty) {
      throw StateError('access token is unavailable');
    }
    return accessToken;
  }

  Map<String, String> _authorizationHeaders(String accessToken) {
    return {'authorization': 'Bearer $accessToken'};
  }

  void _addMessage(Message message) {
    if (_messages.any((existing) => existing.id == message.id)) return;
    _messages.add(message);
    _messages.sort((left, right) => left.sequence.compareTo(right.sequence));
    _notify();
  }

  void _setStatus(ConnectionStatus nextStatus) {
    _status = nextStatus;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _recoveryGeneration += 1;
    _recoveryHealthy = false;
    final socket = _socket;
    _socket = null;
    socket?.dispose();
    _httpClient.close();
    super.dispose();
  }

  static Future<String?> _missingAccessToken() async => null;
}
