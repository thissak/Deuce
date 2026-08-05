import 'package:flutter/material.dart';

import 'chat_controller.dart';
import 'message.dart';

class DeuceApp extends StatefulWidget {
  const DeuceApp({super.key, this.connectOnStart = true});

  final bool connectOnStart;

  @override
  State<DeuceApp> createState() => _DeuceAppState();
}

class _DeuceAppState extends State<DeuceApp> {
  late final ChatController _controller;

  @override
  void initState() {
    super.initState();
    _controller = ChatController();
    if (widget.connectOnStart) {
      _controller.connect();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Deuce',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xff6264a7),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xff1f1f1f),
        useMaterial3: true,
      ),
      home: ChatScreen(controller: _controller),
    );
  }
}

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.controller});

  final ChatController controller;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _composer = TextEditingController();
  final _scrollController = ScrollController();
  int _previousMessageCount = 0;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
  }

  void _onChanged() {
    if (!mounted) return;
    setState(() {});

    if (widget.controller.messages.length > _previousMessageCount) {
      _previousMessageCount = widget.controller.messages.length;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChanged);
    _composer.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final sent = await widget.controller.sendMessage(_composer.text);
    if (sent) _composer.clear();
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;

    return Scaffold(
      body: Row(
        children: [
          Container(
            width: 230,
            color: const Color(0xff252423),
            padding: const EdgeInsets.fromLTRB(18, 28, 18, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'DEUCE',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 28),
                const Text('채널', style: TextStyle(color: Colors.white60)),
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 11,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xff3b3a39),
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: const Text('# general'),
                ),
                const Spacer(),
                const Text('개발 사용자', style: TextStyle(color: Colors.white60)),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: controller.userId,
                  decoration: const InputDecoration(isDense: true),
                  items: ChatController.userIds
                      .map(
                        (userId) => DropdownMenuItem(
                          value: userId,
                          child: Text(_displayName(userId)),
                        ),
                      )
                      .toList(),
                  onChanged: (userId) {
                    if (userId != null) controller.connect(userId);
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: Column(
              children: [
                Container(
                  height: 72,
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  decoration: const BoxDecoration(
                    color: Color(0xff292929),
                    border: Border(
                      bottom: BorderSide(color: Color(0xff3d3d3d)),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Text(
                        '# general',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      _ConnectionBadge(status: controller.status),
                    ],
                  ),
                ),
                if (controller.errorMessage != null)
                  Container(
                    width: double.infinity,
                    color: const Color(0xff6d3131),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 9,
                    ),
                    child: Text(controller.errorMessage!),
                  ),
                Expanded(
                  child: controller.messages.isEmpty
                      ? const Center(
                          child: Text(
                            '첫 메시지를 보내 대화를 시작하세요.',
                            style: TextStyle(color: Colors.white54),
                          ),
                        )
                      : ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 16,
                          ),
                          itemCount: controller.messages.length,
                          itemBuilder: (context, index) => _MessageRow(
                            message: controller.messages[index],
                            mine:
                                controller.messages[index].authorId ==
                                controller.userId,
                          ),
                        ),
                ),
                Container(
                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 20),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _composer,
                          enabled:
                              controller.status == ConnectionStatus.connected,
                          minLines: 1,
                          maxLines: 5,
                          onSubmitted: (_) => _send(),
                          decoration: InputDecoration(
                            hintText: '# general에 메시지 보내기',
                            filled: true,
                            fillColor: const Color(0xff333333),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      IconButton.filled(
                        tooltip: '보내기',
                        onPressed:
                            controller.status == ConnectionStatus.connected &&
                                !controller.sending
                            ? _send
                            : null,
                        icon: const Icon(Icons.send_rounded),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageRow extends StatelessWidget {
  const _MessageRow({required this.message, required this.mine});

  final Message message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final localTime = message.createdAt.toLocal();
    final time =
        '${localTime.hour.toString().padLeft(2, '0')}:'
        '${localTime.minute.toString().padLeft(2, '0')}';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: mine
                ? const Color(0xff6264a7)
                : const Color(0xff4f6b57),
            child: Text(_displayName(message.authorId).substring(0, 1)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      _displayName(message.authorId),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      time,
                      style: const TextStyle(
                        color: Colors.white38,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                SelectableText(message.body),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ConnectionBadge extends StatelessWidget {
  const _ConnectionBadge({required this.status});

  final ConnectionStatus status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      ConnectionStatus.connected => ('연결됨', const Color(0xff58a46b)),
      ConnectionStatus.connecting => ('연결 중', const Color(0xffd9a441)),
      ConnectionStatus.reconnecting => ('재연결 중', const Color(0xffd9a441)),
      ConnectionStatus.error => ('연결 오류', const Color(0xffd66565)),
      ConnectionStatus.disconnected => ('연결 안 됨', Colors.white38),
    };

    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 7),
        Text(
          label,
          style: const TextStyle(color: Colors.white70, fontSize: 13),
        ),
      ],
    );
  }
}

String _displayName(String userId) {
  return switch (userId) {
    'alice' => 'Alice',
    'bob' => 'Bob',
    _ => userId,
  };
}
