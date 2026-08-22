import 'package:flutter/material.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../theme.dart';

class ClientsScreen extends StatefulWidget {
  const ClientsScreen({super.key});
  @override
  State<ClientsScreen> createState() => _ClientsScreenState();
}

class _ClientsScreenState extends State<ClientsScreen> {
  List<Client> _clients = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final clients = await appState.api.clients();
      if (mounted) setState(() { _clients = clients; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addClient() async {
    final first = TextEditingController();
    final last = TextEditingController();
    final email = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add client'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: first, decoration: const InputDecoration(labelText: 'First name')),
          const SizedBox(height: 8),
          TextField(controller: last, decoration: const InputDecoration(labelText: 'Last name (optional)')),
          const SizedBox(height: 8),
          TextField(controller: email, decoration: const InputDecoration(labelText: 'Email (optional)')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (saved == true && first.text.trim().isNotEmpty) {
      try {
        await appState.api.createClient(firstName: first.text.trim(), lastName: last.text.trim(), email: email.text.trim());
        _load();
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Clients')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addClient, backgroundColor: Brand.gold, foregroundColor: Brand.ink,
        icon: const Icon(Icons.add), label: const Text('Add'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _clients.isEmpty
              ? const Center(child: Text('No clients yet.', style: TextStyle(color: Brand.muted)))
              : ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: _clients.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final c = _clients[i];
                    return ListTile(
                      leading: CircleAvatar(backgroundColor: Brand.night, child: Text(
                        c.name.isNotEmpty ? c.name[0].toUpperCase() : '?', style: const TextStyle(color: Colors.white))),
                      title: Text(c.name),
                      subtitle: Text(c.email ?? 'No email'),
                      trailing: Chip(label: Text(c.portalStatus, style: const TextStyle(fontSize: 11))),
                    );
                  },
                ),
    );
  }
}
