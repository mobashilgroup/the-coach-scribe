import 'package:flutter/material.dart';

import '../state/app_state.dart';
import '../theme.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _firstName = TextEditingController();
  final _org = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _accepted = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _firstName.dispose();
    _org.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_accepted) { setState(() => _error = 'You must accept the terms'); return; }
    setState(() { _busy = true; _error = null; });
    try {
      await appState.register(
        firstName: _firstName.text.trim(),
        email: _email.text.trim(),
        password: _password.text,
        organizationName: _org.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(); // _Root rebuilds to the dashboard
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(controller: _firstName, decoration: const InputDecoration(labelText: 'First name')),
            const SizedBox(height: 12),
            TextField(controller: _org, decoration: const InputDecoration(labelText: 'Practice / organization (optional)')),
            const SizedBox(height: 12),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email')),
            const SizedBox(height: 12),
            TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
            const SizedBox(height: 8),
            CheckboxListTile(
              value: _accepted,
              onChanged: (v) => setState(() => _accepted = v ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              activeColor: Brand.gold,
              title: const Text('I accept the Terms & Privacy Policy'),
            ),
            if (_error != null) Text(_error!, style: const TextStyle(color: Brand.error)),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _busy ? null : _submit,
              child: _busy ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Create Account'),
            ),
          ],
        ),
      ),
    );
  }
}
