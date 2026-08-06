import 'dart:convert';

import 'package:deuce_client/src/chat_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('uses a bearer token for user lookup and local logout', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      expect(request.headers['authorization'], 'Bearer test-access-token');
      expect(request.url.queryParameters.containsKey('accessToken'), isFalse);

      if (request.url.path == '/me') {
        return http.Response(
          jsonEncode({
            'id': '39c5bd6f-b06f-433a-9394-1d811e232c63',
            'displayName': 'Alice',
            'actorType': 'human',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path == '/auth/logout') {
        return http.Response('', 204);
      }
      return http.Response('', 404);
    });
    final controller = ChatController(
      serverUrl: 'http://127.0.0.1:9',
      accessTokenProvider: () async => 'test-access-token',
      httpClient: client,
    );
    addTearDown(controller.dispose);

    await controller.connect();
    expect(controller.userId, '39c5bd6f-b06f-433a-9394-1d811e232c63');
    expect(controller.displayName, 'Alice');

    await controller.revokeCurrentSession();
    expect(requests.map((request) => request.url.path), [
      '/me',
      '/auth/logout',
    ]);
  });
}
