// Optional sync between devices through ntfy.sh (no account). Verified against ntfy.sh:
// POST/GET/SSE all answer with "Access-Control-Allow-Origin: *"; a plain-text POST body
// needs no preflight. Cached messages are kept 12 h.
//
// Message: { v: 1, from, at, type: "clock", clock, group: { id, name } }
//          { v: 1, from, at, type: "ticks", group, groupName, workshop, session, ticks }
// Last writer wins by `at`; own messages are ignored. Failures never block the UI.

import { load, save } from "./store.js";
import { emitter, randomCode } from "./util.js";

const BASE = "https://ntfy.sh/";
const TOPIC_PREFIX = "tumo-ws-";
const CODE = /^[a-z0-9]{10,32}$/;
const DEBOUNCE_MS = 500;

const statusEvents = emitter();
let deviceId = load("device", null);
if (!deviceId) {
  deviceId = randomCode(12);
  save("device", deviceId);
}
let room = load("room", null);
let status = "off"; // off | connecting | live | offline
let source = null;
let lastId = null;
let retryTimer = null;
let retryDelay = 5000;
let handler = () => {};
const pending = new Map(); // key -> message waiting to be (re)sent
const timers = new Map(); // key -> debounce timer

export const onStatus = statusEvents.on;
export const getStatus = () => status;
export const getRoom = () => room;
export const isValidCode = (code) => CODE.test(code);
export const normalizeCode = (code) => String(code || "").trim().toLowerCase();

export function roomLink(code = room) {
  return `${location.origin}${location.pathname}?room=${code}`;
}

function setStatus(next) {
  if (status === next) return;
  status = next;
  statusEvents.emit(status);
}

const topicUrl = () => `${BASE}${TOPIC_PREFIX}${room}`;

function receive(raw) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }
  if (event.event !== "message" || typeof event.message !== "string") return;
  if (event.id) lastId = event.id;
  let message;
  try {
    message = JSON.parse(event.message);
  } catch {
    return;
  }
  if (!message || message.v !== 1 || message.from === deviceId || typeof message.at !== "number") return;
  try {
    handler(message);
  } catch {
    // A bad message must not break the connection.
  }
}

async function poll() {
  const response = await fetch(`${topicUrl()}/json?poll=1&since=12h`, { cache: "no-store" });
  if (!response.ok) throw new Error(`poll ${response.status}`);
  (await response.text()).split("\n").filter(Boolean).forEach(receive);
}

function closeSource() {
  if (source) {
    source.close();
    source = null;
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 60000);
}

async function connect() {
  clearTimeout(retryTimer);
  closeSource();
  if (!room) {
    setStatus("off");
    return;
  }
  if (!navigator.onLine) {
    setStatus("offline");
    return;
  }
  setStatus("connecting");
  const forRoom = room;
  try {
    await poll();
  } catch {
    if (room === forRoom) {
      setStatus("offline");
      scheduleRetry();
    }
    return;
  }
  if (room !== forRoom) return;
  const since = lastId ? `?since=${encodeURIComponent(lastId)}` : "";
  source = new EventSource(`${topicUrl()}/sse${since}`);
  source.onopen = () => {
    retryDelay = 5000;
    setStatus("live");
    flush();
  };
  source.onmessage = (event) => receive(event.data);
  source.onerror = () => {
    // EventSource retries by itself while CONNECTING; if it gave up, we retry.
    setStatus("offline");
    if (source && source.readyState === EventSource.CLOSED) {
      closeSource();
      scheduleRetry();
    }
  };
}

async function send(key) {
  const message = pending.get(key);
  if (!message || !room || status !== "live") return;
  try {
    const response = await fetch(topicUrl(), { method: "POST", body: JSON.stringify(message) });
    if (!response.ok) throw new Error(`publish ${response.status}`);
    if (pending.get(key) === message) pending.delete(key);
  } catch {
    // Stays pending; flushed again on the next (re)connect.
  }
}

function flush() {
  [...pending.keys()].forEach(send);
}

/** Queue a message (debounced per key); only the latest per key is sent. */
export function publish(key, body) {
  if (!room) return;
  pending.set(key, { v: 1, from: deviceId, at: body.at ?? Date.now(), ...body });
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => send(key), DEBOUNCE_MS));
}

/** fn(message) for every message from another device. */
export function init(onMessage) {
  handler = onMessage;
  connect();
  addEventListener("online", connect);
  addEventListener("offline", () => room && setStatus("offline"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && room && status !== "live") connect();
  });
}

export function join(code) {
  const normalized = normalizeCode(code);
  if (!isValidCode(normalized)) return false;
  if (normalized !== room) {
    room = normalized;
    lastId = null;
    pending.clear();
    save("room", room);
    connect();
  }
  return true;
}

export function createRoom() {
  join(randomCode(12));
  return room;
}

export function leave() {
  room = null;
  lastId = null;
  pending.clear();
  save("room", null);
  connect();
}
