// core/link-extract.js — 链接内容提取
const { Readability } = require('@mozilla/readability');
const { parseHTML } = require('linkedom');

async function extractLinkContext(text, maxLinks = 3, timeoutMs = 5000) {
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
  const urls = (text.match(urlRegex) || []).slice(0, maxLinks);
  if (!urls.length) return '';

  const results = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) continue;
      const html = await res.text();
      const { document } = parseHTML(html.slice(0, 500000));
      const article = new Readability(document).parse();
      if (article?.textContent) {
        results.push(`[Link: ${url}]\n${article.title || ''}\n${article.textContent.slice(0, 2000)}`);
      }
    } catch {}
  }
  return results.join('\n\n');
}

module.exports = { extractLinkContext };
