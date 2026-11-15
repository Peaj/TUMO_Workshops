// Pocket alerts: section changes reach a locked phone through the native ntfy app.
// Chrome freezes the page soon after the screen turns off, so instead of firing from
// the page, every future section start of a running session is scheduled in advance
// on ntfy.sh (POST with "delay"), and rescheduled whenever this device changes the clock.
//
// Verified against ntfy.sh with curl (live JSON stream + poll):
// - A later POST with the same sequence_id replaces a scheduled message, and
//   DELETE /<topic>/<sequence_id> cancels it, BUT only once the first POST has been
//   persisted: replacing or deleting within milliseconds delivered both / the deleted
//   one. Hence MIN_GAP_MS between scheduling runs.
// - Anonymous limits: 60 requests burst, refill 1 per 5 s, 250 messages per day.

import * as clock from "./clock.js";
import * as data from "./data.js";
import * as settings from "./settings.js";
import * as sync from "./sync.js";
import { t, tx } from "./i18n.js";
import { load, save } from "./store.js";
import { emitter, randomCode } from "./util.js";

const BASE = "https://ntfy.sh/";
const DEBOUNCE_MS = 1500;
const MIN_GAP_MS = 3000; // between runs, so a replace/delete never races its own publish
const MIN_AHEAD_MS = 12000; // ntfy needs a delay of at least 10 s

const events = emitter();
let localCode = load("alertCode", null);
if (!localCode) {
  localCode = randomCode(12);
  save("alertCode", localCode);
}
const scheduled = load("pushScheduled", {}); // sequence id -> { topic, at (unix seconds) }
let status = "idle"; // idle | ok | error
let timer = null;
let busy = false;
let again = false;
let lastRunEnd = 0;

/** fn(status) when the scheduling state changes. */
export const onStatus = events.on;
export const getStatus = () => status;
export const scheduledCount = () => Object.keys(scheduled).length;

/** Shared with the sync room if there is one, so both devices address the same topic. */
export const topic = () => `tumo-al-${sync.getRoom() || localCode}`;
export const topicUrl = () => `${BASE}${topic()}`;

function setStatus(next) {
  status = next;
  events.emit(status);
}

const appUrl = () => `${location.origin}${location.pathname}`;

/** The messages that should be scheduled now: sequence id -> { at, title, message, priority }. */
async function wanted() {
  const want = new Map();
  const c = clock.get();
  if (!settings.get("pocket") || !c || !c.running) return want;
  const result = await data.getSession(c.workshop, c.session);
  if (!result) return want;
  const { session } = result;
  const now = Date.now();
  const prefix = `${c.workshop}-s${c.session}`;
  const preWarn = settings.get("preWarn");
  const add = (id, ms, message) => {
    if (ms - now >= MIN_AHEAD_MS) want.set(id, { ...message, at: Math.round(ms / 1000) });
  };
  session.sections.forEach((section, i) => {
    if (i > 0) {
      const lines = section.items.slice(0, 3).map((item) => tx(item.text));
      add(`${prefix}-${i}`, c.startedAt + section.start, {
        title: `${tx(section.title)} · ${t("min", { n: section.minutes })}`,
        message: lines.length ? lines.join("\n") : tx(section.title),
        priority: 4,
      });
    }
    if (preWarn && section.minutes > preWarn) {
      add(`${prefix}-${i}-pre`, c.startedAt + section.end - preWarn * 60000, { title: t("preWarnTitle", { n: preWarn }), message: tx(section.title), priority: 3 });
    }
  });
  add(`${prefix}-${session.sections.length}`, c.startedAt + session.total, { title: t("pushDone"), message: tx(session.title), priority: 4 });
  return want;
}

/** Returns "ok", "fail" or "limit" (429: stop for this run). */
async function call(url, options) {
  try {
    const response = await fetch(url, options);
    if (response.status === 429) return "limit";
    return response.ok ? "ok" : "fail";
  } catch {
    return "fail";
  }
}

async function reconcile() {
  const want = await wanted();
  const target = topic();
  const now = Date.now();
  let failed = false;

  // Cancel what is no longer wanted. Past entries were already delivered: just forget them.
  for (const [id, entry] of Object.entries(scheduled)) {
    if (want.has(id) && entry.topic === target) continue;
    if (entry.at * 1000 > now) {
      const result = await call(`${BASE}${entry.topic}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (result !== "ok") {
        failed = true;
        if (result === "limit") break;
        continue;
      }
    }
    delete scheduled[id];
    save("pushScheduled", scheduled);
  }

  // Schedule what is new or moved. Same id = replace on ntfy, never a duplicate.
  if (!failed) {
    for (const [id, message] of want) {
      const entry = scheduled[id];
      if (entry && entry.topic === target && entry.at === message.at) continue;
      // Plain text body, no custom headers: no CORS preflight.
      const body = JSON.stringify({ topic: target, title: message.title, message: message.message, delay: String(message.at), sequence_id: id, priority: message.priority, click: appUrl() });
      const result = await call(BASE, { method: "POST", body });
      if (result !== "ok") {
        failed = true;
        if (result === "limit") break;
        continue;
      }
      scheduled[id] = { topic: target, at: message.at };
      save("pushScheduled", scheduled);
    }
  }
  setStatus(failed ? "error" : "ok");
}

async function run() {
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    await reconcile();
  } finally {
    busy = false;
    lastRunEnd = Date.now();
    if (again) {
      again = false;
      request();
    }
  }
}

/** Call after this device changed the clock, the room, or a relevant setting. Debounced. */
export function request() {
  clearTimeout(timer);
  timer = setTimeout(run, Math.max(DEBOUNCE_MS, lastRunEnd + MIN_GAP_MS - Date.now()));
}

/** One test message, delivered in 15 s. Resolves to true if ntfy accepted it. */
export async function sendTest() {
  const body = JSON.stringify({ topic: topic(), title: t("pushTestTitle"), message: t("pushTestBody"), delay: "15s", sequence_id: `test-${randomCode(8)}`, priority: 4, click: appUrl() });
  const ok = (await call(BASE, { method: "POST", body })) === "ok";
  setStatus(ok ? "ok" : "error");
  return ok;
}
