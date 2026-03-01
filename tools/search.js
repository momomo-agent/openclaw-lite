// tools/search.js
const { registerTool } = require('./registry');

registerTool({
  name: 'search',
  description: 'Search the web using Tavily API',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results (default: 5)'
      }
    },
    required: ['query']
  },
  handler: async (args, context) => {
    const { tavilyKey } = context;
    const { query, maxResults = 5 } = args;
    
    if (!tavilyKey) {
      return 'Error: Tavily API key not configured';
    }
    
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          max_results: maxResults,
          include_answer: true
        })
      });
      
      if (!response.ok) {
        return `Error: HTTP ${response.status}`;
      }
      
      const data = await response.json();
      
      let result = '';
      if (data.answer) {
        result += `Answer: ${data.answer}\n\n`;
      }
      
      if (data.results && data.results.length > 0) {
        result += 'Results:\n';
        data.results.forEach((r, i) => {
          result += `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}\n\n`;
        });
      }
      
      return result || 'No results found';
    } catch (error) {
      return `Error searching: ${error.message}`;
    }
  }
});
