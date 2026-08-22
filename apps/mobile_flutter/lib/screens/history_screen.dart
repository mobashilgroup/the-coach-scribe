import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import 'review_screen.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});
  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<Session> _sessions = [];
  Map<String, String> _clientNames = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final sessions = await appState.api.sessions();
      final clients = await appState.api.clients();
      if (!mounted) return;
      setState(() {
        _sessions = sessions;
        _clientNames = {for (final c in clients) c.id: c.name};
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Session History')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _sessions.isEmpty
              ? const Center(child: Text('No sessions yet.', style: TextStyle(color: Brand.muted)))
              : ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: _sessions.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final s = _sessions[i];
                    final name = _clientNames[s.clientId] ?? 'Client';
                    return ListTile(
                      leading: CircleAvatar(backgroundColor: Brand.night,
                          child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(color: Colors.white))),
                      title: Text(s.title ?? 'Session'),
                      subtitle: Text('$name · ${DateFormat.yMMMd().format(s.createdAt)} · ${s.inputMethod}'),
                      trailing: Chip(label: Text(s.status.replaceAll('_', ' '), style: const TextStyle(fontSize: 11))),
                      onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => ReviewScreen(sessionId: s.id))),
                    );
                  },
                ),
    );
  }
}
