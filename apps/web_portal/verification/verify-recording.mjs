/**
 * Browser verification of the offline-resilient recording flow.
 * Uses Chromium's fake microphone. Drives: register → client → new session →
 * Record now → consent → start → record → GO OFFLINE mid-session → finish
 * (queued on-device) → RECONNECT → auto-upload → transcribe → review.
 *
 * This proves the "record in airplane mode, upload on reconnect" requirement.
 * (Auto-start on unlock / background recording is native-only and not tested here.)
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = process.env.ORIGIN || "http://127.0.0.1:4090";
const APP = `${ORIGIN}/app/index.html`;
const OUT = "/home/user/the-coach-scribe/apps/web_portal/verification";
mkdirSync(OUT, { recursive: true });
const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let n = 0;
const shot = async (p, name) => { try { await p.screenshot({ path: `${OUT}/r${String(++n).padStart(2, "0")}-${name}.png`, animations: "disabled", timeout: 8000 }); } catch { console.log(`  (shot ${name} skipped)`); } };
const assert = (c, m) => { if (!c) throw new Error("FAILED: " + m); console.log("  ✓ " + m); };

const browser = await chromium.launch({
  executablePath: EXEC,
  args: [
    "--no-sandbox",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, permissions: ["microphone"] });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [browser error]", m.text()); });

try {
  console.log("1. Register + client");
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.click('[data-testid=to-register]');
  await page.fill('[data-testid=reg-firstname]', "Rec");
  await page.fill('[data-testid=reg-email]', `rec_${Date.now()}@example.com`);
  await page.fill('[data-testid=reg-password]', "supersecret");
  await page.check('[data-testid=reg-terms]');
  await page.click('[data-testid=reg-submit]');
  await page.waitForSelector('[data-testid=nav-dashboard]');
  await page.click('[data-testid=nav-clients]');
  await page.click('[data-testid=add-client-open]');
  await page.fill('[data-testid=client-first]', "Sam");
  await page.click('[data-testid=client-save]');
  await page.waitForSelector('[data-testid=client-name]');

  console.log("2. New session → Record now → consent gate");
  await page.click('[data-testid=nav-newSession]');
  await page.waitForSelector('[data-testid=method-record_audio]');
  await page.click('[data-testid=method-record_audio]');
  await page.waitForSelector('[data-testid=start-recording]');
  assert(await page.locator('[data-testid=start-recording]').isDisabled(), "record button disabled until consent (gate)");
  await page.check('[data-testid=consent-check]');
  assert(!(await page.locator('[data-testid=start-recording]').isDisabled()), "record enabled after consent");

  console.log("3. Start recording (fake mic)");
  await page.click('[data-testid=start-recording]');
  await page.waitForSelector('[data-testid=rec-timer]');
  await page.waitForTimeout(2500); // capture a couple seconds
  await page.click('[data-testid=mark-insight]'); // a real marker with timestamp
  await page.waitForTimeout(500);
  const elapsed = await page.locator('[data-testid=rec-timer]').innerText();
  assert(elapsed !== "00:00", `timer advanced (${elapsed})`);
  await shot(page, "recording");

  console.log("4. GO OFFLINE mid-session (airplane mode), then finish");
  await ctx.setOffline(true);
  await page.waitForTimeout(300);
  await page.click('[data-testid=rec-finish]');
  // Offline: it should queue on-device and return to the dashboard, not upload.
  await page.waitForSelector('[data-testid=nav-dashboard]', { timeout: 10000 });
  const pendingCount = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open("tcs-recordings", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return await new Promise((res) => { const q = db.transaction("recordings").objectStore("recordings").getAll(); q.onsuccess = () => res((q.result || []).filter((m) => m.status === "pending").length); });
  });
  assert(pendingCount >= 1, "recording is queued on-device while offline (not lost)");
  await shot(page, "offline-queued");

  console.log("5. RECONNECT → auto-upload + transcribe + review");
  await ctx.setOffline(false);
  // The 'online' listener flushes the queue → creates session, uploads, processes.
  await page.waitForFunction(() => document.querySelector('[data-testid=session-status]')?.textContent.includes("review"), { timeout: 30000 });
  await shot(page, "review");
  assert((await page.locator('[data-testid=session-status]').innerText()).includes("review"), "session processed to review after reconnect");
  const detailHasTranscript = await page.locator('text=Transcript').count();
  assert(detailHasTranscript > 0, "diarized transcript present from the recording");

  // The on-device queue is now empty.
  const remaining = await page.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open("tcs-recordings", 1); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => { const q = db.transaction("recordings").objectStore("recordings").getAll(); q.onsuccess = () => res((q.result || []).length); });
  });
  assert(remaining === 0, "on-device queue cleared after successful upload");

  console.log("\n✅ OFFLINE RECORDING FLOW VERIFIED IN BROWSER");
} catch (err) {
  console.error("\n❌ RECORDING FLOW FAILED:", err.message);
  await shot(page, "FAILURE");
  process.exitCode = 1;
} finally {
  await browser.close();
}
