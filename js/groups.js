// Teaching groups ("Di/Do Herbst") and when each group last ran a session.

import { load, save } from "./store.js";
import { emitter, randomCode } from "./util.js";
import { t } from "./i18n.js";

const events = emitter();
let data = load("groups", null);
if (!data || !Array.isArray(data.list) || !data.list.length) {
  // Fixed id, so the first group of two synced devices is the same group.
  data = { list: [{ id: "default", name: t("groupDefault") }], active: "default" };
  save("groups", data);
}
const lastRuns = load("lastRun", {});

export const onChange = events.on;
export const list = () => data.list;
export const activeId = () => (data.list.some((g) => g.id === data.active) ? data.active : data.list[0].id);
export const name = (id) => data.list.find((g) => g.id === id)?.name ?? "";

function commit(detail) {
  save("groups", data);
  events.emit(detail);
}

export function setActive(id) {
  if (data.active === id || !data.list.some((g) => g.id === id)) return;
  data.active = id;
  commit({ active: true });
}

export function add(groupName) {
  const id = randomCode(8);
  data.list.push({ id, name: groupName });
  data.active = id;
  commit({ active: true });
  return id;
}

export function rename(id, groupName) {
  const group = data.list.find((g) => g.id === id);
  if (!group || group.name === groupName) return;
  group.name = groupName;
  commit({ renamed: id });
}

/** Returns false if it is the last group. */
export function remove(id) {
  if (data.list.length <= 1) return false;
  data.list = data.list.filter((g) => g.id !== id);
  if (data.active === id) data.active = data.list[0].id;
  for (const key of Object.keys(lastRuns)) if (key.startsWith(`${id}|`)) delete lastRuns[key];
  save("lastRun", lastRuns);
  commit({ active: true, removed: id });
  return true;
}

/** From sync: make sure a group with this id exists under this name, without announcing it back. */
export function ensure(id, groupName) {
  if (typeof id !== "string" || typeof groupName !== "string") return;
  const group = data.list.find((g) => g.id === id);
  if (group) {
    if (group.name === groupName) return;
    group.name = groupName;
  } else {
    data.list.push({ id, name: groupName });
  }
  commit({ remote: true });
}

const runKey = (group, workshop, session) => `${group}|${workshop}|${session}`;

export function recordRun(group, workshop, session, ms) {
  const key = runKey(group, workshop, session);
  if (lastRuns[key] === ms) return;
  lastRuns[key] = ms;
  save("lastRun", lastRuns);
}

export const lastRun = (group, workshop, session) => lastRuns[runKey(group, workshop, session)] ?? null;
