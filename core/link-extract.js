// core/link-extract.js — 链接内容提取
// Only extract bare URLs that the user explicitly pasted, not markdown/code URLs

async function extractLinkContext(text, maxLinks = 3, timeoutMs = 5000) {
  if (!text) return '';

  // Strip markdown links [text](url), inline code `...`, and code blocks ```...```
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '')     // code blocks
    .replace(/`[^`]+`/g, '')            // inline code
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')  // markdown links → keep text only

  // Now match bare URLs in the cleaned text
  const urls = [...new Set((cleaned.match(/https?:\/\/\S+/gi) || []).slice(0, maxLinks))];
  if (!urls.length) return '';
  const results = await Promise.allSettled(urls.map(async (url) => {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(timeoutMs), redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) return null;
    const html = await res.text();
    const { Readability } = require('@mozilla/readability');
    const { parseHTML } = require('linkedom');
    const { document } = parseHTML(html.slice(0, 500000));
    const article = new Readability(document).parse();
    if (!article?.textContent) return null;
    const title = article.title || url;
    const summary = article.textContent.replace(/\s+/g, ' ').trim().slice(0, 500);
    return `[Link: ${title}] ${summary}`;
  }));
  return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value).join('\n\n');
}

module.exports = { extractLinkContext };
