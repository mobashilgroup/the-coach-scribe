import 'dart:async';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Native microphone capture (Spec §10.13). Records to a single AAC/M4A file;
/// the file is later chunk-uploaded by UploadQueue. Exposes elapsed time and a
/// live input level so the UI can show a meter.
///
/// Foreground recording works here. Auto-starting on unlock and recording in
/// the background require platform work (Android foreground service /
/// WorkManager, iOS background audio + BGTaskScheduler) — see README roadmap.
class RecorderService {
  final AudioRecorder _rec = AudioRecorder();
  final List<Map<String, int>> markers = []; // {type index, tMs}
  String? _path;
  DateTime? _startedAt;
  int _accumMs = 0;
  Timer? _ticker;

  final _elapsed = StreamController<int>.broadcast();
  Stream<int> get elapsedMs => _elapsed.stream;

  Stream<Amplitude>? _ampStream;
  Stream<Amplitude> get amplitude =>
      _ampStream ??= _rec.onAmplitudeChanged(const Duration(milliseconds: 200));

  int get currentMs {
    final running = _startedAt != null ? DateTime.now().difference(_startedAt!).inMilliseconds : 0;
    return _accumMs + running;
  }

  Future<bool> hasPermission() => _rec.hasPermission();

  Future<void> start() async {
    final dir = await getApplicationDocumentsDirectory();
    _path = '${dir.path}/rec_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _rec.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: _path!);
    _startedAt = DateTime.now();
    _ticker = Timer.periodic(const Duration(milliseconds: 250), (_) => _elapsed.add(currentMs));
  }

  Future<void> pause() async {
    if (await _rec.isRecording()) {
      await _rec.pause();
      _accumMs += DateTime.now().difference(_startedAt!).inMilliseconds;
      _startedAt = null;
    }
  }

  Future<void> resume() async {
    if (await _rec.isPaused()) {
      await _rec.resume();
      _startedAt = DateTime.now();
    }
  }

  void mark(int typeIndex) => markers.add({'type': typeIndex, 'tMs': currentMs});

  /// Stops recording and returns the file path + total duration (ms).
  Future<({String path, int durationMs})> stop() async {
    final durationMs = currentMs;
    final path = await _rec.stop();
    _ticker?.cancel();
    await _elapsed.close();
    return (path: path ?? _path ?? '', durationMs: durationMs);
  }

  Future<void> dispose() async {
    _ticker?.cancel();
    await _rec.dispose();
  }
}
