/** Tags allowed when rendering annotation comments beside the transcript. */
const ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "I",
  "LI",
  "OL",
  "P",
  "PRE",
  "S",
  "SPAN",
  "STRONG",
  "U",
  "UL",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(["href", "title"]),
  SPAN: new Set(["class"]),
  DIV: new Set(["class"]),
  P: new Set(["class"]),
  CODE: new Set(["class"]),
  PRE: new Set(["class"]),
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeHtml(value: string): boolean {
  // Require a real HTML tag name (not "Hello <world>" prose).
  return /<\s*\/?\s*(?:p|br|b|i|em|strong|u|s|ul|ol|li|a|span|div|blockquote|code|pre|h[1-6]|script|style)\b/i.test(
    value,
  );
}

function plainTextToHtml(text: string): string {
  // Watch tab mounts in Zotero chrome (application/xhtml+xml); void tags
  // must be self-closing or innerHTML throws "invalid or illegal string".
  return escapeHtml(text).replace(/\r\n|\r|\n/g, "<br/>");
}

/** Normalize HTML so it can be assigned via innerHTML in XHTML documents. */
function toXhtmlFragment(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "<br/>")
    .replace(/<hr\s*\/?>/gi, "<hr/>");
}

function sanitizeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  // Allow common safe schemes used in Zotero notes/comments.
  if (/^(https?:|mailto:|zotero:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("#")) return trimmed;
  return null;
}

/** Drop disallowed nodes/attrs from a DOM tree (in place). */
function sanitizeElement(root: Element): void {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 1); // NodeFilter.SHOW_ELEMENT
  const toRemove: Element[] = [];
  const elements: Element[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current.nodeType === 1) elements.push(current as Element);
    current = walker.nextNode();
  }

  for (const el of elements) {
    const tag = el.tagName.toUpperCase();
    if (!ALLOWED_TAGS.has(tag)) {
      toRemove.push(el);
      continue;
    }
    const allowed = ALLOWED_ATTRS[tag] || new Set<string>();
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "style") {
        el.removeAttribute(attr.name);
        continue;
      }
      if (!allowed.has(attr.name.toUpperCase()) && !allowed.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "href") {
        const safe = sanitizeHref(attr.value);
        if (!safe) el.removeAttribute("href");
        else el.setAttribute("href", safe);
      }
    }
  }

  for (const el of toRemove) {
    // Keep text content of stripped wrappers.
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
}

/**
 * Convert an annotation comment (plain text or reader HTML) into safe HTML
 * for display beside the transcript.
 */
export function formatAnnotationCommentHtml(comment: string): string {
  const raw = comment?.trim() ?? "";
  if (!raw) return "";

  if (!looksLikeHtml(raw)) {
    return plainTextToHtml(raw);
  }

  try {
    // Parse as HTML (not the XHTML chrome document) so `<br>` input is accepted,
    // then serialize to XHTML-safe markup for the watch tab.
    const parserDoc =
      typeof DOMParser !== "undefined"
        ? new DOMParser().parseFromString(
            `<!DOCTYPE html><html><body><div id="yt-root"></div></body></html>`,
            "text/html",
          )
        : null;
    const doc =
      parserDoc ??
      (typeof document !== "undefined" &&
      document.contentType !== "application/xhtml+xml"
        ? document
        : null);
    if (!doc) return plainTextToHtml(raw.replace(/<[^>]+>/g, ""));

    const container =
      parserDoc?.getElementById("yt-root") ?? doc.createElement("div");
    container.innerHTML = raw;
    sanitizeElement(container);
    const html = toXhtmlFragment(container.innerHTML.trim());
    return html || plainTextToHtml(raw.replace(/<[^>]+>/g, ""));
  } catch {
    return plainTextToHtml(raw.replace(/<[^>]+>/g, ""));
  }
}

/** Join multiple comments into one HTML block for a caption line. */
export function formatLineCommentsHtml(comments: string[]): string {
  const parts = comments
    .map((c) => formatAnnotationCommentHtml(c))
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.map((html) => `<div class="yt-watch-comment-block">${html}</div>`).join("");
}
