// data/engines/kiwix/index.js

let kiwixUrl = "";
let bookName = "";
let pageLength = "10";

export default {
  name: "Kiwix",
  type: "web",
  bangShortcut: "kiwix",

  settingsSchema: [
    {
      key: "kiwixUrl",
      label: "Kiwix server URL",
      type: "url",
      required: true,
      placeholder: "http://localhost:8080",
      description: "Base URL of your kiwix-serve instance, no trailing slash.",
    },
    {
      key: "bookName",
      label: "Book name (optional)",
      type: "text",
      required: false,
      placeholder: "devdocs_en",
      description: "Leave empty to search across every ZIM kiwix-serve is hosting.",
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
    kiwixUrl = (settings.kiwixUrl || "").replace(/\/+$/, "");
    bookName = settings.bookName || "";
    pageLength = settings.pageLength || "10";
  },

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!kiwixUrl) return [];

    const length = Number(pageLength) || 10;
    const params = new URLSearchParams({
      pattern: query,
      pageLength: String(length),
      start: String((Math.max(page, 1) - 1) * length),
    });
    if (bookName) params.set("books.name", bookName);

    const doFetch = context?.fetch ?? fetch;
    const res = await doFetch(`${kiwixUrl}/search?${params.toString()}`);
    if (!res.ok) return [];

    return parseKiwixResults(await res.text(), kiwixUrl);
  },
};


function parseKiwixResults(html, base) {
  const results = [];
  const itemRe =
    /<li>\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<cite>([\s\S]*?)<\/cite>\s*<div class="book-title">([\s\S]*?)<\/div>/gi;

  let match;
  while ((match = itemRe.exec(html)) !== null) {
    const [, href, rawTitle, rawSnippet, rawBookTitle] = match;

    let title = stripTags(rawTitle);
    title = title.replace(/^\.{2,}\s*/, "");

    results.push({
      title: title || href,
      url: href.startsWith("http") ? href : `${base}${href}`,
      snippet: stripTags(rawSnippet),
      source: stripTags(rawBookTitle).replace(/^from\s+/i, ""), // "from Rust Docs" -> "Rust Docs"
    });
  }
  return results;
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
