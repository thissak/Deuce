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

class ChatController extends ChangeNotifier {
  ChatController({
    this.serverUrl = const String.fromEnvironment(
      'DEUCE_SERVER_URL',
      defaultValue: 'http://127.0.0.1:3210',
    ),
    http.Client? httpClient,
    Uuid? uuid,
  }) : _httpClient = httpClient ?? http.Client(),
       _uuid = uuid ?? const Uuid();

  static const channelId = 'general';
  static const userIds = ['alice', 'bob'];

  final String serverUrl;
  final http.Client _httpClient;
  final Uuid _uuid;
  final List<Message> _messages = [];

  io.Socket? _socket;
  bool _disposed = false;
  bool _recoveryHealthy = false;
  bool _sending = false;
  String _userId = userIds.first;
  String? _errorMessage;
  int _recoveryCursor = 0;
  int _recoveryGeneration = 0;
  ConnectionStatus _status = ConnectionStatus.disconnected;

  List<Message> get messages => List.unmodifiable(_messages);
  String get userId => _userId;
  bool get sending => _sending;
  String? get errorMessage => _errorMessage;
  ConnectionStatus get status => _status;

  Future<void> connect([String? nextUserId]) async {
    final selectedUserId = nextUserId ?? _userId;
    if (!userIds.contains(selectedUserId)) {
      throw ArgumentError.value(selectedUserId, 'nextUserId');
    }

    final previousSocket = _socket;
    _socket = null;
    _recoveryGeneration += 1;
    _recoveryHealthy = false;
    previousSocket?.dispose();
    _userId = selectedUserId;
    _errorMessage = null;
    _setStatus(ConnectionStatus.connecting);

    final socket = io.io(
      serverUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'userId': selectedUserId})
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
      _errorMessage = '서버에 연결할 수 없습니다: $error';
      _setStatus(ConnectionStatus.error);
    });
    socket.on('message:created', (data) {
      if (_socket != socket || data is! Map) return;
      _addMessage(Message.fromJson(Map<String, dynamic>.from(data)));
      if (_recoveryHealthy) _recoveryCursor = _highestSequence;
    });
    socket.connect();
  }

  void disconnect() {
    final socket = _socket;
    _socket = null;
    _recoveryGeneration += 1;
    _recoveryHealthy = false;
    socket?.dispose();
    _setStatus(ConnectionStatus.disconnected);
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
    } catch (error) {
      _errorMessage = '메시지를 보내지 못했습니다. 다시 시도해 주세요.';
      return false;
    } finally {
      _sending = false;
      _notify();
    }
  }

  int get _highestSequence => _messages.isEmpty ? 0 : _messages.last.sequence;

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
      final response = await _httpClient.get(uri);
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
}
