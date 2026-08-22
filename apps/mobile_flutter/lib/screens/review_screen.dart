import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../state/app_state.dart';
import '../theme.dart';

class ReviewScreen extends StatefulWidget {
  final String sessionId;
  const ReviewScreen({super.key, required this.sessionId});
  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  Summary? _summary;
  bool _loading = true;
  String _status = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final sessions = await appState.api.sessions();
      final match = sessions.where((s) => s.id == widget.sessionId).toList();
      final summary = await appState.api.latestSummary(widget.sessionId);
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _status = match.isNotEmpty ? match.first.status : '';
        _loading = false;
      });
    } on ApiException catch (e) {
      setState(() { _error = e.message; _loading = false; });
    }
  }

  Future<void> _approve() async {
    try { await appState.api.approve(widget.sessionId); _load(); }
    catch (e) { _snack(e.toString()); }
  }

  Future<void> _share() async {
    try { await appState.api.share(widget.sessionId); _load(); _snack('Shared with client'); }
    catch (e) { _snack(e.toString()); }
  }

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Session summary')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Brand.error)))
              : _summary == null
                  ? const Center(child: Text('No summary yet.', style: TextStyle(color: Brand.muted)))
                  : _content(),
    );
  }

  Widget _content() {
    final s = _summary!;
    final canApprove = _status == 'review_required';
    final canShare = _status == 'approved';
    return Column(children: [
      Container(
        width: double.infinity,
        color: Brand.surface,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(children: [
          Chip(label: Text(_status.replaceAll('_', ' '))),
          const Spacer(),
          Text('AI-generated · review before sharing', style: TextStyle(fontSize: 12, color: Brand.muted)),
        ]),
      ),
      Expanded(
        child: ListView(padding: const EdgeInsets.all(16), children: [
          _section('Executive Summary', [s.summary]),
          _section('Main Topics', s.topics),
          _section('Strengths & Resources', s.strengths),
          _section('Obstacles', s.obstacles),
          _section('Action Items', s.actionItems.map((a) => (a['title'] ?? '').toString()).toList()),
          _section('Reflection Questions', s.reflectionQuestions),
        ]),
      ),
      SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(child: ElevatedButton(
              onPressed: canApprove ? _approve : null,
              style: ElevatedButton.styleFrom(backgroundColor: Brand.ink, foregroundColor: Colors.white),
              child: const Text('Approve'),
            )),
            const SizedBox(width: 10),
            Expanded(child: ElevatedButton(
              onPressed: canShare ? _share : null,
              child: const Text('Share'),
            )),
          ]),
        ),
      ),
    ]);
  }

  Widget _section(String label, List<String> items) {
    final clean = items.where((e) => e.trim().isNotEmpty).toList();
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Brand.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Brand.line)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(border: Border.all(color: Brand.gold), borderRadius: BorderRadius.circular(6)),
            child: const Text('AI', style: TextStyle(fontSize: 11, color: Brand.gold)),
          ),
        ]),
        const SizedBox(height: 6),
        if (clean.isEmpty) const Text('—', style: TextStyle(color: Brand.muted))
        else ...clean.map((t) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text('• $t', style: const TextStyle(fontSize: 15, height: 1.4)),
        )),
      ]),
    );
  }
}
