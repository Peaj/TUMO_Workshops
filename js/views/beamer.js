// Beamer view for the projector: section title, huge countdown, progress, next. No teacher notes.

import * as clock from "../clock.js";
import * as data from "../data.js";
import { indexAt } from "../cues.js";
import { t, tx } from "../i18n.js";
import { icon } from "../icons.js";
import { h } from "../ui.js";
import { mmss } from "../util.js";

const IDLE_MS = 3000;

export function mount(root, _params, app) {
  let key = null;
  let session = null;
  let hideTimer = null;

  const label = h("p", { class: "b-label" });
  const title = h("h1", { class: "b-title" });
  const count = h("div", { class: "b-count num" });
  const fill = h("i");
  const bar = h("div", { class: "b-bar" }, fill);
  const next = h("p", { class: "b-next" });
  const empty = h("div", { class: "b-empty", hidden: true }, h("p", {}, t("beamerNoClock")), h("a", { class: "btn ghost", href: "#/" }, t("toHome")));

  const fsBtn = h("button", { class: "ctl", type: "button", "aria-label": t("fullscreen"), title: t("fullscreen"), onclick: toggleFullscreen });
  const backBtn = h("button", { class: "ctl", type: "button", "aria-label": t("back"), title: t("back"), html: icon("back"), onclick: () => app.back() });
  const bar0 = h("div", { class: "b-controls" }, backBtn, fsBtn);
  const stage = h("div", { class: "b-stage" }, label, title, count, bar, next);
  const el = h("div", { class: "beamer" }, bar0, stage, empty);
  root.replaceChildren(el);

  function paintFullscreen() {
    fsBtn.innerHTML = icon(document.fullscreenElement ? "minimize" : "maximize");
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  // Controls fade out when the mouse rests, so the projected image stays clean.
  function wake() {
    el.classList.remove("idle");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => el.classList.add("idle"), IDLE_MS);
  }

  function update(now) {
    const c = clock.get();
    const nextKey = c ? `${c.workshop}|${c.session}` : null;
    if (nextKey !== key) {
      key = nextKey;
      session = null;
      if (c) {
        data.getSession(c.workshop, c.session).then((result) => {
          if (key === nextKey) {
            session = result?.session ?? null;
            update(Date.now());
          }
        });
      }
    }
    const ready = !!(c && session);
    stage.hidden = !ready;
    empty.hidden = !!c;
    if (!ready) return;

    const pos = clock.position(c, now);
    const index = indexAt(session, pos);
    const section = session.sections[index];
    label.textContent = `${t("session", { n: session.n })} · ${tx(session.title)}${!c.running && section ? ` · ${t("paused")}` : ""}`;
    el.className = `beamer${el.classList.contains("idle") ? " idle" : ""}${c.running ? "" : " paused"} type-${section ? section.type : "wrapup"}`;
    title.textContent = section ? tx(section.title) : t("done");
    count.textContent = section ? mmss(section.end - pos) : "0:00";
    fill.style.transform = `scaleX(${section ? (pos - section.start) / (section.end - section.start) : 1})`;
    const following = session.sections[index + 1];
    next.textContent = section ? (following ? t("next", { title: tx(following.title) }) : t("nextEnd")) : "";
  }

  document.addEventListener("fullscreenchange", paintFullscreen);
  el.addEventListener("pointermove", wake);
  el.addEventListener("pointerdown", wake);
  paintFullscreen();
  wake();
  update(Date.now());

  return {
    update,
    destroy() {
      clearTimeout(hideTimer);
      document.removeEventListener("fullscreenchange", paintFullscreen);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
  };
}
