import 'package:deuce_client/src/app.dart';
import 'package:deuce_client/src/chat_controller.dart';
import 'package:deuce_client/src/message.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses the shared message contract', () {
    final message = Message.fromJson({
      'id': '4f2b3ccc-0a4a-4fcb-ac4c-e36c368d6334',
      'clientMessageId': '66a88431-64d3-4dfc-96f8-d1bd25dc3f67',
      'sequence': 7,
      'channelId': 'general',
      'authorId': 'alice',
      'body': 'hello',
      'createdAt': '2026-08-06T00:00:00.000Z',
    });

    expect(message.sequence, 7);
    expect(message.authorId, 'alice');
    expect(message.body, 'hello');
  });

  testWidgets('shows the first-slice channel shell', (tester) async {
    await tester.pumpWidget(const DeuceApp(connectOnStart: false));

    expect(find.text('DEUCE'), findsOneWidget);
    expect(find.text('# general'), findsNWidgets(2));
    expect(find.text('첫 메시지를 보내 대화를 시작하세요.'), findsOneWidget);
  });

  testWidgets('Enter sends while Shift+Enter remains available for a newline', (
    tester,
  ) async {
    final controller = _ConnectedChatController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(home: ChatScreen(controller: controller)),
    );

    final composer = find.byType(TextField);
    await tester.tap(composer);
    await tester.enterText(composer, 'hello');
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();

    expect(controller.sentMessages, ['hello']);
    expect(find.text('hello'), findsNothing);

    await tester.enterText(composer, 'line one');
    await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
    await tester.pump();

    expect(controller.sentMessages, ['hello']);
    expect(
      tester.widget<TextField>(composer).textInputAction,
      TextInputAction.newline,
    );
  });
}

class _ConnectedChatController extends ChatController {
  final List<String> sentMessages = [];

  @override
  ConnectionStatus get status => ConnectionStatus.connected;

  @override
  Future<bool> sendMessage(String rawBody) async {
    sentMessages.add(rawBody);
    return true;
  }
}
