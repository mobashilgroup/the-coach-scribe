import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';

/// App-wide auth/session state. A ChangeNotifier so screens rebuild on login.
class AppState extends ChangeNotifier {
  final ApiClient api = ApiClient();
  String? _token;
  String firstName = 'Coach';

  bool get isAuthenticated => _token != null;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('tcs_token');
    firstName = prefs.getString('tcs_first_name') ?? 'Coach';
    api.token = _token;
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    if (_token == null) {
      await prefs.remove('tcs_token');
      await prefs.remove('tcs_first_name');
    } else {
      await prefs.setString('tcs_token', _token!);
      await prefs.setString('tcs_first_name', firstName);
    }
  }

  Future<void> register({
    required String firstName,
    required String email,
    required String password,
    String? organizationName,
  }) async {
    final res = await api.register(
      firstName: firstName,
      email: email,
      password: password,
      organizationName: organizationName,
    );
    _token = res.accessToken;
    this.firstName = res.firstName;
    api.token = _token;
    await _persist();
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final res = await api.login(email, password);
    _token = res.accessToken;
    firstName = res.firstName;
    api.token = _token;
    await _persist();
    notifyListeners();
  }

  Future<void> signOut() async {
    _token = null;
    api.token = null;
    await _persist();
    notifyListeners();
  }
}

/// Single app-wide instance. Screens import this directly.
final AppState appState = AppState();
