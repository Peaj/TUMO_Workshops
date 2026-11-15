// Home: workshops with their session cards, active group selector, active timer card.

import * as clock from "../clock.js";
import * as data from "../data.js";
import * as groups from "../groups.js";
import * as ticks from "../ticks.js";
import { indexAt } from "../cues.js";
import { getLang, t, tx } from "../i18n.js";
import { icon } from "../icons.js";
import { h, confirmDialog, promptDialog, toast } from "../ui.js";
import { mmss, shortDate } from "../util.js";
import { minimap } from "./minimap.js";

export function mount(root, _params, app) {
  let catalog = null;
  let maps = []; // { workshop, n, map }
  const runningSlot = h("div", { class: "running-slot" });
  let running = null; // { key, session, workshop, el, title, remain, state }

  function groupBar() {
    const select = h(
      "select",
      { class: "field", "aria-label": t("group"), onchange: (e) => groups.setActive(e.target.value) },
      groups.list().map((g) => h("option", { value: g.id, selected: g.id === groups.activeId() }, g.name))
    );
    const iconBtn = (name, label, onclick) => h("button", { class: "ctl", type: "button", "aria-label": label, title: label, onclick, html: icon(name) });
    return h(
      "div",
      { class: "groupbar" },
      h("label", { class: "groupbar-label", html: `${icon("users")}<span>${t("group")}</span>` }),
      select,
      iconBtn("plus", t("groupAdd"), async () => {
        const name = await promptDialog(t("groupName"), "", t("groupNameHint"));
        if (name) groups.add(name);
      }),
      iconBtn("pencil", t("groupRename"), async () => {
        const id = groups.activeId();
        const name = await promptDialog(t("groupRename"), groups.name(id), t("groupNameHint"));
        if (name) groups.rename(id, name);
      }),
      iconBtn("trash", t("groupDelete"), async () => {
        const id = groups.activeId();
        if (groups.list().length <= 1) return toast(t("groupLast"));
        if (await confirmDialog(t("groupDeleteConfirm", { name: groups.name(id) }), t("delete"), true)) {
          ticks.removeGroup(id);
          groups.remove(id);
        }
      })
    );
  }

  function sessionCard(workshop, entry) {
    const { n, data: session } = entry;
    if (!session) {
      return h("div", { class: "card session-card missing" }, h("p", { class: "eyebrow" }, t("session", { n })), h("p", { class: "muted" }, t("sessionMissing")));
    }
    const group = groups.activeId();
    const done = ticks.get(group, workshop.id, n);
    const ids = session.sections.flatMap((s) => s.items.map((i) => i.id));
    const doneCount = ids.filter((id) => done.has(id)).length;
    const last = groups.lastRun(group, workshop.id, n);
    const map = minimap(session);
    maps.push({ workshop: workshop.id, n, map });
    return h(
      "a",
      { class: "card session-card", href: `#/s/${workshop.id}/${n}` },
      h("p", { class: "eyebrow" }, t("session", { n })),
      h("h3", { class: "card-title" }, tx(session.title)),
      session.tumoTitle && h("p", { class: "tumo-title" }, tx(session.tumoTitle)),
      session.takeaway && h("p", { class: "takeaway" }, tx(session.takeaway)),
      map.el,
      h(
        "div",
        { class: "card-meta" },
        h("span", { class: doneCount && doneCount === ids.length ? "pill ok" : "pill" }, t("ticksProgress", { done: doneCount, total: ids.length })),
        h("span", { class: "muted" }, last ? t("lastRun", { date: shortDate(last, getLang()) }) : t("neverRun"))
      )
    );
  }

  function render() {
    maps = [];
    running = null;
    const blocks = catalog.map((workshop) =>
      h(
        "section",
        { class: "workshop" },
        h(
          "header",
          { class: "workshop-head" },
          h("h1", {}, tx(workshop.title), workshop.demo && h("span", { class: "pill accent" }, t("demo"))),
          workshop.subtitle && h("p", { class: "muted" }, tx(workshop.subtitle))
        ),
        h("div", { class: "cards" }, workshop.sessions.map((entry) => sessionCard(workshop, entry)))
      )
    );
    root.replaceChildren(h("div", { class: "home" }, groupBar(), runningSlot, blocks));
    update(Date.now());
  }

  /** Card for the active clock, linking to its session. */
  function renderRunning(c) {
    const key = c ? `${c.workshop}|${c.session}` : null;
    if (running?.key === key) return;
    running = { key, session: null };
    runningSlot.replaceChildren();
    if (!c) return;
    data.getSession(c.workshop, c.session).then((result) => {
      if (running?.key !== key || !result) return;
      const title = h("span", { class: "running-section" });
      const remain = h("span", { class: "running-remain num" });
      const state = h("span", { class: "state-pill" });
      running = { key, session: result.session, title, remain, state };
      runningSlot.replaceChildren(
        h(
          "a",
          { class: "card running-card", href: `#/s/${c.workshop}/${c.session}` },
          h("div", { class: "running-top" }, h("p", { class: "eyebrow" }, t("activeTimer")), state),
          h("h2", { class: "card-title" }, `${t("session", { n: c.session })} · ${tx(result.session.title)}`),
          h("div", { class: "running-now" }, title, remain)
        )
      );
      update(Date.now());
    });
  }

  function update(now) {
    if (!catalog) return;
    const c = clock.get();
    renderRunning(c && clock.inProgress(c) ? c : null);
    for (const { workshop, n, map } of maps) {
      const active = clock.isFor(workshop, n);
      map.update(active ? clock.position(c, now) : 0, active && clock.inProgress(c));
    }
    if (running?.session) {
      const pos = clock.position(c, now);
      const section = running.session.sections[indexAt(running.session, pos)];
      running.title.textContent = section ? tx(section.title) : t("doneShort");
      running.remain.textContent = section ? mmss(section.end - pos) : "";
      running.state.textContent = c.running ? t("running") : t("paused");
      running.state.classList.toggle("live", c.running);
    }
  }

  root.replaceChildren(h("p", { class: "empty" }, t("loading")));
  data
    .getCatalog(app.demo)
    .then((list) => {
      catalog = list;
      render();
    })
    .catch(() => root.replaceChildren(h("p", { class: "empty" }, t("loadError"))));

  const offGroups = groups.onChange(() => catalog && render());
  const offTicks = ticks.onChange(() => catalog && render());

  return {
    update,
    destroy() {
      offGroups();
      offTicks();
    },
  };
}
