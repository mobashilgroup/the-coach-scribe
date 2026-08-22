import 'package:flutter/material.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import 'recording_screen.dart';
import 'review_screen.dart';

class NewSessionScreen extends StatefulWidget {
  const NewSessionScreen({super.key});
  @override
  State<NewSessionScreen> createState() => _NewSessionScreenState();
}

class _NewSessionScreenState extends State<NewSessionScreen> {
  List<Client> _clients = [];
  Client? _client;
  final _title = TextEditingController();
  final _freeText = TextEditingController();
  String _method = 'record_audio';
  bool _consent = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    appState.api.clients().then((c) => setState(() { _clients = c; _client = c.isNotEmpty ? c.first : null; }));
  }

  Future<void> _startRecording() async {
    if (_client == null) return;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => RecordingScreen(client: _client!, title: _title.text.trim()),
    ));
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _generateFromText() async {
    if (_client == null || _freeText.text.trim().isEmpty) {
      setState(() => _error = 'Pick a client and write some notes');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      final session = await appState.api.createSession(
        clientId: _client!.id, inputMethod: 'free_text', title: _title.text.trim(), freeText: _freeText.text.trim());
      await appState.api.processSession(session.id);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => ReviewScreen(sessionId: session.id)));
    } catch (e) {
      setState(() { _error = e.toString(); _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New Session')),
      body: _clients.isEmpty
          ? const Center(child: Text('Add a client first.', style: TextStyle(color: Brand.muted)))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(18),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('Client', style: TextStyle(color: Brand.muted, fontSize: 13)),
                DropdownButton<Client>(
                  isExpanded: true,
                  value: _client,
                  items: _clients.map((c) => DropdownMenuItem(value: c, child: Text(c.name))).toList(),
                  onChanged: (c) => setState(() => _client = c),
                ),
                const SizedBox(height: 8),
                TextField(controller: _title, decoration: const InputDecoration(labelText: 'Title (optional)')),
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(child: _methodCard('record_audio', '● Record now', 'Works offline / airplane mode')),
                  const SizedBox(width: 10),
                  Expanded(child: _methodCard('free_text', '✎ Free text', 'Type notes')),
                ]),
                const SizedBox(height: 16),
                if (_method == 'record_audio') ..._recordBody() else ..._textBody(),
                if (_error != null) Padding(padding: const EdgeInsets.only(top: 10),
                    child: Text(_error!, style: const TextStyle(color: Brand.error))),
              ]),
            ),
    );
  }

  Widget _methodCard(String id, String title, String sub) {
    final selected = _method == id;
    return InkWell(
      onTap: () => setState(() => _method = id),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Brand.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? Brand.gold : Brand.line, width: selected ? 2 : 1),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(sub, style: const TextStyle(fontSize: 12, color: Brand.muted)),
        ]),
      ),
    );
  }

  List<Widget> _recordBody() => [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: const Color(0xFFFAF9F6), borderRadius: BorderRadius.circular(12)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Recording Consent', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            const Text(
              'This conversation will be transcribed and analyzed. Audio is deleted after processing per your retention settings. You confirm the client was informed and consented. Some jurisdictions require all-party consent.',
              style: TextStyle(fontSize: 13, color: Brand.muted),
            ),
            CheckboxListTile(
              value: _consent,
              onChanged: (v) => setState(() => _consent = v ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              activeColor: Brand.gold,
              title: const Text('I informed the client and recorded their consent.'),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        ElevatedButton.icon(
          onPressed: _consent ? _startRecording : null,
          icon: const Icon(Icons.mic),
          label: const Text('Start recording'),
        ),
      ];

  List<Widget> _textBody() => [
        TextField(
          controller: _freeText,
          maxLines: 6,
          decoration: const InputDecoration(labelText: 'Session notes', alignLabelWithHint: true),
        ),
        const SizedBox(height: 10),
        ElevatedButton(
          onPressed: _busy ? null : _generateFromText,
          child: _busy ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Generate Summary'),
        ),
      ];
}
