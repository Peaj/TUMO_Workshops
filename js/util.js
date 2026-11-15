// Small shared helpers: events, time formatting, random ids.

export function emitter() {
  const listeners = new Set();
  return {
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(detail) {
      listeners.forEach((fn) => fn(detail));
    },
  };
}

const pad = (n) => String(n).padStart(2, "0");

/** Countdown style: rounds up so "0:00" only shows when time is really over. */
export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** Elapsed style: rounds down. */
export function mmssDown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** Offset in minutes as h:mm, e.g. 25 -> "0:25". */
export function offset(minutes) {
  return `${Math.floor(minutes / 60)}:${pad(Math.floor(minutes % 60))}`;
}

export function wallClock(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function shortDate(ms, lang) {
  return new Date(ms).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { day: "numeric", month: "short", year: "numeric" });
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Unguessable random code from an unambiguous alphabet (31^n combinations). */
export function randomCode(length) {
  const limit = 256 - (256 % ALPHABET.length); // rejection sampling avoids modulo bias
  let code = "";
  while (code.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length))) {
      if (b < limit && code.length < length) code += ALPHABET[b % ALPHABET.length];
    }
  }
  return code;
}

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
