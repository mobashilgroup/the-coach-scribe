import 'package:flutter/material.dart';

/// The Coach Scribe brand: black / white / gold (Spec §6).
class Brand {
  static const Color ink = Color(0xFF111111);
  static const Color night = Color(0xFF14213D);
  static const Color gold = Color(0xFFD5A640);
  static const Color goldSoft = Color(0xFFF1D58A);
  static const Color bg = Color(0xFFF7F7F5);
  static const Color surface = Colors.white;
  static const Color muted = Color(0xFF5F6368);
  static const Color line = Color(0xFFE6E6E0);
  static const Color success = Color(0xFF198754);
  static const Color error = Color(0xFFC62828);

  static ThemeData theme() {
    final base = ThemeData(useMaterial3: true, brightness: Brightness.light);
    return base.copyWith(
      scaffoldBackgroundColor: bg,
      colorScheme: base.colorScheme.copyWith(
        primary: gold,
        secondary: night,
        surface: surface,
        error: error,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: ink,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      textTheme: base.textTheme.apply(bodyColor: ink, displayColor: ink),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: gold, width: 2),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: gold,
          foregroundColor: ink,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
    );
  }
}

/// Small helper for section headings in a serif face when available.
const TextStyle serifTitle = TextStyle(
  fontFamily: 'Georgia',
  fontSize: 22,
  fontWeight: FontWeight.w600,
);
