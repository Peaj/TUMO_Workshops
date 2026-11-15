// Session view: header, sticky now panel with minimap and controls, section cards with checklists.

import * as clock from "../clock.js";
import * as data from "../data.js";
import * as groups from "../groups.js";
import * as ticks from "../ticks.js";
import { indexAt } from "../cues.js";
import { t, tx } from "../i18n.js";
import { icon } from "../icons.js";
import { h, confirmDialog } from "../ui.js";
import { mmss, mmssDown, offset, wallClock, prefersReducedMotion } from "../util.js";
import { minimap } from "./minimap.js";
import { legend } from "./legend.js";

const MINUTE = 60000;

export function mount(root, { workshopId, n }) {
  root.replaceChildren(h("p", { class: "empty" }, t("loading")));
  let view = null;
  let destroyed = false;
  data.getSession(workshopId, n).then((result) => {
    if (destroyed) return;
    if (!result) {
      root.replaceChildren(
        h("div", { class: "empty" }, h("p", {}, `${t("session", { n })}: ${t("sessionMissing")}`), h("a", { class: "btn ghost", href: "#/" }, t("toHome")))
      );
      return;
    }
    view = build(root, result.workshop, result.session);
  });
  return {
    update: (now) => view?.update(now),
    destroy() {
      destroyed = true;
      view?.destroy();
    },
  };
}

