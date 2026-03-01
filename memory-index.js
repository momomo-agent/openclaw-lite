// memory-index.js — Embedding memory search (node-llama-cpp local + OpenAI fallback + FTS5 hybrid)
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

let db = null
let embeddingProvider = null
let clawDirRef = null

// ── DB Init ──
function getDb(clawDir) {
  if (db && clawDirRef === clawDir) return db
  const Database = require('better-sqlite3')
  const pawDir = path.join(clawDir, '.paw')
  fs.mkdirSync(pawDir, { recursive: true })
  const dbPath = path.join(pawDir, 'memory-index.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  clawDirRef = clawDir

  // Load sqlite-vec extension
  try {
    const sqliteVec = require('sqlite-vec')
    sqliteVec.load(db)
  } catch (e) {
    console.warn('[memory-index] sqlite-vec not available, vector search disabled:', e.message)
  }

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB,
      model TEXT,
      FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path)`)

  // FTS5 virtual table
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, content=chunks, content_rowid=id)`)
  } catch (e) {
    console.warn('[memory-index] FTS5 init error:', e.message)
  }

  // Vector table (sqlite-vec)
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(embedding float[384], chunk_id integer)`)
  } catch (e) {
    console.warn('[memory-index] vec0 table not created (sqlite-vec may not be loaded):', e.message)
  }

  return db
}

module.exports = { getDb, initEmbeddingProvider, buildIndex, indexFile, search, collectMemoryFiles, closeDb }

// ── Cleanup ──
function closeDb() {
  if (db) { try { db.close() } catch {} db = null; clawDirRef = null }
}

// ── Embedding Provider ──
async function initEmbeddingProvider(config) {
  // Try local model first (node-llama-cpp + GGUF)
  try {
    const { getLlama, LlamaLogLevel } = await import('node-llama-cpp')
    const llama = await getLlama({ logLevel: LlamaLogLevel.error })
    // Default model — small embedding model
    const modelPath = config?.localModelPath || null
    if (modelPath && fs.existsSync(modelPath)) {
      const model = await llama.loadModel({ modelPath })
      const ctx = await model.createEmbeddingContext()
      embeddingProvider = {
        id: 'local',
        dims: 384,
        embed: async (text) => {
          const result = await ctx.getEmbeddingFor(text)
          return Array.from(result.vector)
        },
        embedBatch: async (texts) => {
          const results = []
          for (const t of texts) {
            const r = await ctx.getEmbeddingFor(t)
            results.push(Array.from(r.vector))
          }
          return results
        }
      }
      console.log('[memory-index] Local embedding provider ready')
      return embeddingProvider
    }
  } catch (e) {
    console.warn('[memory-index] Local embedding not available:', e.message)
  }

  // Fallback to OpenAI
  if (config?.apiKey) {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
    const model = 'text-embedding-3-small'
    embeddingProvider = {
      id: 'openai',
      dims: 1536,
      embed: async (text) => {
        const res = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input: text }),
          signal: AbortSignal.timeout(10000),
        })
        const data = await res.json()
        return data.data?.[0]?.embedding || []
      },
      embedBatch: async (texts) => {
        const res = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input: texts }),
          signal: AbortSignal.timeout(30000),
        })
        const data = await res.json()
        return (data.data || []).sort((a, b) => a.index - b.index).map(d => d.embedding)
      }
    }
    console.log('[memory-index] OpenAI embedding provider ready')
    return embeddingProvider
  }

  console.warn('[memory-index] No embedding provider available, using FTS5 only')
  return null
}

// ── File scanning ──
function collectMemoryFiles(clawDir) {
  const files = []
  const memoryMd = path.join(clawDir, 'MEMORY.md')
  if (fs.existsSync(memoryMd)) files.push('MEMORY.md')
  const memDir = path.join(clawDir, 'memory')
  if (fs.existsSync(memDir)) {
    const walk = (dir, prefix) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name), prefix + entry.name + '/')
        else if (entry.name.endsWith('.md')) files.push(prefix + entry.name)
      }
    }
    walk(memDir, 'memory/')
  }
  return files
}

function fileHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
}

// ── Chunking ──
const CHUNK_SIZE = 20 // lines per chunk
function chunkText(text) {
  const lines = text.split('\n')
  const chunks = []
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, lines.length)
    chunks.push({
      startLine: i + 1,
      endLine: end,
      text: lines.slice(i, end).join('\n')
    })
  }
  return chunks
}

// ── Indexing ──
async function indexFile(clawDir, relPath, onProgress) {
  const d = getDb(clawDir)
  const absPath = path.join(clawDir, relPath)
  if (!fs.existsSync(absPath)) {
    d.prepare('DELETE FROM files WHERE path = ?').run(relPath)
    d.prepare('DELETE FROM chunks WHERE file_path = ?').run(relPath)
    return
  }
  const content = fs.readFileSync(absPath, 'utf8')
  const hash = fileHash(content)
  const stat = fs.statSync(absPath)

  // Check if already indexed with same hash
  const existing = d.prepare('SELECT hash FROM files WHERE path = ?').get(relPath)
  if (existing?.hash === hash) return

  // Remove old chunks
  d.prepare('DELETE FROM chunks WHERE file_path = ?').run(relPath)

  // Upsert file record
  d.prepare('INSERT OR REPLACE INTO files (path, hash, mtime, size) VALUES (?, ?, ?, ?)').run(relPath, hash, stat.mtimeMs, stat.size)

  // Chunk and insert
  const chunks = chunkText(content)
  const insertChunk = d.prepare('INSERT INTO chunks (file_path, start_line, end_line, text, embedding, model) VALUES (?, ?, ?, ?, ?, ?)')

  for (const chunk of chunks) {
    let embedding = null
    let model = null
    if (embeddingProvider && chunk.text.trim()) {
      try {
        const vec = await embeddingProvider.embed(chunk.text)
        embedding = Buffer.from(new Float32Array(vec).buffer)
        model = embeddingProvider.id
      } catch (e) {
        console.warn(`[memory-index] Embedding failed for ${relPath}:${chunk.startLine}:`, e.message)
      }
    }
    insertChunk.run(relPath, chunk.startLine, chunk.endLine, chunk.text, embedding, model)
  }

  // Rebuild FTS index for this file
  try {
    const rows = d.prepare('SELECT id, text FROM chunks WHERE file_path = ?').all(relPath)
    for (const row of rows) {
      d.prepare('INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)').run(row.id, row.text)
    }
  } catch {}

  // Insert into vector table
  if (embeddingProvider) {
    try {
      const rows = d.prepare('SELECT id, embedding FROM chunks WHERE file_path = ? AND embedding IS NOT NULL').all(relPath)
      for (const row of rows) {
        d.prepare('INSERT INTO chunks_vec(embedding, chunk_id) VALUES (?, ?)').run(row.embedding, row.id)
      }
    } catch {}
  }

  if (onProgress) onProgress(relPath)
}

// ── Full index rebuild ──
async function buildIndex(clawDir, config, onProgress) {
  const d = getDb(clawDir)
  await initEmbeddingProvider(config)
  const files = collectMemoryFiles(clawDir)
  for (let i = 0; i < files.length; i++) {
    await indexFile(clawDir, files[i], onProgress)
    if (onProgress) onProgress(files[i], i + 1, files.length)
  }
  return files.length
}

// ── Hybrid Search ──
async function search(clawDir, query, maxResults = 10) {
  const d = getDb(clawDir)
  const results = new Map() // chunk_id -> { path, startLine, endLine, score, snippet }

  // 1. FTS5 keyword search
  try {
    const ftsQuery = query.split(/\s+/).filter(Boolean).map(w => `"${w}"`).join(' OR ')
    const ftsRows = d.prepare(`
      SELECT c.id, c.file_path, c.start_line, c.end_line, c.text,
             rank AS score
      FROM chunks_fts f JOIN chunks c ON c.id = f.rowid
      WHERE chunks_fts MATCH ?
      ORDER BY rank LIMIT ?
    `).all(ftsQuery, maxResults * 2)
    for (const r of ftsRows) {
      results.set(r.id, {
        path: r.file_path, startLine: r.start_line, endLine: r.end_line,
        score: Math.abs(r.score), snippet: r.text.slice(0, 200), source: 'fts'
      })
    }
  } catch {}

  // 2. Vector search (if embedding available)
  if (embeddingProvider) {
    try {
      const qVec = await embeddingProvider.embed(query)
      const qBuf = Buffer.from(new Float32Array(qVec).buffer)
      const vecRows = d.prepare(`
        SELECT chunk_id, distance FROM chunks_vec
        WHERE embedding MATCH ? ORDER BY distance LIMIT ?
      `).all(qBuf, maxResults * 2)
      for (const vr of vecRows) {
        const chunk = d.prepare('SELECT file_path, start_line, end_line, text FROM chunks WHERE id = ?').get(vr.chunk_id)
        if (!chunk) continue
        const cosineScore = 1 - vr.distance // distance → similarity
        const existing = results.get(vr.chunk_id)
        if (existing) {
          existing.score = existing.score + cosineScore * 2 // boost hybrid matches
          existing.source = 'hybrid'
        } else {
          results.set(vr.chunk_id, {
            path: chunk.file_path, startLine: chunk.start_line, endLine: chunk.end_line,
            score: cosineScore, snippet: chunk.text.slice(0, 200), source: 'vector'
          })
        }
      }
    } catch (e) {
      console.warn('[memory-index] Vector search error:', e.message)
    }
  }

  // Sort by score descending, return top N
  return [...results.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}

