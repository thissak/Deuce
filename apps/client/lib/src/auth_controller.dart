import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:oidc/oidc.dart';
import 'package:oidc_default_store/oidc_default_store.dart';

enum AuthStatus { initializing, signedOut, signingIn, signedIn, error }

abstract class AuthController extends ChangeNotifier {
  AuthStatus get status;
  String? get errorMessage;

  Future<void> initialize();
  Future<void> login();
  Future<String?> getAccessToken();
  Future<void> logout();
}

class OidcAuthController extends AuthController {
  OidcAuthController({
    this.issuer = const String.fromEnvironment('DEUCE_OIDC_ISSUER'),
    this.clientId = const String.fromEnvironment(
      'DEUCE_OIDC_CLIENT_ID',
      defaultValue: 'deuce-windows',
    ),
  }) : _manager = _buildManager(issuer.trim(), clientId.trim());

  final String issuer;
  final String clientId;
  final OidcUserManager? _manager;

  StreamSubscription<OidcUser?>? _userSubscription;
  AuthStatus _status = AuthStatus.initializing;
  String? _errorMessage;
  bool _disposed = false;

  @override
  AuthStatus get status => _status;

  @override
  String? get errorMessage => _errorMessage;

  @override
  Future<void> initialize() async {
    final manager = _manager;
    if (manager == null) {
      _setError('DEUCE_OIDC_ISSUER 설정이 필요합니다.');
      return;
    }

    _setStatus(AuthStatus.initializing);
    try {
      await manager.init();
      await _userSubscription?.cancel();
      _userSubscription = manager.userChanges().listen((user) {
        _setStatus(user == null ? AuthStatus.signedOut : AuthStatus.signedIn);
      });
      _setStatus(
        manager.currentUser == null
            ? AuthStatus.signedOut
            : AuthStatus.signedIn,
      );
    } catch (_) {
      _setError('인증 서버 설정을 불러오지 못했습니다.');
    }
  }

  @override
  Future<void> login() async {
    final manager = _manager;
    if (manager == null) {
      _setError('DEUCE_OIDC_ISSUER 설정이 필요합니다.');
      return;
    }

    _errorMessage = null;
    _setStatus(AuthStatus.signingIn);
    try {
      final user = await manager.loginAuthorizationCodeFlow();
      _setStatus(user == null ? AuthStatus.signedOut : AuthStatus.signedIn);
    } catch (_) {
      _setError('로그인을 완료하지 못했습니다. 다시 시도해 주세요.');
    }
  }

  @override
  Future<String?> getAccessToken() async {
    return _manager?.getAccessToken();
  }

  @override
  Future<void> logout() async {
    final manager = _manager;
    if (manager == null) {
      _setStatus(AuthStatus.signedOut);
      return;
    }

    try {
      await manager.logout(originalUri: Uri.parse('/'));
    } finally {
      await manager.forgetUser();
      _setStatus(AuthStatus.signedOut);
    }
  }

  void _setError(String message) {
    _errorMessage = message;
    _setStatus(AuthStatus.error);
  }

  void _setStatus(AuthStatus nextStatus) {
    _status = nextStatus;
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_userSubscription?.cancel());
    final manager = _manager;
    if (manager != null) unawaited(manager.dispose());
    super.dispose();
  }

  static OidcUserManager? _buildManager(String issuer, String clientId) {
    if (issuer.isEmpty || clientId.isEmpty) return null;
    final issuerUri = Uri.tryParse(issuer);
    if (issuerUri == null ||
        !issuerUri.hasScheme ||
        !issuerUri.hasAuthority ||
        !_isSecureOrLoopback(issuerUri)) {
      return null;
    }

    const loopbackRedirect = 'http://127.0.0.1:0';
    return OidcUserManager.lazy(
      id: 'deuce-windows',
      discoveryDocumentUri: OidcUtils.getOpenIdConfigWellKnownUri(issuerUri),
      clientCredentials: OidcClientAuthentication.none(clientId: clientId),
      store: OidcDefaultStore(
        secureStorageInstance: OidcDefaultStore.createHardenedSecureStorage(),
      ),
      settings: OidcUserManagerSettings(
        redirectUri: Uri.parse(loopbackRedirect),
        postLogoutRedirectUri: Uri.parse(loopbackRedirect),
        scope: const ['openid', 'profile'],
        allowedIdTokenAlgorithms: const ['RS256'],
        allowedAudiences: [clientId],
        strictIssuerValidation: true,
        expectedIssuer: issuerUri,
        userInfoSettings: const OidcUserInfoSettings(
          sendUserInfoRequest: false,
        ),
      ),
    );
  }

  static bool _isSecureOrLoopback(Uri uri) {
    return uri.scheme == 'https' ||
        (uri.scheme == 'http' &&
            {'127.0.0.1', 'localhost', '::1'}.contains(uri.host));
  }
}
