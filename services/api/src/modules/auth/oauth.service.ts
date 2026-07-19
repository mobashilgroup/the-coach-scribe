/**
 * Google OAuth sign-in (Spec §22.1). Authorization-code flow: build a consent
 * URL, exchange the code at Google's token endpoint, and read the id_token
 * (received directly from Google over TLS) for the user's identity.
 *
 * `fetch` is injectable so the exchange is unit-tested without network or a real
 * client. Guarded: routes return 501 until GOOGLE_CLIENT_ID/SECRET are set.
 */

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: FetchLike;
  tokenUrl?: string;
}

export interface GoogleIdentity {
  email: string;
  firstName: string;
  lastName?: string;
  subject: string;
}

/** Decode a JWT payload (no signature check — the token came straight from Google). */
export function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed id_token");
  const json = Buffer.from(parts[1]!, "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

export class GoogleOAuthService {
  private readonly fetchImpl: FetchLike;
  private readonly tokenUrl: string;
  constructor(private readonly config: GoogleConfig) {
    this.fetchImpl = config.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.tokenUrl = config.tokenUrl ?? "https://oauth2.googleapis.com/token";
  }

  authUrl(state: string): string {
    const q = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleIdentity> {
    const res = await this.fetchImpl(this.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Google token exchange failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as { id_token?: string };
    if (!data.id_token) throw new Error("Google token response missing id_token");
    const payload = decodeJwtPayload(data.id_token);
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!email) throw new Error("Google id_token missing email");
    return {
      email,
      firstName: (payload.given_name as string) || (payload.name as string) || email.split("@")[0]!,
      lastName: (payload.family_name as string) || undefined,
      subject: String(payload.sub ?? ""),
    };
  }
}
