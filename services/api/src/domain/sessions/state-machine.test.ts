import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  consumesQuotaOnEnter,
  InvalidTransitionError,
  isFailure,
  nextStates,
  type SessionStatus,
} from "./state-machine.js";

describe("session state machine", () => {
  it("walks the full happy path", () => {
    const path: SessionStatus[] = [
      "draft",
      "consent_pending",
      "consented",
      "recording",
      "uploaded",
      "transcribing",
      "transcription_ready",
      "summarizing",
      "review_required",
      "approved",
      "shared",
      "archived",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("recording", "shared")).toBe(false);
    expect(canTransition("summarizing", "approved")).toBe(false);
  });

  it("forbids auto-share: review_required cannot jump straight to shared", () => {
    // Spec §14.5 / §8: sharing requires an explicit human approval first.
    expect(canTransition("review_required", "shared")).toBe(false);
    expect(canTransition("review_required", "approved")).toBe(true);
    expect(canTransition("approved", "shared")).toBe(true);
  });

  it("allows retry from failure states back into the pipeline", () => {
    expect(canTransition("failed_transcription", "transcribing")).toBe(true);
    expect(canTransition("failed_summary", "summarizing")).toBe(true);
    expect(canTransition("failed_upload", "uploading")).toBe(true);
  });

  it("assertTransition throws a typed error on illegal transitions", () => {
    expect(() => assertTransition("draft", "shared")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("draft", "recording")).not.toThrow();
  });

  it("deleted is terminal", () => {
    expect(nextStates("deleted")).toHaveLength(0);
  });

  it("consumes quota only when entering transcribing", () => {
    expect(consumesQuotaOnEnter("transcribing")).toBe(true);
    expect(consumesQuotaOnEnter("recording")).toBe(false);
    expect(consumesQuotaOnEnter("review_required")).toBe(false);
  });

  it("classifies failure states", () => {
    expect(isFailure("failed_summary")).toBe(true);
    expect(isFailure("approved")).toBe(false);
  });
});
