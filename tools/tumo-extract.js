// Reads a session page of a TUMO teacher site as plain structured text.
// Run in a browser tab that is signed in and currently on sites.google.com
// (paste into the console, or pass to a browser automation tool), then call e.g.
//   await tumoPage("game-development-level1-eng", 1)
//   await tumoPage("game-development-level1-de", 1)
// Output: headings as "## title {#anchor}", paragraphs, "- " list items,
// "[embed <url>]" for embedded slides (the slide number is in the URL),
// and all Google Docs/Slides links at the end.
window.tumoPage = async (site, n) => {
  const html = await fetch(`/tumo.org/${site}/session-${n}`, { credentials: "include" }).then((r) => r.text());
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,nav,header").forEach((e) => e.remove());
  const out = [];
  const clean = (s) => s.trim().replace(/\s+/g, " ");
  const walk = (el) => {
    for (const c of el.children) {
      const tag = c.tagName;
      if (/^H[1-4]$/.test(tag)) {
        out.push(`\n${"#".repeat(+tag[1])} ${clean(c.textContent)}${c.id ? ` {#${c.id.replace(/_l$/, "")}}` : ""}`);
      } else if (tag === "P" || tag === "LI") {
        const text = clean(c.textContent);
        const links = [...c.querySelectorAll("a[href]")].map((a) => a.href).filter((u) => !/\/session-\d/.test(u));
        if (text) out.push(`${tag === "LI" ? "- " : ""}${text}${links.length ? ` <${links.join(" ")}>` : ""}`);
      } else {
        const url = c.getAttribute("data-url") || c.getAttribute("data-src") || c.getAttribute("src") || "";
        if (/docs\.google|youtu/.test(url)) out.push(`[embed ${url.replace(/authuser=\d&?/, "")}]`);
        walk(c);
      }
    }
  };
  walk(doc.body);
  const docs = [...new Set([...doc.querySelectorAll("a[href]")].map((a) => a.href).filter((u) => /docs\.google|drive\.google/.test(u)))];
  return `${out.join("\n")}\n\nLinks:\n${docs.join("\n")}`;
};
