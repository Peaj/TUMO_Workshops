// DOM helpers, toast and modal dialogs.

import { t } from "./i18n.js";

/**
 * h("button", { class: "btn", onclick, html: icon("play"), "aria-label": "Play" }, "text", node)
 * Props: class, html (trusted markup only), on<event> handlers, everything else as attribute.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "html") el.innerHTML = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

let toastTimer = null;

/** Short message at the bottom. With onTap the toast is a button and stays longer. */
export function toast(message, onTap) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.toggle("tappable", !!onTap);
  el.onclick = onTap || null;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), onTap ? 10000 : 2600);
}

/** Modal built on <dialog>. Resolves to the input value (prompt), true (confirm) or null. */
function modal({ message, input, okLabel, danger }) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("dialog");
    const field = input ? h("input", { class: "field", type: "text", value: input.value ?? "", placeholder: input.placeholder ?? "", maxlength: "40", "aria-label": message }) : null;
    const form = h(
      "form",
      { method: "dialog", class: "dialog-body" },
      h("p", { class: "dialog-message" }, message),
      field,
      h(
        "div",
        // OK comes first so Enter submits it; CSS (row-reverse) shows it on the right.
        { class: "dialog-actions" },
        h("button", { class: danger ? "btn danger" : "btn primary", value: "ok", type: "submit" }, okLabel || t("ok")),
        h("button", { class: "btn ghost", value: "cancel", type: "submit" }, t("cancel"))
      )
    );
    dialog.replaceChildren(form);
    dialog.onclose = () => {
      if (dialog.returnValue !== "ok") resolve(null);
      else if (field) resolve(field.value.trim() || null);
      else resolve(true);
    };
    dialog.returnValue = "";
    dialog.showModal();
    if (field) {
      field.focus();
      field.select();
    }
  });
}

export const confirmDialog = (message, okLabel, danger = false) => modal({ message, okLabel, danger });
export const promptDialog = (message, value, placeholder) => modal({ message, input: { value, placeholder }, okLabel: t("save") });
