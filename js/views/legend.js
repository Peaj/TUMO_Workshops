// Legends for section types (minimap colours) and item kinds (icons).

import { h } from "../ui.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { TYPES, KINDS } from "../data.js";

export function legend(which) {
  if (which === "types") {
    return h(
      "ul",
      { class: "legend types", "aria-label": t("legendSections") },
      TYPES.map((type) => h("li", { class: `type-${type}` }, h("span", { class: "swatch" }), t(`type_${type}`)))
    );
  }
  return h(
    "details",
    { class: "legend-details" },
    h("summary", {}, t("legend")),
    h("p", { class: "legend-title" }, t("legendSections")),
    legend("types"),
    h("p", { class: "legend-title" }, t("legendItems")),
    h(
      "ul",
      { class: "legend kinds" },
      KINDS.map((kind) => h("li", { class: `k-${kind}` }, h("span", { class: "item-ico", html: icon(kind) }), t(`kind_${kind}`)))
    )
  );
}
