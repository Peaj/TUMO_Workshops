// One horizontal bar per session: segments proportional to section minutes,
// coloured by section type, with the elapsed part filled and a playhead.

import { h } from "../ui.js";
import { t, tx } from "../i18n.js";

/** onSelect(index) makes segments tappable. Returns { el, update(pos, started), select(index) }. */
export function minimap(session, onSelect) {
  const segments = session.sections.map((section) => {
    const fill = h("span", { class: "mm-fill" });
    const props = { class: `mm-seg type-${section.type}`, style: `flex-grow:${section.minutes}` };
    const seg = onSelect
      ? h("button", { ...props, type: "button", "aria-label": `${tx(section.title)} (${t("min", { n: section.minutes })})`, onclick: () => onSelect(section.index) }, fill)
      : h("span", props, fill);
    return { seg, fill, section };
  });
  const head = h("span", { class: "mm-head", hidden: true });
  const el = h("div", { class: onSelect ? "minimap interactive" : "minimap" }, h("div", { class: "mm-track" }, segments.map((s) => s.seg)), head);
  let last = "";

  function update(pos, started) {
    const key = `${Math.floor(pos / 1000)}|${started}`;
    if (key === last) return;
    last = key;
    for (const { fill, section } of segments) {
      const share = started ? Math.min(1, Math.max(0, (pos - section.start) / (section.end - section.start))) : 0;
      fill.style.transform = `scaleX(${share})`;
    }
    head.hidden = !started;
    head.style.left = `${(100 * pos) / session.total}%`;
  }

  function select(index) {
    segments.forEach(({ seg }, i) => seg.classList.toggle("selected", i === index));
  }

  return { el, update, select };
}
