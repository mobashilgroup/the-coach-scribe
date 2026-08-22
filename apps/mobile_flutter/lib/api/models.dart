/// Plain data models mirroring the Coach Scribe API responses.

class AuthResult {
  final String accessToken;
  final String userId;
  final String firstName;
  AuthResult({required this.accessToken, required this.userId, required this.firstName});

  factory AuthResult.fromJson(Map<String, dynamic> j) => AuthResult(
        accessToken: j['accessToken'] as String,
        userId: (j['user']?['id'] ?? '') as String,
        firstName: (j['user']?['firstName'] ?? 'Coach') as String,
      );
}

class Client {
  final String id;
  final String firstName;
  final String? lastName;
  final String? email;
  final String portalStatus;
  Client({required this.id, required this.firstName, this.lastName, this.email, this.portalStatus = 'none'});

  String get name => [firstName, lastName].where((s) => s != null && s.isNotEmpty).join(' ');

  factory Client.fromJson(Map<String, dynamic> j) => Client(
        id: j['id'] as String,
        firstName: j['firstName'] as String,
        lastName: j['lastName'] as String?,
        email: j['email'] as String?,
        portalStatus: (j['portalStatus'] ?? 'none') as String,
      );
}

class Session {
  final String id;
  final String? title;
  final String status;
  final String clientId;
  final String inputMethod;
  final DateTime createdAt;
  Session({
    required this.id,
    required this.status,
    required this.clientId,
    required this.inputMethod,
    required this.createdAt,
    this.title,
  });

  factory Session.fromJson(Map<String, dynamic> j) => Session(
        id: j['id'] as String,
        title: j['title'] as String?,
        status: j['status'] as String,
        clientId: j['clientId'] as String,
        inputMethod: (j['inputMethod'] ?? '') as String,
        createdAt: DateTime.tryParse((j['createdAt'] ?? '') as String) ?? DateTime.now(),
      );
}

/// The AI summary content (schema §14.3). Only the fields the app renders.
class Summary {
  final String summary;
  final List<String> topics;
  final List<String> strengths;
  final List<String> obstacles;
  final List<Map<String, dynamic>> actionItems;
  final List<String> reflectionQuestions;
  Summary({
    required this.summary,
    required this.topics,
    required this.strengths,
    required this.obstacles,
    required this.actionItems,
    required this.reflectionQuestions,
  });

  static List<String> _strList(dynamic v) =>
      (v is List) ? v.whereType<String>().toList() : <String>[];

  factory Summary.fromJson(Map<String, dynamic> c) => Summary(
        summary: (c['summary'] ?? '') as String,
        topics: _strList(c['topics']),
        strengths: _strList(c['strengths']),
        obstacles: _strList(c['obstacles']),
        actionItems: (c['action_items'] is List)
            ? (c['action_items'] as List).whereType<Map<String, dynamic>>().toList()
            : <Map<String, dynamic>>[],
        reflectionQuestions: _strList(c['reflection_questions']),
      );
}
