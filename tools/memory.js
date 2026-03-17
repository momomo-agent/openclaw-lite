// tools/memory.js — memory_search + memory_get
const { registerTool } = require('./registry');
const fs = require('fs');
const path = require('path');

function searchMemoryFiles(dir, query, maxResults) {
  const results = [];
  const keywords = query.split(/\s+/).filter(Boolean);
  const files = [];
  const memDir = path.join(dir, 'memory');
  if (fs.existsSync(path.join(dir, 'MEMORY.md'))) files.push('MEMORY.md');
  if (fs.existsSync(memDir)) {
    const walk = (d, prefix) => {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        const rel = prefix ? `${prefix}/${f}` : f;
        if (fs.statSync(full).isDirectory()) walk(full, rel);
        else if (f.endsWith('.md')) files.push(`memory/${rel}`);
      }
    };
    walk(memDir, '');
  }
  for (const relPath of files) {
    const content = fs.readFileSync(path.join(dir, relPath), 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      const hits = keywords.filter(k => lower.includes(k)).length;
      if (hits === 0) continue;
      const score = hits / keywords.length;
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length, i + 3);
      const snippet = lines.slice(start, end).join('\n').slice(0, 500);
      results.push({ path: relPath, startLine: start + 1, endLine: end, score, snippet });
    }
  }
  results.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    const key = `${r.path}:${Math.floor(r.startLine / 4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
    if (deduped.length >= maxResults) break;
  }
  return deduped;
}

registerTool({
  name: 'memory_search',
  description: 'Semantically search MEMORY.md + memory/*.md. Use before answering questions about prior work, decisions, dates, people, preferences, or todos.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      maxResults: { type: 'number' },
      minScore: { type: 'number' }
    },
    required: ['query']
  },
  handler: async (args, context) => {
    const { clawDir, memoryIndex } = context;
    if (!clawDir) return 'Error: No claw directory';
    const query = (args.query || '').trim();
    if (!query) return 'Error: query required';
    const maxResults = args.maxResults || 5;
    try {
      if (memoryIndex) {
        const results = await memoryIndex.search(clawDir, query, maxResults);
        return JSON.stringify({ results });
      }
    } catch (e) { /* fallback below */ }
    const results = searchMemoryFiles(clawDir, query.toLowerCase(), maxResults);
    return JSON.stringify({ results });
  }
});

registerTool({
  name: 'memory_get',
  description: 'Read a snippet from MEMORY.md or memory/*.md with optional line range. Use after memory_search to pull needed lines.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      from: { type: 'number', description: 'Start line (1-indexed)' },
      lines: { type: 'number', description: 'Number of lines to read' }
    },
    required: ['path']
  },
  handler: async (args, context) => {
    const { clawDir } = context;
    if (!clawDir) return 'Error: No claw directory';
    const relPath = (args.path || '').trim();
    if (!relPath) return 'Error: path required';
    if (!relPath.endsWith('.md')) return 'Error: only .md files allowed';
    const absPath = path.resolve(clawDir, relPath);
    if (!absPath.startsWith(clawDir)) return 'Error: path outside claw directory';
    if (!fs.existsSync(absPath)) return `Error: file not found: ${relPath}`;
    const content = fs.readFileSync(absPath, 'utf8');
    if (!args.from && !args.lines) return JSON.stringify({ text: content, path: relPath });
    const allLines = content.split('\n');
    const start = Math.max(1, args.from || 1);
    const count = Math.max(1, args.lines || allLines.length);
    const slice = allLines.slice(start - 1, start - 1 + count);
    return JSON.stringify({ text: slice.join('\n'), path: relPath, from: start, lines: slice.length });
  }
});

registerTool({
  name: 'memory_write',
  description: 'Write or append to memory files (MEMORY.md or memory/*.md). Use to record important decisions, user preferences, project context, or anything worth remembering across sessions.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path within claw directory (e.g. MEMORY.md, memory/notes.md)' },
      content: { type: 'string', description: 'Content to write' },
      mode: { type: 'string', enum: ['append', 'overwrite'], description: 'append (default) or overwrite' }
    },
    required: ['path', 'content']
  },
  handler: async (args, context) => {
    const { clawDir } = context;
    if (!clawDir) return 'Error: No claw directory';
    const relPath = (args.path || '').trim();
    if (!relPath) return 'Error: path required';
    if (!relPath.endsWith('.md')) return 'Error: only .md files allowed';
    const absPath = path.resolve(clawDir, relPath);
    if (!absPath.startsWith(clawDir)) return 'Error: path outside claw directory';
    // Ensure parent directory exists
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const content = args.content || '';
    if (args.mode === 'overwrite') {
      fs.writeFileSync(absPath, content, 'utf8');
    } else {
      // Append with newline separator
      const existing = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : '';
      const separator = existing && !existing.endsWith('\n') ? '\n' : '';
      fs.writeFileSync(absPath, existing + separator + content + '\n', 'utf8');
    }
    return JSON.stringify({ ok: true, path: relPath, mode: args.mode || 'append' });
  }
});
