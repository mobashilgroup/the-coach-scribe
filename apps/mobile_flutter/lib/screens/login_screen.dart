import 'package:flutter/material.dart';

import '../state/app_state.dart';
import '../theme.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() { _busy = true; _error = null; });
    try {
      await appState.login(_email.text.trim(), _password.text);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Brand.ink,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 420),
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(color: Brand.surface, borderRadius: BorderRadius.circular(20)),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Center(child: Text('The Coach Scribe', style: serifTitle)),
                const SizedBox(height: 2),
                const Center(
                  child: Text('MOBASHIL GROUP S.A.',
                      style: TextStyle(fontSize: 11, letterSpacing: 1.4, color: Brand.gold)),
                ),
                const SizedBox(height: 22),
                Text('Welcome back, Coach', style: serifTitle.copyWith(fontSize: 20)),
                const SizedBox(height: 12),
                TextField(controller: _email, keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Email')),
                const SizedBox(height: 12),
                TextField(controller: _password, obscureText: true,
                    decoration: const InputDecoration(labelText: 'Password')),
                if (_error != null) Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(_error!, style: const TextStyle(color: Brand.error, fontSize: 14)),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Log In'),
                ),
                const SizedBox(height: 14),
                Center(
                  child: TextButton(
                    onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const RegisterScreen())),
                    child: const Text('No account? Create one'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
