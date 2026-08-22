import 'package:flutter/material.dart';

import '../api/models.dart';
import '../services/upload_queue.dart';
import '../state/app_state.dart';
import '../theme.dart';
import 'clients_screen.dart';
import 'new_session_screen.dart';
import 'history_screen.dart';
import 'review_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<Session> _sessions = [];
  int _clientCount = 0;
  int _pending = 0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    // On (re)connect, upload anything recorded offline, then refresh.
    UploadQueue.flush().then((sessionId) {
      if (sessionId != null && mounted) _load();
    });
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final sessions = await appState.api.sessions();
      final clients = await appState.api.clients();
      final pending = await UploadQueue.pendingCount();
      if (!mounted) return;
      setState(() { _sessions = sessions; _clientCount = clients.length; _pending = pending; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final review = _sessions.where((s) => s.status == 'review_required').length;
    return Scaffold(
      appBar: AppBar(
        title: const Text('The Coach Scribe'),
        actions: [
          IconButton(onPressed: () => appState.signOut(), icon: const Icon(Icons.logout)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(18),
          children: [
            Text('Hello, ${appState.firstName}', style: serifTitle),
            const SizedBox(height: 14),
            if (_pending > 0)
              _banner('$_pending recording(s) saved on device — will upload when online', Brand.night),
            Row(
              children: [
                Expanded(child: _stat('$_clientCount', 'Clients')),
                const SizedBox(width: 12),
                Expanded(child: _stat('${_sessions.length}', 'Sessions')),
                const SizedBox(width: 12),
                Expanded(child: _stat('$review', 'To review')),
              ],
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () async {
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NewSessionScreen()));
                _load();
              },
              icon: const Icon(Icons.fiber_manual_record),
              label: const Text('New Session'),
              style: ElevatedButton.styleFrom(backgroundColor: Brand.ink, foregroundColor: Colors.white),
            ),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: OutlinedButton(
                onPressed: () async {
                  await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ClientsScreen()));
                  _load();
                },
                child: const Text('Clients'),
              )),
              const SizedBox(width: 10),
              Expanded(child: OutlinedButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const HistoryScreen())),
                child: const Text('History'),
              )),
            ]),
            const SizedBox(height: 20),
            Text('Recent sessions', style: serifTitle.copyWith(fontSize: 17)),
            const SizedBox(height: 8),
            if (_loading) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
            else if (_sessions.isEmpty) const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: Text('No sessions yet. Start with New Session.', style: TextStyle(color: Brand.muted))),
            )
            else ..._sessions.take(6).map(_sessionTile),
          ],
        ),
      ),
    );
  }

  Widget _banner(String text, Color color) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
        child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 13)),
      );

  Widget _stat(String n, String label) => Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(color: Brand.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Brand.line)),
        child: Column(children: [
          Text(n, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          Text(label, style: const TextStyle(fontSize: 12, color: Brand.muted)),
        ]),
      );

  Widget _sessionTile(Session s) => Card(
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: Brand.line)),
        child: ListTile(
          title: Text(s.title ?? 'Session'),
          subtitle: Text(s.status.replaceAll('_', ' ')),
          trailing: const Icon(Icons.chevron_right),
          onTap: () async {
            await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReviewScreen(sessionId: s.id)));
            _load();
          },
        ),
      );
}
