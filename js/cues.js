// Detects section changes and pre-warnings of the running clock and fires alerts.
// Robust against late ticks: each tick compares the current section index with the
// last announced one, fires at most once (no burst for skipped sections), and
// manual changes (jumps, nudges, remote updates) only resync without firing.

import * as alerts from "./alerts.js";
import * as settings from "./settings.js";
import { position } from "./clock.js";

let mark = null; // { key, index, warned }

const clockKey = (clock) => `${clock.workshop}|${clock.session}`;

export function indexAt(session, pos) {
  if (pos >= session.total) return session.sections.length;
  return Math.max(0, session.sections.findIndex((s) => pos < s.end));
}

function inWarnWindow(session, index, pos) {
  const minutes = settings.get("preWarn");
  const section = session.sections[index];
  if (!minutes || !section || section.minutes <= minutes) return false;
  return section.end - pos <= minutes * 60000;
}

/** Take the current state as already announced. */
export function resync(clock, session, now = Date.now()) {
  if (!clock || !session) {
    mark = null;
    return;
  }
  const pos = position(clock, now);
  const index = indexAt(session, pos);
  mark = { key: clockKey(clock), index, warned: inWarnWindow(session, index, pos) ? index : -1 };
}

/** Called on every tick. */
export function check(clock, session, now = Date.now()) {
  if (!clock || !session) return;
  if (!mark || mark.key !== clockKey(clock) || !clock.running) {
    resync(clock, session, now);
    return;
  }
  const pos = position(clock, now);
  const index = indexAt(session, pos);
  if (index > mark.index) {
    if (index >= session.sections.length) alerts.sessionDone();
    else alerts.sectionChange(session.sections[index]);
    mark.index = index;
    mark.warned = inWarnWindow(session, index, pos) ? index : -1;
    return;
  }
  if (index < mark.index) {
    resync(clock, session, now);
    return;
  }
  if (mark.warned !== index && inWarnWindow(session, index, pos)) {
    mark.warned = index;
    alerts.preWarning(session.sections[index], settings.get("preWarn"));
  }
}
