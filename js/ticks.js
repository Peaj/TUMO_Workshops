// Checklist ticks per group + workshop + session. Item ids are "<sectionId>#<index>".

import { load, save } from "./store.js";
import { emitter } from "./util.js";

const events = emitter();
const all = load("ticks", {}); // key -> { ids: [], at }

const key = (group, workshop, session) => `${group}|${workshop}|${session}`;

/** fn({ group, workshop, session, ids, at, remote }) after every change. */
export const onChange = events.on;

export const get = (group, workshop, session) => new Set(all[key(group, workshop, session)]?.ids ?? []);

function store(group, workshop, session, ids, at, remote) {
  all[key(group, workshop, session)] = { ids, at };
  save("ticks", all);
  events.emit({ group, workshop, session, ids, at, remote });
}

export function toggle(group, workshop, session, itemId) {
  const ids = get(group, workshop, session);
  if (ids.has(itemId)) ids.delete(itemId);
  else ids.add(itemId);
  store(group, workshop, session, [...ids], Date.now(), false);
}

export function clear(group, workshop, session) {
  store(group, workshop, session, [], Date.now(), false);
}

/** Apply ticks from another device if they are newer. */
export function applyRemote(group, workshop, session, ids, at) {
  if (!Array.isArray(ids)) return;
  const current = all[key(group, workshop, session)];
  if (current && current.at >= at) return;
  store(group, workshop, session, ids.filter((id) => typeof id === "string"), at, true);
}

export function removeGroup(group) {
  for (const k of Object.keys(all)) if (k.startsWith(`${group}|`)) delete all[k];
  save("ticks", all);
}
