import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:record/record.dart';

import '../api/models.dart';
import '../services/recorder_service.dart';
import '../services/upload_queue.dart';
import '../theme.dart';
import 'review_screen.dart';

const _markerTypes = ['Insight', 'Task', 'Goal'];

class RecordingScreen extends StatefulWidget {
  final Client client;
  final String title;
  const RecordingScreen({super.key, required this.client, required this.title});
  @override
  State<RecordingScreen> createState() => _RecordingScreenState();
}

class _RecordingScreenState extends State<RecordingScreen> {
  final RecorderService _rec = RecorderService();
  bool _paused = false;
  bool _online = true;
  int _elapsed = 0;
  int _markerCount = 0;
  bool _finishing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
    Connectivity().onConnectivityChanged.listen((r) {
      if (mounted) setState(() => _online = !r.contains(ConnectivityResult.none));
    });
    Connectivity().checkConnectivity().then((r) {
      if (mounted) setState(() => _online = !r.contains(ConnectivityResult.none));
    });
  }

  Future<void> _init() async {
    if (!await _rec.hasPermission()) {
      setState(() => _error = 'Microphone permission denied');
      return;
    }
    await _rec.start();
    _rec.elapsedMs.listen((ms) { if (mounted) setState(() => _elapsed = ms); });
  }

  @override
  void dispose() {
    _rec.dispose();
    super.dispose();
  }

  String _fmt(int ms) {
    final s = ms ~/ 1000;
    return '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
  }

  Future<void> _togglePause() async {
    if (_paused) { await _rec.resume(); } else { await _rec.pause(); }
    setState(() => _paused = !_paused);
  }

  Future<void> _finish() async {
    setState(() => _finishing = true);
    final result = await _rec.stop();
    final durationSeconds = (result.durationMs / 1000).round().clamp(1, 1 << 30);
    final pending = PendingRecording(
      id: 'rec_${DateTime.now().millisecondsSinceEpoch}',
      clientId: widget.client.id,
      title: widget.title.isEmpty ? null : widget.title,
      filePath: result.path,
      durationSeconds: durationSeconds,
    );
    await UploadQueue.enqueue(pending);

    // Try to upload now; if offline it stays queued and syncs on reconnect.
    final sessionId = await UploadQueue.flush();
    if (!mounted) return;
    if (sessionId != null) {
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => ReviewScreen(sessionId: sessionId)));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved on this device. It will upload when you reconnect.')));
      Navigator.of(context).pop();
    }
  }

  double _level(Amplitude a) {
    // record reports dBFS (<= 0). Map roughly to 0..1 for the meter.
    final v = (a.current + 45) / 45;
    return v.clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(appBar: AppBar(title: const Text('Recording')),
          body: Center(child: Text(_error!, style: const TextStyle(color: Brand.error))));
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Recording'),
        actions: [Padding(padding: const EdgeInsets.all(14), child: Chip(
          backgroundColor: _online ? const Color(0xFFD7EFDF) : Brand.goldSoft,
          label: Text(_online ? 'Online' : 'Offline — saved on device', style: const TextStyle(fontSize: 12)),
        ))],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(width: 12, height: 12, decoration: const BoxDecoration(color: Brand.error, shape: BoxShape.circle)),
            const SizedBox(width: 10),
            Text(_fmt(_elapsed), style: serifTitle.copyWith(fontSize: 40)),
          ]),
          const SizedBox(height: 4),
          Text(widget.client.name, style: const TextStyle(color: Brand.muted)),
          const SizedBox(height: 18),
          StreamBuilder<Amplitude>(
            stream: _rec.amplitude,
            builder: (_, snap) {
              final level = snap.hasData ? _level(snap.data!) : 0.0;
              return ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(value: level, minHeight: 8, backgroundColor: Brand.line, color: Brand.gold),
              );
            },
          ),
          const SizedBox(height: 22),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            OutlinedButton(onPressed: _finishing ? null : _togglePause, child: Text(_paused ? 'Resume' : 'Pause')),
            const SizedBox(width: 12),
            ElevatedButton(
              onPressed: _finishing ? null : _finish,
              style: ElevatedButton.styleFrom(backgroundColor: Brand.error, foregroundColor: Colors.white),
              child: _finishing ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Finish'),
            ),
          ]),
          const SizedBox(height: 16),
          Wrap(spacing: 10, children: List.generate(_markerTypes.length, (i) => OutlinedButton(
            onPressed: () { _rec.mark(i); setState(() => _markerCount++); },
            child: Text(_markerTypes[i]),
          ))),
          const SizedBox(height: 10),
          Text('$_markerCount markers · saved securely on this device',
              style: const TextStyle(fontSize: 13, color: Brand.muted)),
        ]),
      ),
    );
  }
}