function build(root, workshop, session) {
  const { sections } = session;
  const wid = workshop.id;
  const n = session.n;
  const manual = new Map(); // section index -> open/closed chosen by the user
  let lastIndex = null;
  let playState = "";
  let tickSet = ticks.get(groups.activeId(), wid, n);

  // ---- Actions ----

  /** Make this session the active clock; asks before replacing another running one. */
  async function ensureClock() {
    if (clock.isFor(wid, n)) return true;
    const other = clock.get();
    if (clock.inProgress(other) && !(await confirmDialog(t("replaceClock", { n: other.session }), t("ok")))) return false;
    clock.activate(wid, n, groups.activeId(), session.total);
    return true;
  }

  const viewIndex = () => (clock.isFor(wid, n) ? indexAt(session, clock.position()) : 0);

  async function togglePlay() {
    if (!(await ensureClock())) return;
    if (clock.get().running) clock.pause();
    else clock.start();
  }

  async function jumpTo(ms) {
    if (!(await ensureClock())) return;
    clock.setPosition(ms);
  }

  async function startFrom(index) {
    if (!(await ensureClock())) return;
    clock.setPosition(sections[index].start);
    clock.start();
  }

  function prev() {
    const target = Math.max(0, Math.min(viewIndex(), sections.length) - 1);
    jumpTo(sections[target].start);
  }

  function next() {
    const index = viewIndex();
    if (index >= sections.length) return;
    jumpTo(index + 1 < sections.length ? sections[index + 1].start : session.total);
  }

  async function nudge(delta) {
    if (!(await ensureClock())) return;
    clock.nudge(delta);
  }

  // ---- Header ----

  const header = h(
    "header",
    { class: "s-head" },
    h("p", { class: "eyebrow" }, `${t("session", { n })} · ${tx(workshop.title)}`),
    h("h1", { class: "s-title" }, tx(session.title)),
    session.takeaway && h("p", { class: "takeaway" }, tx(session.takeaway)),
    session.tumoTitle && h("p", { class: "tumo-title" }, tx(session.tumoTitle))
  );

  // ---- Now panel ----

  const map = minimap(session, focusSection);
  const nowBadge = h("span", { class: "badge" });
  const nowState = h("span", { class: "state-pill", hidden: true });
  const nowTitle = h("h2", { class: "now-title" });
  const nowNext = h("p", { class: "now-next" });
  const nowRemain = h("div", { class: "now-remain num" });
  const nowOf = h("div", { class: "now-of num" });
  const nowFill = h("i");
  const nowElapsed = h("span", { class: "num" });
  const nowDrift = h("span", { class: "drift" });
  const nowEnd = h("span", { class: "now-end" });

  const ctl = (name, label, onclick, extra = "") => h("button", { class: `ctl ${extra}`, type: "button", "aria-label": label, title: label, onclick, html: icon(name) });
  const playBtn = h("button", { class: "btn primary play", type: "button", onclick: togglePlay });
  const controls = h(
    "div",
    { class: "controls" },
    ctl("skipBack", t("prevSection"), prev),
    h("button", { class: "ctl nudge", type: "button", "aria-label": t("minus1"), title: t("minus1"), onclick: () => nudge(-MINUTE) }, "−1"),
    playBtn,
    h("button", { class: "ctl nudge", type: "button", "aria-label": t("plus1"), title: t("plus1"), onclick: () => nudge(MINUTE) }, "+1"),
    ctl("skipForward", t("nextSection"), next)
  );

  // Compact bar, fixed to the top of the screen once the panel has scrolled out of view
  // (narrow screens): thin minimap, title, remaining, play. It lives outside the page
  // flow, so showing or hiding it can never move the content or the scroll position.
  const compactTitle = h("span", { class: "now-compact-title" });
  const compactRemain = h("span", { class: "now-compact-remain num" });
  const compactPlay = h("button", {
    class: "btn primary compact-play",
    type: "button",
    onclick: (e) => {
      e.stopPropagation();
      togglePlay();
    },
  });
  const compactRow = h("div", { class: "now-compact" }, compactTitle, compactRemain, compactPlay);
  const barMap = minimap(session);
  const bar = h(
    "div",
    { class: "pin-bar", onclick: () => scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" }) },
    h("div", { class: "pin-bar-inner" }, barMap.el, compactRow)
  );

  const panel = h(
    "section",
    { class: "now", "aria-live": "off" },
    map.el,
    h(
      "div",
      { class: "now-main" },
      h("div", { class: "now-text" }, h("div", { class: "now-badges" }, nowBadge, nowState), nowTitle, nowNext),
      h("div", { class: "now-time" }, nowRemain, nowOf)
    ),
    h("div", { class: "now-bar" }, nowFill),
    h("div", { class: "now-meta" }, nowElapsed, nowDrift, nowEnd),
    controls
  );

  const mapLegend = legend("types");

  // ---- Sections ----

  const cards = sections.map((section) => buildCard(section));
  const list = h("ol", { class: "sections" }, cards.map((c) => c.el));

  function buildCard(section) {
    const progress = h("i");
    const headBtn = h(
      "button",
      { class: "sec-head", type: "button", "aria-expanded": "false", onclick: () => toggleCard(section.index) },
      h("span", { class: "sec-offset num" }, offset(section.startMin)),
      h("span", { class: "sec-title" }, tx(section.title)),
      h("span", { class: "sec-min num" }, t("min", { n: section.minutes })),
      h("span", { class: "sec-chevron", html: icon("chevron") })
    );
    const tools = h("div", { class: "sec-tools" });
    if (session.slides && section.slide) {
      tools.append(
        h("a", { class: "chip", href: `${tx(session.slides)}/present?slide=${section.slide}`, target: "_blank", rel: "noopener", html: `${icon("slides")}<span>${t("slide", { n: section.slide })}</span>` })
      );
    }
    if (session.source) {
      tools.append(
        h("a", { class: "chip", href: `${tx(session.source)}${tx(section.anchor)}`, target: "_blank", rel: "noopener", html: `${icon("file")}<span>${t("sourcePage")}</span>` })
      );
    }
    tools.append(h("button", { class: "chip accent", type: "button", onclick: () => startFrom(section.index), html: `${icon("flag")}<span>${t("startHere")}</span>` }));

    const items = section.items.map((item) => buildItem(item));
    const body = h("div", { class: "sec-body" }, tools, items.length ? h("ul", { class: "items" }, items.map((i) => i.el)) : null);
    const el = h("li", { class: `sec type-${section.type}`, id: `sec-${section.index}` }, headBtn, h("div", { class: "sec-progress" }, progress), body);
    return { el, headBtn, progress, items };
  }

  function buildItem(item) {
    const el = h("li", { class: `item k-${item.kind}` });
    const main = h(
      "button",
      { class: "item-main", type: "button", "aria-pressed": "false", onclick: () => ticks.toggle(groups.activeId(), wid, n, item.id) },
      h("span", { class: "item-tick", html: icon("tick") }),
      h("span", { class: "item-ico", title: t(`kind_${item.kind}`), html: icon(item.kind) }),
      h("span", { class: "item-text" }, tx(item.text))
    );
    el.append(main);
    if (item.note) {
      const note = h("p", { class: "item-note", hidden: true }, tx(item.note));
      const noteBtn = h("button", {
        class: "item-note-btn",
        type: "button",
        "aria-expanded": "false",
        "aria-label": t("note"),
        title: t("note"),
        html: icon("note"),
        onclick: () => {
          const open = note.hidden;
          note.hidden = !open;
          noteBtn.setAttribute("aria-expanded", String(open));
          el.classList.toggle("note-open", open);
        },
      });
      el.append(noteBtn, note);
    }
    return { el, main, item };
  }

  const isOpen = (index, current) => (manual.has(index) ? manual.get(index) : index === current);

  function paintCards(current) {
    cards.forEach((card, i) => {
      card.el.classList.toggle("past", i < current);
      card.el.classList.toggle("current", i === current);
      const open = isOpen(i, current);
      card.el.classList.toggle("open", open);
      card.headBtn.setAttribute("aria-expanded", String(open));
    });
  }

  function toggleCard(index) {
    const current = lastIndex ?? 0;
    manual.set(index, !isOpen(index, current));
    paintCards(current);
  }

  function scrollToCard(index) {
    cards[index]?.el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }

  function focusSection(index) {
    manual.set(index, true);
    map.select(index);
    paintCards(lastIndex ?? 0);
    scrollToCard(index);
  }

  // ---- Ticks ----

  const tickCount = h("span", { class: "tick-count" });
  const itemIds = new Set(sections.flatMap((s) => s.items.map((i) => i.id)));

  function paintTicks() {
    for (const card of cards) {
      for (const { el, main, item } of card.items) {
        const done = tickSet.has(item.id);
        el.classList.toggle("done", done);
        main.setAttribute("aria-pressed", String(done));
      }
    }
    tickCount.textContent = t("ticksProgress", { done: [...tickSet].filter((id) => itemIds.has(id)).length, total: itemIds.size });
  }

  async function clearTicks() {
    const group = groups.activeId();
    if (await confirmDialog(t("clearTicksConfirm", { group: groups.name(group) }), t("clearTicks"), true)) ticks.clear(group, wid, n);
  }

  async function resetTimer() {
    if (clock.isFor(wid, n) && (await confirmDialog(t("resetConfirm"), t("resetTimer"), true))) clock.reset();
  }

  const resetBtn = h("button", { class: "btn ghost small", type: "button", onclick: resetTimer, html: `${icon("reset")}<span>${t("resetTimer")}</span>` });
  const footer = h(
    "div",
    { class: "s-actions" },
    tickCount,
    h("div", { class: "s-actions-btns" }, h("button", { class: "btn ghost small", type: "button", onclick: clearTicks, html: `${icon("trash")}<span>${t("clearTicks")}</span>` }), resetBtn)
  );

  // ---- Compact bar ----

  root.replaceChildren(h("div", { class: "session-view" }, header, panel, mapLegend, list, footer, legend("items")));
  // On the body, not inside the view: a transformed ancestor would un-fix it.
  document.body.append(bar);

  // Show the bar as soon as the panel's time and controls are gone, not only its last pixel.
  const barObserver = new IntersectionObserver(
    ([entry]) => bar.classList.toggle("show", !entry.isIntersecting && entry.boundingClientRect.top < 0),
    { rootMargin: "-110px 0px 0px 0px" }
  );
  barObserver.observe(panel);

  // Keep the sticky panel's height available for scroll-margin of the cards.
  const resize = new ResizeObserver(() => root.style.setProperty("--now-h", `${panel.offsetHeight}px`));
  resize.observe(panel);

  const offTicks = ticks.onChange((change) => {
    if (change.workshop === wid && change.session === n && change.group === groups.activeId()) {
      tickSet = new Set(change.ids);
      paintTicks();
    }
  });
  const offGroups = groups.onChange(() => {
    tickSet = ticks.get(groups.activeId(), wid, n);
    paintTicks();
  });

  // ---- Per-tick update ----

  function update(now) {
    const active = clock.isFor(wid, n);
    const c = active ? clock.get() : null;
    const pos = active ? clock.position(c, now) : 0;
    const started = active && (c.running || pos > 0 || !!c.firstStart);
    const index = indexAt(session, pos);
    const done = index >= sections.length;
    const section = sections[index];

    map.update(pos, started);
    barMap.update(pos, started);

    nowBadge.hidden = done;
    if (!done) {
      nowBadge.className = `badge type-${section.type}`;
      nowBadge.textContent = t(`type_${section.type}`);
    }
    const paused = active && !c.running && started && !done;
    nowState.hidden = !(paused || (active && c.running));
    nowState.textContent = paused ? t("paused") : t("running");
    nowState.classList.toggle("live", !!(active && c.running));
    nowTitle.textContent = done ? t("done") : tx(section.title);
    nowRemain.textContent = done ? "0:00" : mmss(section.end - pos);
    compactTitle.textContent = nowTitle.textContent;
    compactRemain.textContent = nowRemain.textContent;
    nowOf.textContent = done ? "" : t("of", { total: mmss(section.end - section.start) });
    nowNext.textContent = done ? "" : sections[index + 1] ? t("next", { title: tx(sections[index + 1].title) }) : t("nextEnd");
    nowFill.style.transform = `scaleX(${done ? 1 : started ? (pos - section.start) / (section.end - section.start) : 0})`;
    nowElapsed.textContent = `${mmssDown(pos)} / ${mmss(session.total)}`;

    if (active && c.firstStart && !done) {
      const drift = Math.round((now - c.firstStart - pos) / MINUTE);
      nowDrift.hidden = false;
      nowDrift.textContent = drift > 0 ? t("behind", { n: drift }) : drift < 0 ? t("ahead", { n: -drift }) : t("onTime");
      nowDrift.className = `drift ${drift >= 5 ? "bad" : drift > 0 ? "warn" : "ok"}`;
    } else {
      nowDrift.hidden = true;
    }
    nowEnd.hidden = done;
    nowEnd.textContent = started ? t("endsAt", { time: wallClock(now + session.total - pos) }) : t("endsAtIdle", { time: wallClock(now + session.total) });

    const state = done ? "restart" : active && c.running ? "pause" : pos > 0 ? "resume" : "start";
    if (state !== playState) {
      playState = state;
      const playIcon = icon(state === "pause" ? "pause" : state === "restart" ? "reset" : "play");
      playBtn.innerHTML = `${playIcon}<span>${t(state)}</span>`;
      compactPlay.innerHTML = playIcon;
      compactPlay.setAttribute("aria-label", t(state));
    }
    resetBtn.disabled = !active || !started;

    if (index !== lastIndex) {
      const first = lastIndex === null;
      manual.delete(index);
      if (lastIndex !== null) manual.delete(lastIndex);
      lastIndex = index;
      paintCards(index);
      // Follow the current section, but do not scroll on opening a fresh session.
      if (!done && started && (!first || pos > 0)) scrollToCard(index);
    }
    cards.forEach((card, i) => {
      card.progress.style.transform = `scaleX(${i === index && started ? (pos - sections[i].start) / (sections[i].end - sections[i].start) : 0})`;
    });
  }

  paintTicks();
  update(Date.now());

  return {
    update,
    destroy() {
      resize.disconnect();
      barObserver.disconnect();
      bar.remove();
      offTicks();
      offGroups();
      root.style.removeProperty("--now-h");
    },
  };
}
