// In-page alerts on section changes: chime, vibration, service-worker notification.
// They work while the screen is on or the app is briefly in the background; Chrome
// freezes the page soon after the screen turns off, so a locked phone is reached
// through scheduled ntfy messages instead (js/push.js).
//
// Public interface:
//   sectionChange(section), preWarning(section, minutes), sessionDone(), test()
//   arm()          call from a user tap: unlocks audio (autoplay policy)
//   setRunning()   whether the clock runs, to hold a screen wake lock while visible
// Channels are a list; another one is one more entry in CHANNELS.

import * as settings from "./settings.js";
import { t, tx } from "./i18n.js";
import { emitter } from "./util.js";

const events = emitter();
let audioCtx = null;
let wakeLock = null;
let wakeLockPending = false;
let armed = false;
let running = false;

export const onArmedChange = events.on;
export const isArmed = () => armed;

function setArmed(value) {
  if (armed === value) return;
  armed = value;
  events.emit(value);
}

// ---- Sound ----

const TONES = {
  change: [
    { freq: 784, delay: 0, peak: 0.35, length: 0.6 },
    { freq: 1047, delay: 0.2, peak: 0.35, length: 0.8 },
  ],
  warn: [{ freq: 784, delay: 0, peak: 0.16, length: 0.7 }],
  done: [
    { freq: 784, delay: 0, peak: 0.3, length: 0.6 },
    { freq: 988, delay: 0.18, peak: 0.3, length: 0.6 },
    { freq: 1175, delay: 0.36, peak: 0.3, length: 1.0 },
  ],
};

function schedule(tones) {
  const t0 = audioCtx.currentTime + 0.03;
  for (const { freq, delay, peak, length } of tones) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const start = t0 + delay;
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }
}

function playTones(tones) {
  if (!audioCtx) return;
  if (audioCtx.state === "running") schedule(tones);
  else audioCtx.resume().then(() => schedule(tones), () => {});
}

// ---- Notification through the service worker (vibrates on the lock screen) ----

async function showNotification(cue) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  // A fresh notification each time (old ones closed, new tag): per the pocket test,
  // updating an existing notification may alert more quietly than a new one.
  (await reg.getNotifications()).forEach((old) => old.close());
  await reg.showNotification(cue.title, {
    body: cue.body,
    tag: `tumo-${Date.now()}`,
    silent: false,
    vibrate: cue.vibrate,
    icon: "icons/icon-192.png",
    badge: "icons/badge-96.png",
  });
}

const CHANNELS = [
  { setting: "sound", fire: (cue) => playTones(cue.tones) },
  { setting: "vibrate", fire: (cue) => navigator.vibrate?.(cue.vibrate) },
  { setting: "notify", fire: (cue) => showNotification(cue) },
];

function fire(cue) {
  for (const channel of CHANNELS) {
    if (!settings.get(channel.setting)) continue;
    try {
      Promise.resolve(channel.fire(cue)).catch(() => {});
    } catch {
      // One failing channel must not stop the others.
    }
  }
}

const itemLines = (section) =>
  section.items
    .slice(0, 3)
    .map((item) => `· ${tx(item.text)}`)
    .join("\n");

export function sectionChange(section) {
  fire({ title: t("sectionNow", { title: tx(section.title) }), body: itemLines(section), tones: TONES.change, vibrate: [300, 120, 300] });
}

export function preWarning(section, minutes) {
  fire({ title: t("preWarnTitle", { n: minutes }), body: tx(section.title), tones: TONES.warn, vibrate: [180] });
}

export function sessionDone() {
  fire({ title: t("done"), body: t("doneBody"), tones: TONES.done, vibrate: [300, 120, 300, 120, 500] });
}

export function test() {
  fire({ title: t("testTitle"), body: t("testBody"), tones: TONES.change, vibrate: [300, 120, 300] });
}

// ---- Screen wake lock while the clock runs and the page is visible ----

async function updateWakeLock() {
  if (!("wakeLock" in navigator)) return;
  if (running && document.visibilityState === "visible") {
    if (wakeLock || wakeLockPending) return;
    wakeLockPending = true;
    try {
      const lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => {
        if (wakeLock === lock) wakeLock = null;
      });
      wakeLock = lock;
    } catch {
      wakeLock = null;
    } finally {
      wakeLockPending = false;
    }
  } else if (wakeLock) {
    const lock = wakeLock;
    wakeLock = null;
    lock.release().catch(() => {});
  }
}

/** Cheap to call on every tick. */
export function setRunning(value) {
  if (value === running) return;
  running = value;
  updateWakeLock();
}

/** Must be called from a user gesture: creates/resumes the audio context for the chime. */
export function arm() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().catch(() => {});
  } catch {
    audioCtx = null;
  }
  setArmed(true);
}

// The wake lock is released when the page is hidden; take it again on return.
document.addEventListener("visibilitychange", updateWakeLock);
