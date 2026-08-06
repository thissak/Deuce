import 'package:deuce_client/src/chat_controller.dart';
import 'package:flutter_test/flutter_test.dart';

const liveServerUrl = String.fromEnvironment('DEUCE_LIVE_SERVER_URL');
const aliceAccessToken = String.fromEnvironment(
  'DEUCE_LIVE_ACCESS_TOKEN_ALICE',
);
const bobAccessToken = String.fromEnvironment('DEUCE_LIVE_ACCESS_TOKEN_BOB');

void main() {
  test(
    'two Flutter clients exchange and recover a missed message',
    () async {
      final alice = ChatController(
        serverUrl: liveServerUrl,
        accessTokenProvider: () async => aliceAccessToken,
      );
      final bob = ChatController(
        serverUrl: liveServerUrl,
        accessTokenProvider: () async => bobAccessToken,
      );
      addTearDown(alice.dispose);
      addTearDown(bob.dispose);

      await alice.connect();
      await bob.connect();
      await _waitUntil(
        () =>
            alice.status == ConnectionStatus.connected &&
            bob.status == ConnectionStatus.connected,
      );

      final marker = DateTime.now().microsecondsSinceEpoch;
      final firstBody = 'flutter-live-first-$marker';
      expect(await alice.sendMessage(firstBody), isTrue);
      await _waitUntil(
        () => bob.messages.any((message) => message.body == firstBody),
      );

      bob.disconnect();
      final missedBody = 'flutter-live-missed-$marker';
      expect(await alice.sendMessage(missedBody), isTrue);
      await bob.connect();
      await _waitUntil(
        () => bob.messages.any((message) => message.body == missedBody),
      );
    },
    skip:
        liveServerUrl.isEmpty ||
            aliceAccessToken.isEmpty ||
            bobAccessToken.isEmpty
        ? 'Set the live server URL and both access tokens with --dart-define.'
        : false,
  );
}

Future<void> _waitUntil(bool Function() condition) async {
  for (var attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
  fail('Condition was not met before timeout.');
}
