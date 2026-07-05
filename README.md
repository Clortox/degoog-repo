# Degoog-repo

A collection of my custom extensions for the wonderful
[Degoog](https://github.com/degoog-org/degoog) search engine.

## Engines

### Kiwix

A search engine that supports configuring a
[kiwix](https://kiwix.org/en/) instance as a search engine.

### Zotero

Search your [Zotero](https://www.zotero.org/) library through the official
Zotero Web API (`https://api.zotero.org`). Ships as two complementary engines:

- **Zotero** (`type: file`, bang `!zotero`) — lists your publications in the
  **Files** tab. Each result deep-links back into the app with `zotero://select`.
- **Zotero Full Text** (`type: web`, bang `!zoterotext`) — runs a
  `qmode=everything` quick search against Zotero's full-text index (your PDF
  text content) and renders hits in the **normal** search tab. For each hit it
  pulls the attachment's indexed text and shows the passage around your query,
  linking straight into the PDF with `zotero://open-pdf`.

Both engines need a **Zotero API key** (create one at
<https://www.zotero.org/settings/keys>) and your numeric **userID** (shown on
that same keys page). Configure them under Settings → Engines.
