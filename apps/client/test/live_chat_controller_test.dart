import 'package:deuce_client/src/chat_controller.dart';
import 'package:flutter_test/flutter_test.dart';

const liveServerUrl = String.fromEnvironment('DEUCE_LIVE_SERVER_URL');

void main() {
  test(
    'two Flutter clients exchange and recover a missed message',
    () async {
      final alice = ChatController(serverUrl: liveServerUrl);
      final bob = ChatController(serverUrl: liveServerUrl);
      addTearDown(alice.dispose);
      addTearDown(bob.dispose);

      await alice.connect('alice');
      await bob.connect('bob');
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
      await bob.connect('bob');
      await _waitUntil(
        () => bob.messages.any((message) => message.body == missedBody),
      );
    },
    skip: liveServerUrl.isEmpty
        ? 'Set DEUCE_LIVE_SERVER_URL with --dart-define to run the live test.'
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
