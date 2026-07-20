/* Offline-resilient session recorder.
 *
 * Captures microphone audio with MediaRecorder, writing each chunk straight to
 * IndexedDB so nothing is lost if the network drops, the tab reloads, or the
 * phone goes into airplane mode mid-session. The chunks are uploaded later by
 * app.js via the API's resumable-upload endpoints once connectivity returns.
 *
 * What a browser CANNOT do (native app only): auto-start recording when the
 * phone unlocks, or keep recording in the background. Here, recording needs one
 * tap to begin — but once begun, it survives going offline. */

const DB_NAME = "tcs-recordings";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("recordings")) db.createObjectStore("recordings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: ["recordingId", "index"] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}
function done(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function saveMeta(meta) {
  const db = await openDb();
  const store = tx(db, "recordings", "readwrite");
  store.put(meta);
  await done(store.transaction);
}

export async function getMeta(id) {
  const db = await openDb();
  return new Promise((resolve) => {
    const r = tx(db, "recordings", "readonly").get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => resolve(null);
  });
}

export async function listPending() {
  const db = await openDb();
  return new Promise((resolve) => {
    const r = tx(db, "recordings", "readonly").getAll();
    r.onsuccess = () => resolve((r.result || []).filter((m) => m.status === "pending"));
    r.onerror = () => resolve([]);
  });
}

async function putChunk(db, recordingId, index, blob) {
  const store = tx(db, "chunks", "readwrite");
  store.put({ recordingId, index, blob });
  await done(store.transaction);
}

export async function getChunks(recordingId) {
  const db = await openDb();
  return new Promise((resolve) => {
    const out = [];
    const range = IDBKeyRange.bound([recordingId, -Infinity], [recordingId, Infinity]);
    const req = tx(db, "chunks", "readonly").openCursor(range);
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { out.push(cur.value); cur.continue(); }
      else resolve(out.sort((a, b) => a.index - b.index).map((c) => c.blob));
    };
    req.onerror = () => resolve([]);
  });
}

export async function deleteRecording(recordingId) {
  const db = await openDb();
  const meta = tx(db, "recordings", "readwrite");
  meta.delete(recordingId);
  const chunks = db.transaction("chunks", "readwrite").objectStore("chunks");
  const range = IDBKeyRange.bound([recordingId, -Infinity], [recordingId, Infinity]);
  const cur = chunks.openCursor(range);
  cur.onsuccess = () => { const c = cur.result; if (c) { c.delete(); c.continue(); } };
  await done(meta.transaction);
}

/** Pick a MediaRecorder mime type the browser actually supports. */
export function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

export class SessionRecorder {
  constructor({ recordingId, onTick, onLevel }) {
    this.recordingId = recordingId;
    this.onTick = onTick || (() => {});
    this.onLevel = onLevel || (() => {});
    this.mimeType = pickMimeType();
    this.index = 0;
    this.markers = [];
    this._startedAt = 0;
    this._accumMs = 0; // elapsed across pauses
    this._db = null;
    this._stream = null;
    this._rec = null;
    this._audioCtx = null;
    this._raf = 0;
    this._timer = 0;
    this._writes = []; // in-flight IndexedDB chunk writes
  }

  get elapsedMs() {
    const running = this._rec && this._rec.state === "recording" ? Date.now() - this._startedAt : 0;
    return this._accumMs + running;
  }

  async start() {
    this._db = await openDb();
    this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._rec = new MediaRecorder(this._stream, { mimeType: this.mimeType });
    this._rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this._writes.push(putChunk(this._db, this.recordingId, this.index++, e.data));
      }
    };
    this._rec.start(5000); // 5s chunks → written to IndexedDB as they arrive
    this._startedAt = Date.now();
    this._setupMeter();
    this._timer = setInterval(() => this.onTick(this.elapsedMs), 250);
  }

  _setupMeter() {
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this._audioCtx.createMediaStreamSource(this._stream);
      const analyser = this._audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        this.onLevel(Math.min(1, peak / 128));
        this._raf = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      /* level meter is best-effort */
    }
  }

  pause() {
    if (this._rec && this._rec.state === "recording") {
      this._rec.pause();
      this._accumMs += Date.now() - this._startedAt;
    }
  }
  resume() {
    if (this._rec && this._rec.state === "paused") {
      this._rec.resume();
      this._startedAt = Date.now();
    }
  }

  mark(type) {
    this.markers.push({ type, tMs: this.elapsedMs });
    return this.markers.length;
  }

  async stop() {
    const durationMs = this.elapsedMs;
    await new Promise((resolve) => {
      this._rec.onstop = resolve;
      try { this._rec.stop(); } catch { resolve(); }
    });
    await Promise.all(this._writes); // ensure the final chunk reached IndexedDB
    clearInterval(this._timer);
    cancelAnimationFrame(this._raf);
    if (this._audioCtx) this._audioCtx.close().catch(() => {});
    if (this._stream) this._stream.getTracks().forEach((t) => t.stop());
    return { chunkCount: this.index, mimeType: this.mimeType, durationMs, markers: this.markers };
  }
}
