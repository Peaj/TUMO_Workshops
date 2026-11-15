// App entry: routing, the main tick loop, alerts, sync wiring, service worker.

import * as alerts from "./alerts.js";
import * as clock from "./clock.js";
import * as cues from "./cues.js";
import * as data from "./data.js";
import * as groups from "./groups.js";
import * as push from "./push.js";
import * as settings from "./settings.js";
import * as sync from "./sync.js";
import * as ticks from "./ticks.js";
import { onLangChange, t } from "./i18n.js";
import { icon } from "./icons.js";
import { toast } from "./ui.js";
import * as home from "./views/home.js";
import * as sessionView from "./views/session.js";
import * as beamer from "./views/beamer.js";
import * as settingsView from "./views/settings.js";

const TICK_MS = 250;
const VIEWS = { home, session: sessionView, beamer, settings: settingsView };
const viewRoot = document.getElementById("view");
const banner = document.getElementById("banner");
let route = null;
let view = null;
let navigated = false;

// ---- Active session data for the clock (alerts and keep-alive need it on every view) ----

let activeKey = null;
let activeSession = null;

function refreshActiveSession() {
  const c = clock.get();
  const key = c ? `${c.workshop}|${c.session}` : null;
  if (key === activeKey) return;
  activeKey = key;
  activeSession = null;
  if (!c) return;
  data.getSession(c.workshop, c.session).then((result) => {
    if (activeKey !== key) return;
    activeSession = result?.session ?? null;
    cues.resync(clock.get(), activeSession);
  });
}

// ---- Sync ----

function publishClock() {
  const c = clock.get();
  if (c) sync.publish("clock", { type: "clock", at: c.at, clock: c, group: { id: c.group, name: groups.name(c.group) } });
}

function publishTicks(group, workshop, session) {
  const ids = [...ticks.get(group, workshop, session)];
  sync.publish(`ticks|${group}|${workshop}|${session}`, { type: "ticks", at: Date.now(), group, groupName: groups.name(group), workshop, session, ticks: ids });
}

function handleMessage(message) {
  if (message.type === "clock" && message.clock && typeof message.clock.workshop === "string" && Number.isInteger(message.clock.session)) {
    if (message.group) groups.ensure(message.group.id, message.group.name);
    if (clock.applyRemote(message.clock, message.at) && message.clock.group) groups.setActive(message.clock.group);
  } else if (message.type === "ticks" && typeof message.workshop === "string" && Number.isInteger(message.session)) {
    groups.ensure(message.group, message.groupName);
    ticks.applyRemote(message.group, message.workshop, message.session, message.ticks, message.at);
  }
}

/** After joining a room, offer our state; receivers keep whatever is newer. */
function joinRoom(code) {
  if (!sync.join(code)) return false;
  push.request(); // the alert topic follows the room
  const c = clock.get();
  if (c) {
    publishClock();
    publishTicks(groups.activeId(), c.workshop, c.session);
  }
  return true;
}

function createRoom() {
  joinRoom(sync.createRoom());
}

function leaveRoom() {
  sync.leave();
  push.request();
}

// ---- App bar ----

function paintSyncDot() {
  // Shows the sync state, and a warning when pocket alerts could not be scheduled.
  const dot = document.getElementById("syncDot");
  const status = sync.getStatus();
  const pushFailed = settings.get("pocket") && push.getStatus() === "error";
  dot.hidden = status === "off" && !pushFailed;
  dot.className = `sync-dot s-${pushFailed ? "offline" : status}`;
  const label = { connecting: t("syncConnecting"), live: t("syncLive"), offline: t("syncOffline") }[status] ?? t("syncOff");
  dot.title = pushFailed ? `${t("pocket")}: ${t("pocketError")}` : `${t("sync")}: ${label}`;
  dot.setAttribute("aria-label", dot.title);
}

