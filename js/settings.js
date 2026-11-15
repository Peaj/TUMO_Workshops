// Device settings (not synced).

import { load, save } from "./store.js";
import { emitter } from "./util.js";

const DEFAULTS = { sound: true, vibrate: true, notify: false, pocket: false, preWarn: 2 };
export const PRE_WARN_OPTIONS = [0, 1, 2, 5];

const events = emitter();
const values = { ...DEFAULTS, ...load("settings", {}) };

export const onChange = events.on;
export const get = (key) => values[key];

export function set(key, value) {
  values[key] = value;
  save("settings", values);
  events.emit(key);
}
