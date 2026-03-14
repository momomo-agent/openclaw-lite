/**
 * test/file-attachments.test.mjs — Tests for file attachment handling
 *
 * Covers: drag & drop file processing, image vision, path injection,
 * preview window support, screen capture tool.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// ── File processing logic (extracted from main.js _runChat) ──

function buildUserContent(prompt, files) {
  const userContent = []
  let fileContext = ''

  if (files?.length) {
    for (const f of files) {
      if (f.type?.startsWith('image/') ) {
        let base64 = null
        if (f.path && fs.existsSync(f.path)) {
          base64 = fs.readFileSync(f.path).toString('base64')
        } else if (f.data) {
          base64 = f.data.replace(/^data:[^;]+;base64,/, '')
        }
        if (base64) {
          userContent.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: base64 } })
        }
      } else if (f.path) {
        const stat = fs.existsSync(f.path) ? fs.statSync(f.path) : null
        const isDir = stat?.isDirectory()
        const sizeStr = stat ? `${(stat.size / 1024).toFixed(1)}KB` : ''
        fileContext += `\n📎 ${isDir ? '📁' : ''} ${f.path}${sizeStr ? ` (${sizeStr})` : ''}`
      }
    }
  }

  const contextSuffix = fileContext ? `\n\n[Attached files]${fileContext}` : ''
  const textWithContext = contextSuffix ? `${prompt}${contextSuffix}` : prompt
  userContent.push({ type: 'text', text: textWithContext || '(attached files)' })
  return userContent
}

// ── Preview support detection (extracted from main.js open-file-preview) ──

function getPreviewType(filePath) {
  const ext = path.extname(filePath).toLowerCase().slice(1)
  const imgExts = ['png','jpg','jpeg','gif','webp','svg']
  const vidExts = ['mp4','mov','webm','mkv','avi']
  const audExts = ['mp3','wav','ogg','m4a','flac','aac']
  const mdExts = ['md','markdown']

  if (imgExts.includes(ext)) return 'image'
  if (vidExts.includes(ext)) return 'video'
  if (audExts.includes(ext)) return 'audio'
  if (mdExts.includes(ext)) return 'markdown'
  return null
}

// ── Tool result with image (extracted from stream-anthropic.js) ──

function buildToolResultContent(result, truncate = s => String(s)) {
  if (result && typeof result === 'object' && result.image) {
    return [
      { type: 'text', text: truncate(result.result || result.error || 'Done') },
      { type: 'image', source: result.image },
    ]
  }
  return truncate(result)
}

// ══════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════

describe('File attachment processing', () => {
  const tmpDir = path.join(os.tmpdir(), 'paw-test-' + Date.now())

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  // ── Image files → vision API ──

  it('image with path becomes vision content', () => {
    const imgPath = path.join(tmpDir, 'test.png')
    fs.writeFileSync(imgPath, Buffer.from('fake-png-data'))

    const content = buildUserContent('describe this', [
      { name: 'test.png', type: 'image/png', path: imgPath },
    ])

    expect(content).toHaveLength(2) // image + text
    expect(content[0].type).toBe('image')
    expect(content[0].source.media_type).toBe('image/png')
    expect(content[0].source.data).toBe(Buffer.from('fake-png-data').toString('base64'))
    expect(content[1].type).toBe('text')
    expect(content[1].text).toBe('describe this')
  })

  it('image with base64 data becomes vision content', () => {
    const b64 = Buffer.from('pasted-image').toString('base64')
    const content = buildUserContent('what is this', [
      { name: 'paste.png', type: 'image/png', data: `data:image/png;base64,${b64}` },
    ])

    expect(content[0].type).toBe('image')
    expect(content[0].source.data).toBe(b64)
  })

  // ── Non-image files → path only ──

  it('text file with path injects path into prompt', () => {
    const filePath = path.join(tmpDir, 'app.tsx')
    fs.writeFileSync(filePath, 'export default function App() {}')

    const content = buildUserContent('review this', [
      { name: 'app.tsx', type: 'text/typescript', path: filePath },
    ])

    expect(content).toHaveLength(1) // text only, no image
    expect(content[0].text).toContain('[Attached files]')
    expect(content[0].text).toContain(filePath)
    expect(content[0].text).not.toContain('export default') // content NOT injected
  })

  it('directory path is included with folder indicator', () => {
    const dirPath = path.join(tmpDir, 'my-project')
    fs.mkdirSync(dirPath, { recursive: true })

    const content = buildUserContent('what is this project', [
      { name: 'my-project', type: '', path: dirPath },
    ])

    expect(content[0].text).toContain('📁')
    expect(content[0].text).toContain(dirPath)
  })

  it('multiple files: images go to vision, others go to path list', () => {
    const imgPath = path.join(tmpDir, 'photo.jpg')
    const jsPath = path.join(tmpDir, 'index.js')
    fs.writeFileSync(imgPath, Buffer.from('jpg-data'))
    fs.writeFileSync(jsPath, 'console.log("hi")')

    const content = buildUserContent('explain', [
      { name: 'photo.jpg', type: 'image/jpeg', path: imgPath },
      { name: 'index.js', type: 'text/javascript', path: jsPath },
    ])

    expect(content).toHaveLength(2) // image + text
    expect(content[0].type).toBe('image')
    expect(content[1].text).toContain(jsPath)
    expect(content[1].text).not.toContain(imgPath) // image path not in text
  })

  it('no files: prompt passes through unchanged', () => {
    const content = buildUserContent('hello', [])
    expect(content).toHaveLength(1)
    expect(content[0].text).toBe('hello')
  })

  it('empty prompt with files still works', () => {
    const content = buildUserContent('', [
      { name: 'photo.png', type: 'image/png', data: 'data:image/png;base64,abc' },
    ])
    expect(content[0].type).toBe('image')
    expect(content[1].text).toBe('(attached files)')
  })

  it('file size is shown in path context', () => {
    const filePath = path.join(tmpDir, 'big.json')
    fs.writeFileSync(filePath, JSON.stringify({ data: 'x'.repeat(5000) }))

    const content = buildUserContent('check this', [
      { name: 'big.json', type: 'application/json', path: filePath },
    ])

    expect(content[0].text).toMatch(/\(\d+\.\dKB\)/)
  })
})

describe('Preview type detection', () => {
  it('detects image types', () => {
    expect(getPreviewType('photo.png')).toBe('image')
    expect(getPreviewType('photo.jpg')).toBe('image')
    expect(getPreviewType('photo.jpeg')).toBe('image')
    expect(getPreviewType('icon.gif')).toBe('image')
    expect(getPreviewType('hero.webp')).toBe('image')
    expect(getPreviewType('logo.svg')).toBe('image')
  })

  it('detects video types', () => {
    expect(getPreviewType('clip.mp4')).toBe('video')
    expect(getPreviewType('recording.mov')).toBe('video')
    expect(getPreviewType('stream.webm')).toBe('video')
  })

  it('detects audio types', () => {
    expect(getPreviewType('song.mp3')).toBe('audio')
    expect(getPreviewType('voice.wav')).toBe('audio')
    expect(getPreviewType('podcast.ogg')).toBe('audio')
    expect(getPreviewType('memo.m4a')).toBe('audio')
    expect(getPreviewType('lossless.flac')).toBe('audio')
    expect(getPreviewType('track.aac')).toBe('audio')
  })

  it('detects markdown types', () => {
    expect(getPreviewType('README.md')).toBe('markdown')
    expect(getPreviewType('notes.markdown')).toBe('markdown')
  })

  it('returns null for unsupported types', () => {
    expect(getPreviewType('app.tsx')).toBeNull()
    expect(getPreviewType('data.json')).toBeNull()
    expect(getPreviewType('binary.exe')).toBeNull()
    expect(getPreviewType('archive.zip')).toBeNull()
  })
})

describe('Tool result with image (screen_capture)', () => {
  it('plain string result passes through', () => {
    const content = buildToolResultContent('file written successfully')
    expect(content).toBe('file written successfully')
  })

  it('object with image produces multi-part content', () => {
    const result = {
      result: 'Screenshot captured (VSCode, 1920×1080)',
      image: { type: 'base64', media_type: 'image/png', data: 'abc123' },
    }
    const content = buildToolResultContent(result)

    expect(content).toHaveLength(2)
    expect(content[0].type).toBe('text')
    expect(content[0].text).toContain('Screenshot captured')
    expect(content[1].type).toBe('image')
    expect(content[1].source.data).toBe('abc123')
  })

  it('object without image passes through as string', () => {
    const result = { result: 'done', path: '/tmp/file.txt' }
    const content = buildToolResultContent(result)
    expect(typeof content).toBe('string')
  })

  it('error result with image still includes image', () => {
    const result = {
      error: 'Permission denied',
      image: { type: 'base64', media_type: 'image/png', data: 'empty' },
    }
    const content = buildToolResultContent(result)
    expect(content[0].text).toContain('Permission denied')
    expect(content[1].source.data).toBe('empty')
  })
})
