import 'package:flutter/material.dart';

import 'state/app_state.dart';
import 'theme.dart';
import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await appState.load();
  runApp(const CoachScribeApp());
}

class CoachScribeApp extends StatelessWidget {
  const CoachScribeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'The Coach Scribe',
      debugShowCheckedModeBanner: false,
      theme: Brand.theme(),
      home: const _Root(),
    );
  }
}

/// Decides the first screen and rebuilds when the auth state changes.
class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: appState,
      builder: (context, _) {
        if (!appState.isAuthenticated) return const LoginScreen();
        return const DashboardScreen();
      },
    );
  }
}
