// Thin wrapper around localStorage. All keys share one prefix, values are JSON.
// Storage can be unavailable (private mode, quota), so every access is guarded.

const PREFIX = "tumo.";

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Not persisted; the app keeps working with in-memory state.
  }
}
