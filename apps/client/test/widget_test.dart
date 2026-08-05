import 'package:deuce_client/src/app.dart';
import 'package:deuce_client/src/message.dart';
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
}
