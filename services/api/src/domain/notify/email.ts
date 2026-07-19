/**
 * Email delivery (Spec §22, §25). Interface + a no-op default (so the system
 * runs with no email account) + a SendGrid adapter as the wired example. In-app
 * notifications are always delivered; email is additive and key-guarded.
 */

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface EmailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}

/** Default: records nothing external; logs so dev can see what would be sent. */
export class NoopEmailProvider implements EmailProvider {
  readonly name = "noop";
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
  }
}

export interface SendgridConfig {
  apiKey: string;
  from: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class SendgridEmailProvider implements EmailProvider {
  readonly name = "sendgrid";
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  constructor(private readonly config: SendgridConfig) {
    this.fetchImpl = config.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.baseUrl = config.baseUrl ?? "https://api.sendgrid.com/v3";
  }
  async send(msg: EmailMessage): Promise<void> {
    if (!this.config.apiKey) throw new Error("EMAIL_PROVIDER_API_KEY is required for sendgrid");
    const res = await this.fetchImpl(`${this.baseUrl}/mail/send`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from: { email: parseFrom(this.config.from) },
        subject: msg.subject,
        content: [
          ...(msg.text ? [{ type: "text/plain", value: msg.text }] : []),
          ...(msg.html ? [{ type: "text/html", value: msg.html }] : []),
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`SendGrid send failed (${res.status}): ${detail.slice(0, 200)}`);
    }
  }
}

/** Extract the bare address from a "Name <addr>" from-string. */
export function parseFrom(from: string): string {
  const m = from.match(/<([^>]+)>/u);
  return m ? m[1]! : from.trim();
}

export interface EmailEnv {
  EMAIL_PROVIDER: "noop" | "sendgrid";
  EMAIL_PROVIDER_API_KEY?: string;
  EMAIL_FROM: string;
}

export function createEmailProvider(env: EmailEnv, fetchImpl?: FetchLike): EmailProvider {
  if (env.EMAIL_PROVIDER === "sendgrid") {
    return new SendgridEmailProvider({ apiKey: env.EMAIL_PROVIDER_API_KEY ?? "", from: env.EMAIL_FROM, fetchImpl });
  }
  return new NoopEmailProvider();
}
