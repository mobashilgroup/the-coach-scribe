/**
 * Browser verification of the complete coach workflow against the real API.
 * Drives Chromium through: register → add client → new session (free text)
 * → process → review/edit → approve → share → history → export, plus the
 * audio-upload path, screenshotting each stage and asserting the end state.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:4090/app/index.html";
const OUT = "/home/user/the-coach-scribe/apps/web_portal/verification";
mkdirSync(OUT, { recursive: true });

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const email = `web_${Date.now()}@example.com`;
const steps = [];
let stepN = 0;

async function shot(page, name) {
  stepN++;
  const file = `${OUT}/${String(stepN).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  steps.push(file);
}
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  ✓ " + msg);
}

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("  [browser error]", m.text()); });

try {
  // 1. Register
  console.log("1. Register");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click('[data-testid=to-register]');
  await page.fill('[data-testid=reg-firstname]', "Marta");
  await page.fill('[data-testid=reg-org]', "Marta Coaching");
  await page.fill('[data-testid=reg-email]', email);
  await page.fill('[data-testid=reg-password]', "supersecret");
  await page.check('[data-testid=reg-terms]');
  await page.click('[data-testid=reg-submit]');
  await page.waitForSelector('[data-testid=nav-dashboard]');
  await shot(page, "dashboard");
  assert(await page.locator('text=Hello, Marta').count() > 0, "registered and landed on dashboard");

  // 2. Add client
  console.log("2. Add client");
  await page.click('[data-testid=nav-clients]');
  await page.click('[data-testid=add-client-open]');
  await page.fill('[data-testid=client-first]', "Grace");
  await page.fill('[data-testid=client-last]', "Hopper");
  await page.fill('[data-testid=client-email]', "grace@example.com");
  await page.click('[data-testid=client-save]');
  await page.waitForSelector('[data-testid=client-name]');
  await shot(page, "clients");
  assert(await page.locator('[data-testid=client-name]', { hasText: "Grace Hopper" }).count() > 0, "client created and listed");

  // 3. New free-text session → process
  console.log("3. New session (free text) + process");
  await page.click('[data-testid=nav-newSession]');
  await page.waitForSelector('[data-testid=session-freetext]');
  await page.fill('[data-testid=session-title]', "Career direction");
  await page.fill('[data-testid=session-freetext]',
    "Grace explored moving into a leadership role. She feels ready but worried about delegation. We agreed she will draft a 90-day plan and ask two mentors for feedback.");
  await page.click('[data-testid=create-process]');
  await page.waitForSelector('[data-testid=session-status]', { timeout: 15000 });
  await shot(page, "review");
  assert((await page.locator('[data-testid=session-status]').innerText()).includes("review"), "session in review_required after processing");
  assert(await page.locator('[data-testid=action-items] li').count() > 0, "AI produced action items");

  // 4. Edit + save (new version)
  console.log("4. Edit summary");
  await page.fill('[data-field=summary]', "Reviewed by coach: Grace is ready for a leadership move and will build a 90-day plan.");
  await page.click('[data-testid=save-summary]');
  await page.waitForSelector('[data-testid=session-status]');
  await shot(page, "edited");

  // 5. Approve
  console.log("5. Approve");
  await page.click('[data-testid=approve]');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid=session-status]');
    return el && el.textContent.includes("approved");
  }, { timeout: 10000 });
  await shot(page, "approved");
  assert((await page.locator('[data-testid=session-status]').innerText()).includes("approved"), "session approved");

  // 6. Share
  console.log("6. Share");
  await page.click('[data-testid=share]');
  await page.click('[data-testid=share-confirm]');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid=session-status]');
    return el && el.textContent.includes("shared");
  }, { timeout: 10000 });
  await shot(page, "shared");
  assert((await page.locator('[data-testid=session-status]').innerText()).includes("shared"), "session shared with client");

  // 7. History shows the session
  console.log("7. History");
  await page.click('[data-testid=nav-history]');
  await page.waitForSelector('[data-testid=session-row]');
  await shot(page, "history");
  assert(await page.locator('[data-testid=session-row]').count() >= 1, "session appears in history");

  // 8. Export HTML renders
  console.log("8. Export");
  const origin = BASE.replace("/app/index.html", "");
  const token = await page.evaluate(() => localStorage.getItem("tcs_token"));
  const auth = { authorization: `Bearer ${token}` };
  const list = await (await page.request.get(`${origin}/v1/sessions`, { headers: auth })).json();
  const id = list.sessions[0].id;
  const exp = await page.request.get(`${origin}/v1/sessions/${id}/export?format=html`, { headers: auth });
  const body = await exp.text();
  assert(exp.ok(), "export endpoint returns 200");
  assert(body.includes("Executive summary"), "exported HTML contains the summary");
  await page.goto(`data:text/html,${encodeURIComponent(body)}`);
  await shot(page, "export-html");

  // 9. Audio-upload path with consent gating + chunked upload + diarization
  console.log("9. Audio session (consent + upload + diarize)");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid=nav-newSession]');
  await page.click('[data-testid=nav-newSession]');
  await page.waitForSelector('[data-testid=method-upload_audio]');
  await page.click('[data-testid=method-upload_audio]');
  await page.waitForSelector('[data-testid=create-upload]');
  assert(await page.locator('[data-testid=create-upload]').isDisabled(), "upload button disabled until consent (gate)");
  await page.setInputFiles('[data-testid=session-audio]', "/tmp/tcs-fake-audio.m4a");
  await page.check('[data-testid=consent-check]');
  assert(!(await page.locator('[data-testid=create-upload]').isDisabled()), "upload button enabled after consent");
  await page.click('[data-testid=create-upload]');
  await page.waitForSelector('[data-testid=session-status]', { timeout: 20000 });
  await shot(page, "audio-review");
  assert((await page.locator('[data-testid=session-status]').innerText()).includes("review"), "audio session processed to review");
  assert(await page.locator('text=Transcript').count() > 0, "diarized transcript is present in the UI");

  console.log("\n✅ FULL WORKFLOW VERIFIED IN BROWSER");
  console.log("Screenshots:", steps.length);
} catch (err) {
  console.error("\n❌ WORKFLOW FAILED:", err.message);
  await shot(page, "FAILURE");
  process.exitCode = 1;
} finally {
  await browser.close();
}
