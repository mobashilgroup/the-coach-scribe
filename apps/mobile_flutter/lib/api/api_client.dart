import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;

import '../config.dart';
import 'models.dart';

/// Thrown for non-2xx API responses, carrying the server's error code/message.
class ApiException implements Exception {
  final int statusCode;
  final String code;
  final String message;
  ApiException(this.statusCode, this.code, this.message);
  @override
  String toString() => message;
}

/// Thin REST client for the Coach Scribe API. Holds the bearer token in memory;
/// persistence lives in AppState. No secrets beyond the coach's own token.
class ApiClient {
  ApiClient({String? token}) : _token = token;
  String? _token;

  set token(String? t) => _token = t;

  Map<String, String> _headers({bool json = true}) => {
        if (json) 'content-type': 'application/json',
        if (_token != null) 'authorization': 'Bearer $_token',
      };

  Uri _u(String path) => Uri.parse('${Config.apiBaseUrl}$path');

  Never _fail(http.Response r) {
    String code = 'error', message = 'Request failed (${r.statusCode})';
    try {
      final e = (jsonDecode(r.body) as Map<String, dynamic>)['error'];
      if (e is Map) {
        code = (e['code'] ?? code) as String;
        message = (e['message'] ?? message) as String;
      }
    } catch (_) {}
    throw ApiException(r.statusCode, code, message);
  }

  Map<String, dynamic> _json(http.Response r) {
    if (r.statusCode < 200 || r.statusCode >= 300) _fail(r);
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  // --- Auth ---------------------------------------------------------------
  Future<AuthResult> register({
    required String firstName,
    required String email,
    required String password,
    String? organizationName,
  }) async {
    final r = await http.post(_u('/v1/auth/register'),
        headers: _headers(),
        body: jsonEncode({
          'firstName': firstName,
          'email': email,
          'password': password,
          'acceptedTerms': true,
          if (organizationName != null && organizationName.isNotEmpty) 'organizationName': organizationName,
        }));
    return AuthResult.fromJson(_json(r));
  }

  Future<AuthResult> login(String email, String password) async {
    final r = await http.post(_u('/v1/auth/login'),
        headers: _headers(), body: jsonEncode({'email': email, 'password': password}));
    return AuthResult.fromJson(_json(r));
  }

  // --- Clients ------------------------------------------------------------
  Future<List<Client>> clients() async {
    final r = await http.get(_u('/v1/clients'), headers: _headers());
    return ((_json(r)['clients'] as List)).map((e) => Client.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Client> createClient({required String firstName, String? lastName, String? email}) async {
    final r = await http.post(_u('/v1/clients'),
        headers: _headers(),
        body: jsonEncode({
          'firstName': firstName,
          if (lastName != null && lastName.isNotEmpty) 'lastName': lastName,
          if (email != null && email.isNotEmpty) 'email': email,
        }));
    return Client.fromJson(_json(r)['client'] as Map<String, dynamic>);
  }

  // --- Sessions -----------------------------------------------------------
  Future<List<Session>> sessions() async {
    final r = await http.get(_u('/v1/sessions'), headers: _headers());
    return ((_json(r)['sessions'] as List)).map((e) => Session.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Session> createSession({
    required String clientId,
    required String inputMethod,
    String? title,
    String? freeText,
    int? durationSeconds,
  }) async {
    final r = await http.post(_u('/v1/sessions'),
        headers: _headers(),
        body: jsonEncode({
          'clientId': clientId,
          'inputMethod': inputMethod,
          'outputLanguage': 'en',
          if (title != null && title.isNotEmpty) 'title': title,
          if (freeText != null) 'freeText': freeText,
          if (durationSeconds != null) 'durationSeconds': durationSeconds,
        }));
    return Session.fromJson(_json(r)['session'] as Map<String, dynamic>);
  }

  Future<void> recordConsent(String sessionId) async {
    final r = await http.post(_u('/v1/sessions/$sessionId/consent'),
        headers: _headers(), body: jsonEncode({'confirmed': true, 'method': 'coach_checkbox'}));
    _json(r);
  }

  Future<String> uploadInit(String sessionId,
      {required String fileName, required String mimeType, required int totalSize, required int totalChunks}) async {
    final r = await http.post(_u('/v1/sessions/$sessionId/upload/init'),
        headers: _headers(),
        body: jsonEncode({
          'fileName': fileName,
          'mimeType': mimeType,
          'totalSize': totalSize,
          'totalChunks': totalChunks,
        }));
    return _json(r)['uploadId'] as String;
  }

  Future<void> uploadChunk(String sessionId, String uploadId, int index, Uint8List bytes) async {
    final r = await http.put(_u('/v1/sessions/$sessionId/upload/$uploadId/chunk/$index'),
        headers: {'content-type': 'application/octet-stream', if (_token != null) 'authorization': 'Bearer $_token'},
        body: bytes);
    if (r.statusCode < 200 || r.statusCode >= 300) _fail(r);
  }

  Future<void> uploadComplete(String sessionId, String uploadId, {required int totalChunks, required String fileName}) async {
    final r = await http.post(_u('/v1/sessions/$sessionId/upload/$uploadId/complete'),
        headers: _headers(), body: jsonEncode({'totalChunks': totalChunks, 'fileName': fileName}));
    _json(r);
  }

  Future<void> processSession(String sessionId) async {
    final r = await http.post(_u('/v1/sessions/$sessionId/process'), headers: _headers(), body: '{}');
    _json(r);
  }

  Future<Summary?> latestSummary(String sessionId) async {
    final r = await http.get(_u('/v1/sessions/$sessionId'), headers: _headers());
    final data = _json(r);
    final s = data['summary'];
    if (s == null) return null;
    return Summary.fromJson((s['contentJson'] ?? {}) as Map<String, dynamic>);
  }

  Future<void> approve(String sessionId) async {
    final r = await http.post(_u('/v1/sessions/$sessionId/summary/approve'), headers: _headers(), body: '{}');
    _json(r);
  }

  Future<void> share(String sessionId) async {
    final r = await http.post(_u('/v1/sessions/$sessionId/share'),
        headers: _headers(),
        body: jsonEncode({
          'include': {'summary': true, 'topics': true, 'tasks': true, 'goals': true},
          'channel': 'portal',
        }));
    _json(r);
  }
}
