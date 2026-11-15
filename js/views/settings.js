// Settings: language, alert channels, keep-alive, pre-warning, sync room, tools, version.

import * as alerts from "../alerts.js";
import * as push from "../push.js";
import * as settings from "../settings.js";
import * as sync from "../sync.js";
import { getLang, setLang, t } from "../i18n.js";
import { icon } from "../icons.js";
import { h, toast } from "../ui.js";
import { VERSION, BUILD_DATE } from "../version.js";
import qrcode from "../vendor/qrcode.js";

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let path = "";
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (qr.isDark(r, c)) path += `M${c + 2} ${r + 2}h1v1h-1z`;
  return `<svg viewBox="0 0 ${size + 4} ${size + 4}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="100%" height="100%" fill="#ecedef"/><path d="${path}" fill="#121316"/></svg>`;
}

const STATUS_LABEL = { off: "syncOff", connecting: "syncConnecting", live: "syncLive", offline: "syncOffline" };

export function mount(root, _params, app) {
  const row = (label, hint, control) =>
    h("div", { class: "set-row" }, h("div", { class: "set-text" }, h("span", { class: "set-label" }, label), hint && h("span", { class: "set-hint" }, hint)), control);

  function toggle(key, onTurnOn) {
    const btn = h("button", {
      class: "switch",
      type: "button",
      role: "switch",
      "aria-checked": String(!!settings.get(key)),
      onclick: async () => {
        const next = !settings.get(key);
        if (next && onTurnOn && !(await onTurnOn())) return;
        settings.set(key, next);
        btn.setAttribute("aria-checked", String(next));
      },
    });
    return btn;
  }

  function segmented(options, current, onPick, label) {
    const wrap = h("div", { class: "segmented", role: "group", "aria-label": label });
    for (const { value, text } of options) {
      wrap.append(
        h(
          "button",
          {
            type: "button",
            "aria-pressed": String(value === current),
            onclick: (e) => {
              wrap.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
              onPick(value);
            },
          },
          text
        )
      );
    }
    return wrap;
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      toast(t("notificationsUnsupported"));
      return false;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") toast(t("notificationsDenied"));
    return permission === "granted";
  }

  // ---- Sync card ----

  const syncBody = h("div", { class: "sync-body" });
  const syncStatus = h("span", { class: "sync-status" });

  function paintStatus() {
    const status = sync.getStatus();
    syncStatus.className = `sync-status s-${status}`;
    syncStatus.textContent = t(STATUS_LABEL[status]);
  }

  function paintSync() {
    const room = sync.getRoom();
    if (!room) {
      const field = h("input", { class: "field", type: "text", inputmode: "text", autocapitalize: "off", autocomplete: "off", spellcheck: "false", placeholder: t("roomCode"), "aria-label": t("roomCode") });
      syncBody.replaceChildren(
        h("button", { class: "btn primary", type: "button", onclick: () => (app.createRoom(), paintSync(), paintPocket()), html: `${icon("plus")}<span>${t("roomCreate")}</span>` }),
        h(
          "form",
          {
            class: "join",
            onsubmit: (e) => {
              e.preventDefault();
              if (!app.joinRoom(field.value)) return toast(t("roomInvalid"));
              paintSync();
              paintPocket();
            },
          },
          field,
          h("button", { class: "btn ghost", type: "submit" }, t("roomJoin"))
        )
      );
      return;
    }
    const link = sync.roomLink();
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(link);
        toast(t("copied"));
      } catch {
        toast(link);
      }
    };
    syncBody.replaceChildren(
      h("div", { class: "room" }, h("span", { class: "muted" }, t("room")), h("code", { class: "room-code" }, room)),
      h("div", { class: "qr", html: qrSvg(link) }),
      h(
        "div",
        { class: "btn-row" },
        h("button", { class: "btn ghost small", type: "button", onclick: copy, html: `${icon("copy")}<span>${t("copyLink")}</span>` }),
        navigator.share &&
          h("button", { class: "btn ghost small", type: "button", onclick: () => navigator.share({ title: t("appName"), url: link }).catch(() => {}), html: `${icon("share")}<span>${t("share")}</span>` }),
        h("button", { class: "btn ghost small danger-text", type: "button", onclick: () => (app.leaveRoom(), paintSync(), paintPocket()) }, t("roomLeave"))
      )
    );
  }

  // ---- Pocket alerts card ----

  const pocketTopic = h("code", { class: "room-code" });
  const pocketLink = h("a", { class: "btn ghost small", target: "_blank", rel: "noopener", html: `${icon("external")}<span>${t("pocketOpen")}</span>` });
  const pocketStatus = h("p", { class: "set-hint" });

  function paintPocket() {
    pocketTopic.textContent = push.topic();
    pocketLink.href = push.topicUrl();
    const on = settings.get("pocket");
    const failed = push.getStatus() === "error";
    pocketStatus.hidden = !on && !failed;
    pocketStatus.className = failed ? "set-hint warn-text" : "set-hint";
    pocketStatus.textContent = failed ? t("pocketError") : t("pocketScheduled", { n: push.scheduledCount() });
  }

  async function testPocket() {
    toast((await push.sendTest()) ? t("pocketTestSent") : t("pocketError"));
  }

  const pocketCard = () =>
    card(
      t("pocket"),
      h("p", { class: "set-hint" }, t("pocketIntro")),
      h("ol", { class: "steps" }, h("li", {}, t("pocketStep1")), h("li", {}, t("pocketStep2")), h("li", {}, t("pocketStep3"))),
      h("div", { class: "room" }, h("span", { class: "muted" }, t("pocketTopic")), pocketTopic),
      h("div", { class: "btn-row" }, pocketLink, h("button", { class: "btn ghost small", type: "button", onclick: testPocket, html: `${icon("bell")}<span>${t("pocketTestSend")}</span>` })),
      row(t("pocketToggle"), t("pocketToggleHint"), toggle("pocket")),
      pocketStatus
    );

  // ---- Page ----

  const preWarnOptions = settings.PRE_WARN_OPTIONS.map((m) => ({ value: m, text: m ? t("min", { n: m }) : t("off") }));
  const card = (title, ...children) => h("section", { class: "card set-card" }, h("h2", { class: "set-title" }, title), ...children);

  root.replaceChildren(
    h(
      "div",
      { class: "settings" },
      h("h1", {}, t("settings")),
      card(
        t("language"),
        segmented(
          [
            { value: "de", text: "Deutsch" },
            { value: "en", text: "English" },
          ],
          getLang(),
          setLang,
          t("language")
        )
      ),
      card(
        t("alerts"),
        row(t("sound"), t("soundHint"), toggle("sound")),
        row(t("vibration"), null, toggle("vibrate")),
        row(t("notifications"), t("notificationsHint"), toggle("notify", enableNotifications)),
        h("div", { class: "set-row column" }, h("span", { class: "set-label" }, t("preWarn")), segmented(preWarnOptions, settings.get("preWarn"), (v) => settings.set("preWarn", v), t("preWarn"))),
        h("button", { class: "btn ghost", type: "button", onclick: () => alerts.test(), html: `${icon("bell")}<span>${t("testAlert")}</span>` })
      ),
      pocketCard(),
      card(t("sync"), h("p", { class: "set-hint" }, t("syncHint")), h("div", { class: "set-row" }, h("span", { class: "set-label" }, t("room")), syncStatus), syncBody),
      card(
        t("tools"),
        h("a", { class: "btn ghost", href: "pocket-test.html", html: `${icon("external")}<span>${t("pocketTest")}</span>` }),
        h("a", { class: "btn ghost", href: "?demo=1#/", html: `${icon("play")}<span>${t("demoOpen")}</span>` })
      ),
      card(t("about"), h("p", { class: "muted num" }, t("version", { v: VERSION, date: BUILD_DATE })))
    )
  );

  paintStatus();
  paintSync();
  paintPocket();
  const offs = [sync.onStatus(paintStatus), push.onStatus(paintPocket), settings.onChange(paintPocket)];

  return {
    update() {},
    destroy: () => offs.forEach((off) => off()),
  };
}