function paintAppBar() {
  const back = document.getElementById("backBtn");
  back.hidden = route.name === "home";
  back.innerHTML = icon("back");
  back.setAttribute("aria-label", t("back"));
  document.getElementById("brandName").textContent = t("appName");
  const beamerBtn = document.getElementById("beamerBtn");
  beamerBtn.innerHTML = icon("beamer");
  beamerBtn.setAttribute("aria-label", t("beamer"));
  beamerBtn.title = t("beamer");
  const settingsBtn = document.getElementById("settingsBtn");
  settingsBtn.innerHTML = icon("settings");
  settingsBtn.setAttribute("aria-label", t("settings"));
  settingsBtn.title = t("settings");
  settingsBtn.classList.toggle("active", route.name === "settings");
  paintSyncDot();
  banner.querySelector(".banner-icon").innerHTML = icon("bell");
  banner.querySelector(".banner-text").textContent = t("reArm");
}

// ---- Routing ----

function parseRoute() {
  const hash = location.hash || "#/";
  const match = hash.match(/^#\/s\/([\w-]+)\/(\d+)$/);
  if (match) return { name: "session", params: { workshopId: match[1], n: Number(match[2]) } };
  if (hash === "#/beamer") return { name: "beamer", params: {} };
  if (hash === "#/settings") return { name: "settings", params: {} };
  return { name: "home", params: {} };
}

const app = {
  demo: new URLSearchParams(location.search).get("demo") === "1",
  back() {
    if (navigated) history.back();
    else location.hash = "#/";
  },
  joinRoom,
  createRoom,
  leaveRoom,
};

function render() {
  view?.destroy();
  route = parseRoute();
  document.body.dataset.view = route.name;
  paintAppBar();
  view = VIEWS[route.name].mount(viewRoot, route.params, app);
  window.scrollTo(0, 0);
  tick();
}

// ---- Main loop ----

function tick() {
  const now = Date.now();
  const c = clock.get();
  if (c && activeSession) cues.check(c, activeSession, now);
  if (c?.running && clock.position(c, now) >= c.total) clock.finish();

  const current = clock.get();
  alerts.setRunning(!!current?.running);
  banner.hidden = !(current?.running && !alerts.isArmed() && route.name !== "beamer" && (settings.get("sound") || settings.get("vibrate")));
  view?.update(now);
}

// ---- Wiring ----

clock.onChange((detail) => {
  const c = clock.get();
  refreshActiveSession();
  cues.resync(c, activeSession);
  if (c?.firstStart) groups.recordRun(c.group, c.workshop, c.session, c.firstStart);
  if (detail.publish) publishClock();
  if (!detail.remote) push.request(); // only the originating device schedules pocket alerts
  tick();
});

ticks.onChange((change) => {
  if (!change.remote) publishTicks(change.group, change.workshop, change.session);
});

groups.onChange((detail) => {
  if (detail.renamed && clock.get()?.group === detail.renamed) publishClock();
});

settings.onChange((key) => {
  if (key === "preWarn") cues.resync(clock.get(), activeSession);
  if (key === "preWarn" || key === "pocket") push.request();
  if (key === "pocket") paintSyncDot();
});

onLangChange(render);
sync.onStatus(paintSyncDot);
push.onStatus(paintSyncDot);
alerts.onArmedChange(tick);

// Any tap unlocks audio (autoplay policy), e.g. after a reload with a running clock.
document.addEventListener("click", () => alerts.isArmed() || alerts.arm(), true);
banner.addEventListener("click", () => alerts.arm());

document.getElementById("backBtn").addEventListener("click", () => app.back());
document.getElementById("syncDot").addEventListener("click", () => (location.hash = "#/settings"));
addEventListener("hashchange", () => {
  navigated = true;
  render();
});
document.addEventListener("visibilitychange", tick);

// ---- Boot ----

const params = new URLSearchParams(location.search);
const roomParam = params.get("room");
sync.init(handleMessage);
if (roomParam) {
  if (joinRoom(roomParam)) toast(t("roomJoined", { code: sync.getRoom() }));
  else toast(t("roomInvalid"));
  params.delete("room");
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

refreshActiveSession();
render();
setInterval(tick, TICK_MS);

if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) toast(t("updateReady"), () => location.reload());
  });
}
