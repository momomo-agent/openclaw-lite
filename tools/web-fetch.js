// tools/web-fetch.js
const { registerTool } = require('./registry');

registerTool({
  name: 'web_fetch',
  description: 'Fetch and convert a web page to markdown. Use this to read articles, documentation, or any web content.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch'
      },
      maxChars: {
        type: 'number',
        description: 'Maximum characters to return (default: 50000)'
      }
    },
    required: ['url']
  },
  handler: async (args) => {
    const { url, maxChars = 50000 } = args;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(15000)
      });
      
      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText}`;
      }
      
      const contentType = response.headers.get('content-type') || '';
      const html = await response.text();
      
      // If not HTML, return as-is
      if (!contentType.includes('html')) {
        return html.slice(0, maxChars);
      }
      
      // Extract readable content using Readability
      const { Readability } = require('@mozilla/readability');
      const { parseHTML } = require('linkedom');
      const { document } = parseHTML(html.slice(0, 1000000));
      const reader = new Readability(document);
      const article = reader.parse();
      
      if (article?.textContent) {
        const title = article.title ? `# ${article.title}\n\n` : '';
        const content = title + article.textContent;
        return content.slice(0, maxChars);
      }
      
      // Fallback: strip HTML tags
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return text.slice(0, maxChars);
    } catch (error) {
      return `Error fetching ${url}: ${error.message}`;
    }
  }
});
