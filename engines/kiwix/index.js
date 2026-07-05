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

// kiwix-serve's built-in search template renders hits roughly as:
// <li class="result"><a href="/viewer#book/A/path">Title</a><p class="snippet">…</p></li>
// This is regex-scraped rather than DOM-parsed to avoid a dependency.
// IMPORTANT: kiwix-serve's HTML has changed across versions before — curl your
// own /search?pattern=test&books.name=... and check it actually matches this
// shape before relying on it; adjust the two regexes below if not.
function parseKiwixResults(html, base) {
  const results = [];
  const itemRe = /<li[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
  const snippetRe = /<p[^>]*class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\/p>/i;

  let match;
  while ((match = itemRe.exec(html)) !== null) {
    const block = match[1];
    const linkMatch = linkRe.exec(block);
    if (!linkMatch) continue;

    const href = linkMatch[1];
    const snippetMatch = snippetRe.exec(block);

    results.push({
      title: stripTags(linkMatch[2]) || href,
      url: href.startsWith("http") ? href : `${base}${href}`,
      snippet: snippetMatch ? stripTags(snippetMatch[1]) : "",
      source: "Kiwix",
    });
  }
  return results;
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
