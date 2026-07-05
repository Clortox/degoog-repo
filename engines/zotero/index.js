// data/engines/zotero/index.js
//
// Searches your Zotero library (via the official Zotero Web API at
// https://api.zotero.org) and surfaces matching items in Degoog's Files tab.
//
// This engine matches on item metadata (titles, creators, year) by default.
// For searching the *content* of your PDFs, use the companion "Zotero Full
// Text" engine, which searches indexed full-text and renders in the normal
// web-search tab.

const apiUrl = "https://api.zotero.org";
let libraryId = "";
let apiKey = "";
let pageLength = 25;

export default {
  name: "Zotero",
  type: "file",
  bangShortcut: "zotero",

  settingsSchema: [
    {
      key: "apiKey",
      label: "Zotero API key",
      type: "password",
      required: true,
      secret: true,
      description:
        "Create one at https://www.zotero.org/settings/keys with library read access.",
    },
    {
      key: "libraryId",
      label: "Library ID",
      type: "text",
      required: true,
      placeholder: "1234567",
      description: "Your numeric Zotero userID (shown on the API keys page).",
    },
    {
      key: "pageLength",
      label: "Results per page",
      type: "text",
      required: false,
      default: "25",
    },
  ],

  configure(settings) {
    libraryId = (settings.libraryId || "").trim();
    apiKey = settings.apiKey || "";
    pageLength = Number(settings.pageLength) || 25;
  },

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!query || !libraryId || !apiKey) return [];

    const limit = pageLength;
    const start = (Math.max(page, 1) - 1) * limit;

    const params = new URLSearchParams({
      q: query,
      qmode: "everything", // match everything, including PDF full text
      itemType: "-attachment", // hide raw attachments; show the parent items
      limit: String(limit),
      start: String(start),
      format: "json",
    });

    const base = `${apiUrl}/users/${libraryId}`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(`${base}/items?${params.toString()}`, {
      headers: {
        "Zotero-API-Version": "3",
        "Zotero-API-Key": apiKey,
        Accept: "application/json",
      },
    });
    context?.sentinel?.(response, this.name);
    if (!response.ok) return [];

    const items = await response.json();
    if (!Array.isArray(items)) return [];

    return items.map((item) => {
      const d = item.data || {};
      const creators = (d.creators || [])
        .map(
          (c) =>
            c.name ||
            [c.firstName, c.lastName].filter(Boolean).join(" "),
        )
        .filter(Boolean);

      const meta = [
        prettyType(d.itemType),
        d.date,
        creators.slice(0, 3).join(", ") +
          (creators.length > 3 ? " et al." : ""),
      ]
        .filter((s) => s && s.trim())
        .join(" · ");

      const abstract = d.abstractNote
        ? ` — ${d.abstractNote.replace(/\s+/g, " ").slice(0, 200)}`
        : "";

      return {
        title: d.title || d.filename || item.key,
        url: `zotero://select/library/items/${item.key}`,
        snippet: (meta + abstract) || "Zotero item",
        source: "Zotero",
      };
    });
  },
};

function prettyType(itemType) {
  if (!itemType) return "";
  return itemType
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());
}
