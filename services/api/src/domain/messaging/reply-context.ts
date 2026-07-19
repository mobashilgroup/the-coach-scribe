/**
 * Reply-context minimization (Master Spec §11.6 step 3: "eliminar información
 * que no sea necesaria"). Before sending anything to the model to draft a reply,
 * we reduce the last few approved summaries to only what's needed — the
 * executive summary, topics, and open goal/action titles — and deliberately
 * drop transcripts, private notes, quotes, emotions, and evidence.
 *
 * Pure and unit-tested; no DB, no network.
 */

export interface ApprovedSummaryLike {
  /** The validated summary content_json object. */
  content: Record<string, unknown>;
  createdAt: Date;
}

const MAX_SESSIONS = 3;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function strArray(v: unknown, limit = 6): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, limit) : [];
}

/**
 * Build a minimized, plain-text context block from recent approved summaries.
 * Only the most recent `MAX_SESSIONS` are used. Fields known to carry sensitive
 * or unnecessary detail (transcript, key_quotes, expressed_emotions, private
 * notes) are never included.
 */
export function buildReplyContext(summaries: readonly ApprovedSummaryLike[]): string {
  const recent = [...summaries]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MAX_SESSIONS);

  const blocks = recent.map((s, i) => {
    const c = s.content ?? {};
    const parts: string[] = [];
    const summary = str(c.summary);
    if (summary) parts.push(`Summary: ${summary}`);
    const topics = strArray(c.topics);
    if (topics.length) parts.push(`Topics: ${topics.join(", ")}`);
    const goals = Array.isArray(c.goals)
      ? (c.goals as Array<Record<string, unknown>>).map((g) => str(g.title)).filter(Boolean).slice(0, 4)
      : [];
    if (goals.length) parts.push(`Goals: ${goals.join("; ")}`);
    const actions = Array.isArray(c.action_items)
      ? (c.action_items as Array<Record<string, unknown>>).map((a) => str(a.title)).filter(Boolean).slice(0, 4)
      : [];
    if (actions.length) parts.push(`Open actions: ${actions.join("; ")}`);
    return `Session ${i + 1}:\n${parts.join("\n")}`;
  });

  return blocks.join("\n\n");
}

/** Guard used before drafting: only proceed if the client is linked to a coach. */
export function isClientLinkedToCoach(
  link: { status: string } | null | undefined,
  clientPrimaryCoachId: string,
  coachId: string,
): boolean {
  if (clientPrimaryCoachId === coachId) return true;
  return !!link && link.status === "active";
}
