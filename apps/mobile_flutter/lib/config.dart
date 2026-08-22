/// App configuration. The API base URL is provided at build time so the same
/// code targets local dev, staging, and production without edits:
///
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
///
/// (10.0.2.2 is the Android emulator's alias for the host machine's localhost.)
class Config {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000',
  );

  /// Bytes per upload chunk (matches the API's resumable-upload endpoints).
  static const int uploadChunkBytes = 512 * 1024;
}
