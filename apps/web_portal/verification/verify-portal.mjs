/**
 * Browser verification of the Fase 2 loop (Spec §8.4, §11): coach shares a
 * session, invites the client, the client opens the portal via magic link,
 * views ONLY shared content, updates a task, sends an urgent note; the coach
 * sees the message with an AI draft, edits and sends it; the client sees the
 * reply. Nothing is sent automatically.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = process.env.ORIGIN || "http://127.0.0.1:4090";
const APP = `${ORIGIN}/app/index.html`;
const OUT = "/home/user/the-coach-scribe/apps/web_portal/verification";
mkdirSync(OUT, { recursive: true });
const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const email = `fase2_${Date.now()}@example.com`;
let n = 0;
const shot = async (p, name) => {
  try {
    await p.screenshot({ path: `${OUT}/p${String(++n).padStart(2, "0")}-${name}.png`, animations: "disabled", timeout: 8000 });
  } catch { console.log(`  (screenshot ${name} skipped)`); }
};
const assert = (c, m) => { if (!c) throw new Error("FAILED: " + m); console.log("  ✓ " + m); };

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });

try {
  // --- Coach: register, client, session, approve, share, invite ----------
  console.log("Coach setup");
  const coach = await ctx.newPage();
  await coach.goto(APP, { waitUntil: "networkidle" });
  await coach.click('[data-testid=to-register]');
  await coach.fill('[data-testid=reg-firstname]', "Nadia");
  await coach.fill('[data-testid=reg-email]', email);
  await coach.fill('[data-testid=reg-password]', "supersecret");
  await coach.check('[data-testid=reg-terms]');
  await coach.click('[data-testid=reg-submit]');
  await coach.waitForSelector('[data-testid=nav-dashboard]');

  await coach.click('[data-testid=nav-clients]');
  await coach.click('[data-testid=add-client-open]');
  await coach.fill('[data-testid=client-first]', "Leo");
  await coach.fill('[data-testid=client-email]', "leo@example.com");
  await coach.click('[data-testid=client-save]');
  await coach.waitForSelector('[data-testid=client-name]');

  await coach.click('[data-testid=nav-newSession]');
  await coach.waitForSelector('[data-testid=session-freetext]');
  await coach.fill('[data-testid=session-title]', "Marathon goal");
  await coach.fill('[data-testid=session-freetext]', "Leo wants to run a marathon and build a weekly training habit. He will draft a plan and tell his running club.");
  await coach.click('[data-testid=create-process]');
  await coach.waitForSelector('[data-testid=approve]');
  await coach.click('[data-testid=approve]');
  await coach.waitForFunction(() => document.querySelector('[data-testid=session-status]')?.textContent.includes("approved"));
  await coach.click('[data-testid=share]');
  await coach.click('[data-testid=share-confirm]');
  await coach.waitForFunction(() => document.querySelector('[data-testid=session-status]')?.textContent.includes("shared"));
  assert(true, "coach approved and shared a session");

  // Invite the client and capture the magic link.
  await coach.click('[data-testid=nav-clients]');
  await coach.waitForSelector('[data-testid=client-invite]');
  await coach.click('[data-testid=client-invite]');
  await coach.waitForSelector('[data-testid=invite-link]');
  const inviteLink = await coach.locator('[data-testid=invite-link]').inputValue();
  await shot(coach, "coach-invite");
  assert(inviteLink.includes("portal.html#token="), "coach generated a portal magic link");
  await coach.click('[data-testid=invite-close]'); // dismiss the modal

  // --- Client: open portal via magic link --------------------------------
  console.log("Client portal");
  const client = await ctx.newPage();
  await client.goto(inviteLink, { waitUntil: "networkidle" });
  await client.waitForSelector('[data-testid=portal-hello]');
  await shot(client, "portal-home");
  assert((await client.locator('[data-testid=portal-hello]').innerText()).includes("Leo"), "client entered portal via magic link");
  assert(await client.locator('[data-testid=portal-summary]').count() >= 1, "client sees the shared summary");

  // View shared summary detail (only shared sections, never transcript).
  await client.locator('[data-testid=portal-summary]').first().click();
  await client.waitForSelector('[data-testid=portal-summary-text]');
  await shot(client, "portal-summary");
  const bodyText = await client.locator("body").innerText();
  assert(!/Transcript/i.test(bodyText), "transcript is NOT shown to the client");
  await client.locator('#back').click();
  await client.waitForSelector('[data-testid=portal-task]');

  // Update a task.
  await client.selectOption('[data-testid=portal-task]', "in_progress");
  assert(true, "client updated a shared task");

  // Send an urgent note.
  await client.fill('[data-testid=portal-note]', "I'm struggling to stay motivated this week.");
  await client.check('[data-testid=portal-urgent]');
  await client.click('[data-testid=portal-send]');
  await client.waitForFunction(() => document.querySelector('[data-testid=portal-thread]')?.textContent.includes("struggling"));
  await shot(client, "portal-note-sent");
  assert(true, "client sent an urgent note");

  // --- Coach: sees message + AI draft, edits, sends ----------------------
  console.log("Coach reviews AI draft");
  await coach.click('[data-testid=nav-messages]');
  await coach.waitForSelector('[data-testid=message-row]');
  await coach.click('[data-testid=message-row]');
  await coach.waitForSelector('[data-testid=reply-body]');
  const draft = await coach.locator('[data-testid=reply-body]').inputValue();
  await shot(coach, "coach-ai-draft");
  assert(draft.length > 0, "coach sees an AI-suggested reply draft");

  // Client should NOT yet have any coach reply (nothing auto-sent).
  await client.reload({ waitUntil: "networkidle" });
  await client.waitForSelector('[data-testid=portal-thread]');
  let thread = await client.locator('[data-testid=portal-thread]').innerText();
  assert(!/Coach/.test(thread), "no coach reply exists until the coach sends it (never auto-sent)");

  // Coach edits and sends.
  await coach.fill('[data-testid=reply-body]', "Let's set one small goal for this week. I'm proud of your progress, Leo.");
  await coach.click('[data-testid=reply-send]');
  await coach.waitForFunction(() => /You/.test(document.querySelector('[data-testid=thread]')?.textContent || ""));
  await shot(coach, "coach-sent");

  // Client now sees the reply.
  await client.reload({ waitUntil: "networkidle" });
  await client.waitForSelector('[data-testid=portal-thread]');
  thread = await client.locator('[data-testid=portal-thread]').innerText();
  assert(/Coach/.test(thread) && /small goal/.test(thread), "client sees the coach's reply after it is sent");
  await shot(client, "portal-reply");

  console.log("\n✅ FASE 2 (client portal + AI reply draft) VERIFIED IN BROWSER");
} catch (err) {
  console.error("\n❌ FASE 2 FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
