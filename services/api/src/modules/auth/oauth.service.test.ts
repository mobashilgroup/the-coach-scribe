import { describe, expect, it } from "vitest";
import { decodeJwtPayload, GoogleOAuthService, type FetchLike } from "./oauth.service.js";

function idToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.sig`;
}

describe("decodeJwtPayload", () => {
  it("decodes the payload segment", () => {
    const p = decodeJwtPayload(idToken({ email: "a@b.com", sub: "123" }));
    expect(p.email).toBe("a@b.com");
  });
  it("rejects a malformed token", () => {
    expect(() => decodeJwtPayload("not.a")).toThrow();
  });
});

describe("GoogleOAuthService", () => {
  const cfg = { clientId: "cid", clientSecret: "secret", redirectUri: "https://app/cb" };

  it("builds a consent URL with the expected scopes", () => {
    const svc = new GoogleOAuthService(cfg);
    const url = svc.authUrl("state123");
    expect(url).toMatch(/accounts\.google\.com/);
    expect(url).toMatch(/scope=openid\+email\+profile/);
    expect(url).toMatch(/state=state123/);
  });

  it("exchanges a code and extracts identity from the id_token", async () => {
    let sentBody = "";
    const fetchImpl: FetchLike = async (_url, init) => {
      sentBody = (init.body as string) ?? "";
      return {
        ok: true,
        status: 200,
        json: async () => ({ id_token: idToken({ email: "coach@ex.com", given_name: "Ada", family_name: "L", sub: "sub-1" }) }),
        text: async () => "",
      } as unknown as Response;
    };
    const svc = new GoogleOAuthService({ ...cfg, fetchImpl });
    const id = await svc.exchangeCode("auth-code");
    expect(id.email).toBe("coach@ex.com");
    expect(id.firstName).toBe("Ada");
    expect(id.subject).toBe("sub-1");
    expect(sentBody).toMatch(/grant_type=authorization_code/);
    expect(sentBody).toMatch(/code=auth-code/);
  });

  it("throws when the token response has no id_token", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" }) as unknown as Response;
    const svc = new GoogleOAuthService({ ...cfg, fetchImpl });
    await expect(svc.exchangeCode("c")).rejects.toThrow(/missing id_token/);
  });
});
