// Loads workshop and session JSON. A missing or invalid session never throws:
// it is returned as null and shown as "not available yet".

export const TYPES = ["review", "presentation", "task", "other", "wrapup"];
export const KINDS = ["explain", "demo", "ask", "task", "check", "warn", "save", "info"];

const ID = /^[\w-]+$/;
const DEMO_ID = "_demo";
const workshops = new Map(); // id -> Promise<workshop | null>

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

const isPair = (value) => value != null && typeof value === "object" && (typeof value.de === "string" || typeof value.en === "string");

function normalizeSession(raw, n) {
  if (!raw || !Array.isArray(raw.sections) || !raw.sections.length || !isPair(raw.title)) return null;
  let start = 0;
  const sections = [];
  for (const [index, s] of raw.sections.entries()) {
    if (!s || !isPair(s.title) || typeof s.minutes !== "number" || s.minutes <= 0) return null;
    const id = String(s.id ?? `${n}.${index + 1}`);
    const items = (Array.isArray(s.items) ? s.items : [])
      .filter((item) => item && isPair(item.text))
      .map((item, i) => ({ id: `${id}#${i}`, kind: KINDS.includes(item.kind) ? item.kind : "info", text: item.text, note: isPair(item.note) ? item.note : null }));
    sections.push({
      id,
      index,
      type: TYPES.includes(s.type) ? s.type : "other",
      title: s.title,
      minutes: s.minutes,
      startMin: start,
      start: start * 60000,
      end: (start + s.minutes) * 60000,
      slide: Number.isInteger(s.slide) ? s.slide : null,
      anchor: s.anchor || null,
      items,
    });
    start += s.minutes;
  }
  return {
    n,
    title: raw.title,
    tumoTitle: raw.tumoTitle || null,
    takeaway: raw.takeaway || null,
    slides: raw.slides || null,
    source: raw.source || null,
    sections,
    total: start * 60000,
  };
}

async function fetchWorkshop(id) {
  const base = `data/${id}/`;
  const meta = await fetchJson(`${base}workshop.json`);
  if (!meta || !isPair(meta.title) || !Array.isArray(meta.sessions)) throw new Error(`${base}workshop.json: invalid`);
  const sessions = await Promise.all(
    meta.sessions.map((n) =>
      fetchJson(`${base}session-${n}.json`)
        .then((raw) => normalizeSession(raw, n))
        .catch(() => null)
        .then((data) => ({ n, data }))
    )
  );
  return { id, title: meta.title, subtitle: meta.subtitle || null, sessionMinutes: meta.sessionMinutes, sessions, demo: id === DEMO_ID };
}

/** Workshop by id, cached. Resolves to null if it cannot be loaded. */
export function getWorkshop(id) {
  if (!ID.test(id)) return Promise.resolve(null);
  if (!workshops.has(id)) workshops.set(id, fetchWorkshop(id).catch(() => null));
  return workshops.get(id);
}

/** { workshop, session } or null. */
export async function getSession(workshopId, n) {
  const workshop = await getWorkshop(workshopId);
  const entry = workshop?.sessions.find((s) => s.n === n);
  return entry?.data ? { workshop, session: entry.data } : null;
}

/** All listed workshops; the demo workshop only when requested. */
export async function getCatalog(withDemo) {
  const ids = await fetchJson("data/workshops.json");
  if (!Array.isArray(ids)) throw new Error("data/workshops.json: invalid");
  const list = (withDemo ? [DEMO_ID, ...ids] : ids).filter((id) => typeof id === "string");
  return (await Promise.all(list.map(getWorkshop))).filter(Boolean);
}
