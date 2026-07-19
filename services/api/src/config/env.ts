/**
 * Environment validation (Master Spec §19.5, §21).
 *
 * The API is the ONLY tier that holds secrets. This module validates and types
 * them at boot; a misconfiguration fails fast rather than at first request.
 * Nothing here is ever bundled into a frontend.
 */

import { z } from "zod";

const EnvSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),

  TRANSCRIPTION_PROVIDER: z.enum(["fake", "deepgram", "assemblyai"]).default("fake"),
  ANALYSIS_PROVIDER: z.enum(["fake", "openai"]).default("fake"),
  DEEPGRAM_API_KEY: z.string().optional(),
  DEEPGRAM_MODEL: z.string().default("nova-2"),
  ASSEMBLYAI_API_KEY: z.string().optional(),
  ASSEMBLYAI_MODEL: z.string().default("best"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),

  // Notifications delivery (in-app always on; these add email/push).
  EMAIL_PROVIDER: z.enum(["noop", "sendgrid"]).default("noop"),
  EMAIL_PROVIDER_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("The Coach Scribe <no-reply@thecoachscribe.com>"),
  PUSH_PROVIDER: z.enum(["noop", "fcm"]).default("noop"),

  // Google OAuth (sign-in + future Calendar/Drive).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  DEFAULT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  AUDIO_DELETE_AFTER_HOURS: z.coerce.number().int().positive().default(24),
  MAX_SESSION_MINUTES: z.coerce.number().int().positive().default(60),

  CONSENT_TEXT_VERSION: z.string().default("v1"),

  // Comma-separated emails allowed into the platform admin console (Spec §26).
  ADMIN_EMAILS: z.string().default(""),

  // Local object storage base dir (dev). Production uses S3-compatible config.
  STORAGE_DIR: z.string().default(".storage"),

  // Background retention sweep cadence (seconds).
  RETENTION_SWEEP_SECONDS: z.coerce.number().int().positive().default(3600),

  // Optional queue driver for async processing at scale.
  REDIS_URL: z.string().optional(),
  QUEUE_DRIVER: z.enum(["inline", "bullmq"]).default("inline"),

  // Optional path to a built coach web app to serve as static files.
  WEB_DIST_DIR: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // Guard: real providers require their keys.
  if (parsed.data.TRANSCRIPTION_PROVIDER === "deepgram" && !parsed.data.DEEPGRAM_API_KEY) {
    throw new Error("TRANSCRIPTION_PROVIDER=deepgram requires DEEPGRAM_API_KEY");
  }
  if (parsed.data.TRANSCRIPTION_PROVIDER === "assemblyai" && !parsed.data.ASSEMBLYAI_API_KEY) {
    throw new Error("TRANSCRIPTION_PROVIDER=assemblyai requires ASSEMBLYAI_API_KEY");
  }
  if (parsed.data.ANALYSIS_PROVIDER === "openai" && !parsed.data.OPENAI_API_KEY) {
    throw new Error("ANALYSIS_PROVIDER=openai requires OPENAI_API_KEY");
  }
  cached = parsed.data;
  return cached;
}

/** Test helper to reset the memoized env. */
export function resetEnvCache(): void {
  cached = null;
}
