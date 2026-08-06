class Message {
  const Message({
    required this.id,
    required this.clientMessageId,
    required this.sequence,
    required this.channelId,
    required this.authorId,
    required this.authorDisplayName,
    required this.body,
    required this.createdAt,
  });

  final String id;
  final String clientMessageId;
  final int sequence;
  final String channelId;
  final String authorId;
  final String authorDisplayName;
  final String body;
  final DateTime createdAt;

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] as String,
      clientMessageId: json['clientMessageId'] as String,
      sequence: json['sequence'] as int,
      channelId: json['channelId'] as String,
      authorId: json['authorId'] as String,
      authorDisplayName: json['authorDisplayName'] as String,
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
