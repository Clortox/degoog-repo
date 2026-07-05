// data/engines/zotero-fulltext/index.js
//
// Searches the *content* of your Zotero publications — the indexed full text
// of your PDF attachments — via the official Zotero Web API
// (https://api.zotero.org), and renders the hits in Degoog's normal web
// search tab.
//
// It runs a `qmode=everything` quick search (which matches Zotero's full-text
// index), then, for each hit, pulls the attachment's indexed text and builds a
// snippet around the query so you see the matching passage. Results deep-link
// straight into the PDF with `zotero://open-pdf`.

let apiUrl = "https://api.zotero.org";
let libraryType = "users";
let libraryId = "";
let apiKey = "";
let pageLength = 10;
let pdfSnippets = true;

export default {
  name: "Zotero Full Text",
  type: "web",
  bangShortcut: "zoterotext",

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
      description:
        "Your numeric userID (shown on the API keys page) or a group ID.",
    },
    {
      key: "libraryType",
      label: "Library type",
      type: "select",
      required: false,
      default: "users",
      options: [
        { value: "users", label: "Personal (users)" },
        { value: "groups", label: "Group (groups)" },
      ],
    },
    {
      key: "pdfSnippets",
      label: "Show matching PDF text",
      type: "toggle",
      required: false,
      default: true,
      description:
        "Fetch each hit's indexed full text and show the passage around your query. Adds extra API requests per result.",
    },
    {
      key: "apiUrl",
      label: "Zotero API base URL",
      type: "url",
      required: false,
      default: "https://api.zotero.org",
      description: "Only change this if you self-host the Zotero API.",
    },
    {
      key: "pageLength",
      label: "Results per page",
      type: "text",
      required: false,
      default: "10",
    },
  ],

  configure(settings) {
    apiUrl = (settings.apiUrl || "https://api.zotero.org").replace(/\/+$/, "");
    libraryType = settings.libraryType || "users";
    libraryId = (settings.libraryId || "").trim();
    apiKey = settings.apiKey || "";
    pageLength = Number(settings.pageLength) || 10;
    pdfSnippets =
      settings.pdfSnippets === undefined ? true : Boolean(settings.pdfSnippets);
  },

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!query || !libraryId || !apiKey) return [];

    const limit = pageLength;
    const start = (Math.max(page, 1) - 1) * limit;
    const base = `${apiUrl}/${libraryType}/${libraryId}`;
    const doFetch = context?.fetch ?? fetch;

    const params = new URLSearchParams({
      q: query,
      qmode: "everything", // matches Zotero's full-text index
      itemType: "-attachment",
      limit: String(limit),
      start: String(start),
      format: "json",
    });

    const response = await doFetch(`${base}/items?${params.toString()}`, {
      headers: headers(),
    });
    context?.sentinel?.(response, this.name);
    if (!response.ok) return [];

    const items = await response.json();
    if (!Array.isArray(items)) return [];

    return Promise.all(
      items.map((item) => buildResult(item, query, base, doFetch)),
    );
  },
};

async function buildResult(item, query, base, doFetch) {
  const d = item.data || {};
  const creators = (d.creators || [])
    .map((c) => c.name || [c.firstName, c.lastName].filter(Boolean).join(" "))
    .filter(Boolean);

  const result = {
    title: d.title || d.filename || item.key,
    url: selectUrl(libraryType, libraryId, item.key),
    snippet: d.abstractNote
      ? d.abstractNote.replace(/\s+/g, " ").slice(0, 220)
      : [prettyType(d.itemType), d.date, creators.slice(0, 3).join(", ")]
          .filter(Boolean)
          .join(" · "),
    source: creators.length ? `Zotero · ${creators[0]}` : "Zotero",
  };

  if (!pdfSnippets) return result;

  // Enrich with the matching passage from the attachment's indexed text.
  try {
    const kids = await getJson(`${base}/items/${item.key}/children`, doFetch);
    const attachments = (Array.isArray(kids) ? kids : [])
      .filter((k) => k.data && k.data.itemType === "attachment")
      // prefer PDFs, which is what Zotero full-text-indexes
      .sort(
        (a, b) =>
          (b.data.contentType === "application/pdf" ? 1 : 0) -
          (a.data.contentType === "application/pdf" ? 1 : 0),
      );

    for (const att of attachments) {
      const ft = await getJson(
        `${base}/items/${att.key}/fulltext`,
        doFetch,
      ).catch(() => null);
      if (ft && ft.content) {
        const snippet = makeSnippet(ft.content, query);
        if (snippet) result.snippet = snippet;
        result.url = openPdfUrl(libraryType, libraryId, att.key);
        break;
      }
    }
  } catch {
    // Best-effort enrichment; fall back to the metadata snippet above.
  }

  return result;
}

async function getJson(url, doFetch) {
  const res = await doFetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Zotero API ${res.status}`);
  return res.json();
}

function headers() {
  return {
    "Zotero-API-Version": "3",
    "Zotero-API-Key": apiKey,
    Accept: "application/json",
  };
}

// Build a ~320-char excerpt centred on the first query term found in the text.
function makeSnippet(content, query, radius = 160) {
  const flat = String(content || "").replace(/\s+/g, " ").trim();
  if (!flat) return "";

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = flat.toLowerCase();

  let idx = -1;
  for (const w of words) {
    const i = lower.indexOf(w);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }

  if (idx === -1) {
    return flat.slice(0, 240) + (flat.length > 240 ? "…" : "");
  }

  const startPos = Math.max(0, idx - radius);
  const endPos = Math.min(flat.length, idx + radius);
  return (
    (startPos > 0 ? "…" : "") +
    flat.slice(startPos, endPos).trim() +
    (endPos < flat.length ? "…" : "")
  );
}

function prettyType(itemType) {
  if (!itemType) return "";
  return itemType
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function selectUrl(type, id, key) {
  if (type === "groups") return `zotero://select/groups/${id}/items/${key}`;
  return `zotero://select/library/items/${key}`;
}

function openPdfUrl(type, id, key) {
  if (type === "groups") return `zotero://open-pdf/groups/${id}/items/${key}`;
  return `zotero://open-pdf/library/items/${key}`;
}
