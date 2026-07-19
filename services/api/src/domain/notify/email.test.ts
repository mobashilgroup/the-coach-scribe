import { describe, expect, it } from "vitest";
import { createEmailProvider, NoopEmailProvider, parseFrom, SendgridEmailProvider, type FetchLike } from "./email.js";

describe("parseFrom", () => {
  it("extracts the address from a display-name form", () => {
    expect(parseFrom("The Coach Scribe <no-reply@x.com>")).toBe("no-reply@x.com");
    expect(parseFrom("plain@x.com")).toBe("plain@x.com");
  });
});

describe("createEmailProvider", () => {
  it("defaults to noop", () => {
    expect(createEmailProvider({ EMAIL_PROVIDER: "noop", EMAIL_FROM: "a@b.com" }).name).toBe("noop");
  });
  it("selects sendgrid when configured", () => {
    expect(createEmailProvider({ EMAIL_PROVIDER: "sendgrid", EMAIL_PROVIDER_API_KEY: "k", EMAIL_FROM: "a@b.com" }).name).toBe("sendgrid");
  });
});

describe("NoopEmailProvider", () => {
  it("records rather than sends", async () => {
    const p = new NoopEmailProvider();
    await p.send({ to: "x@y.com", subject: "hi" });
    expect(p.sent).toHaveLength(1);
  });
});

describe("SendgridEmailProvider", () => {
  it("posts a well-formed request", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl: FetchLike = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 202, json: async () => ({}), text: async () => "" } as unknown as Response;
    };
    const p = new SendgridEmailProvider({ apiKey: "SG.key", from: "Coach <no-reply@x.com>", fetchImpl });
    await p.send({ to: "c@ex.com", subject: "New message", text: "hello" });
    expect(captured!.url).toMatch(/\/mail\/send$/);
    expect(captured!.init.headers).toMatchObject({ authorization: "Bearer SG.key" });
    const body = JSON.parse(captured!.init.body as string);
    expect(body.personalizations[0].to[0].email).toBe("c@ex.com");
    expect(body.from.email).toBe("no-reply@x.com");
  });
});
