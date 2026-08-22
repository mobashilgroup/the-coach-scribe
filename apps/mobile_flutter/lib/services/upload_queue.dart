import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../state/app_state.dart';

/// A recording captured on-device but not yet uploaded (e.g. made in airplane
/// mode). Persisted so it survives app restarts until it reaches the server.
class PendingRecording {
  final String id;
  final String clientId;
  final String? title;
  final String filePath;
  final int durationSeconds;
  PendingRecording({
    required this.id,
    required this.clientId,
    required this.filePath,
    required this.durationSeconds,
    this.title,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'clientId': clientId,
        'title': title,
        'filePath': filePath,
        'durationSeconds': durationSeconds,
      };

  factory PendingRecording.fromJson(Map<String, dynamic> j) => PendingRecording(
        id: j['id'] as String,
        clientId: j['clientId'] as String,
        title: j['title'] as String?,
        filePath: j['filePath'] as String,
        durationSeconds: (j['durationSeconds'] ?? 1) as int,
      );
}

/// Offline-resilient upload queue. Recordings finished while offline are stored
/// locally and uploaded automatically when connectivity returns — mirroring the
/// resumable, chunked upload the API exposes (init → chunk* → complete).
class UploadQueue {
  static const _key = 'tcs_pending_recordings';

  static Future<List<PendingRecording>> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return [];
    final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
    return list.map(PendingRecording.fromJson).toList();
  }

  static Future<void> _save(List<PendingRecording> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(items.map((e) => e.toJson()).toList()));
  }

  static Future<void> enqueue(PendingRecording rec) async {
    final items = await _load();
    items.add(rec);
    await _save(items);
  }

  static Future<int> pendingCount() async => (await _load()).length;

  static Future<bool> _isOnline() async {
    final result = await Connectivity().checkConnectivity();
    return !result.contains(ConnectivityResult.none);
  }

  /// Try to upload everything queued. Returns the session id of the last
  /// successfully processed recording (so the UI can open its review), if any.
  static Future<String?> flush() async {
    if (!(await _isOnline())) return null;
    final items = await _load();
    String? lastSessionId;
    final remaining = <PendingRecording>[];
    for (final rec in items) {
      try {
        lastSessionId = await _upload(rec);
      } catch (_) {
        remaining.add(rec); // keep it for the next reconnect
      }
    }
    await _save(remaining);
    return lastSessionId;
  }

  static Future<String> _upload(PendingRecording rec) async {
    final api = appState.api;
    final session = await api.createSession(
      clientId: rec.clientId,
      inputMethod: 'record_audio',
      title: rec.title,
      durationSeconds: rec.durationSeconds,
    );
    await api.recordConsent(session.id);

    final file = File(rec.filePath);
    final bytes = await file.readAsBytes();
    final chunkSize = Config.uploadChunkBytes;
    final totalChunks = (bytes.length / chunkSize).ceil().clamp(1, 1 << 30);

    final uploadId = await api.uploadInit(session.id,
        fileName: 'recording.m4a', mimeType: 'audio/mp4', totalSize: bytes.length, totalChunks: totalChunks);
    for (var i = 0; i < totalChunks; i++) {
      final start = i * chunkSize;
      final end = (start + chunkSize).clamp(0, bytes.length);
      final slice = Uint8List.sublistView(bytes, start, end);
      await api.uploadChunk(session.id, uploadId, i, slice);
    }
    await api.uploadComplete(session.id, uploadId, totalChunks: totalChunks, fileName: 'recording.m4a');
    await api.processSession(session.id);

    if (await file.exists()) {
      await file.delete(); // audio uploaded — the server keeps only what retention allows
    }
    return session.id;
  }
}
