// The single active session clock. Position is always derived from Date.now(),
// never from counted ticks, so it survives throttling, reloads and a locked phone.
//
// state = { workshop, session, group, total, running, startedAt, elapsed, firstStart, at }
//   startedAt  wall time at which position 0 would have been (running only)
//   elapsed    position while paused
//   firstStart wall time of the first start of this run (for drift)
//   at         time of the last deliberate change (last writer wins in sync)

import { load, save } from "./store.js";
import { emitter } from "./util.js";

const events = emitter();
let state = load("clock", null);

/** fn({ publish, manual, remote }) after every change. */
export const onChange = events.on;
export const get = () => state;

export function position(clock = state, now = Date.now()) {
  if (!clock) return 0;
  const raw = clock.running ? now - clock.startedAt : clock.elapsed;
  return Math.min(Math.max(raw, 0), clock.total);
}

export const isFor = (workshop, session) => !!state && state.workshop === workshop && state.session === session;

/** True if the clock is running or paused somewhere in the middle. */
export function inProgress(clock = state) {
  if (!clock) return false;
  const pos = position(clock);
  return clock.running || (pos > 0 && pos < clock.total);
}

function commit() {
  state.at = Date.now();
  save("clock", state);
  events.emit({ publish: true, manual: true, remote: false });
}

/** Make a session the active clock, idle at 0:00. */
export function activate(workshop, session, group, total) {
  state = { workshop, session, group, total, running: false, startedAt: 0, elapsed: 0, firstStart: null, at: 0 };
  commit();
}

export function start() {
  if (!state || state.running) return;
  const now = Date.now();
  let pos = position();
  if (pos >= state.total) {
    pos = 0;
    state.firstStart = null;
  }
  if (!state.firstStart) state.firstStart = now - pos;
  state.running = true;
  state.startedAt = now - pos;
  commit();
}

export function pause() {
  if (!state || !state.running) return;
  state.elapsed = position();
  state.running = false;
  commit();
}

/** Jump to a position. Jumping to the end finishes the run. */
export function setPosition(ms) {
  if (!state) return;
  const pos = Math.min(Math.max(ms, 0), state.total);
  if (pos >= state.total) {
    state.running = false;
    state.elapsed = state.total;
  } else if (state.running) {
    state.startedAt = Date.now() - pos;
  } else {
    state.elapsed = pos;
  }
  commit();
}

export const nudge = (deltaMs) => setPosition(position() + deltaMs);

export function reset() {
  if (!state) return;
  state.running = false;
  state.elapsed = 0;
  state.firstStart = null;
  commit();
}

/** Called by the main loop when a running clock reaches the end. Not a deliberate change, so not published. */
export function finish() {
  if (!state || !state.running) return;
  state.running = false;
  state.elapsed = state.total;
  save("clock", state);
  events.emit({ publish: false, manual: false, remote: false });
}

/** Apply a clock received from another device if it is newer. Returns true if applied. */
export function applyRemote(clock, at) {
  if (!clock || typeof clock.total !== "number") return false;
  if (state && state.at >= at) return false;
  state = { ...clock, at };
  save("clock", state);
  events.emit({ publish: false, manual: true, remote: true });
  return true;
}
