declare global {
  interface Window {
    marked: any
    hljs: any
  }
}

let _clawDir: string | null = null
let _cachedRenderer: any = null
let _rendererClawDir: string | null = null

export function setClawDir(dir: string | null) {
  _clawDir = dir
}

// ── File type detection ──

const AUDIO_EXT = /\.(mp3|wav|ogg|aac|flac|m4a|webm|opus)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|m4v)$/i
const IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|avif)$/i

function extFromHref(href: string): string {
  try {
    const clean = href.split('?')[0].split('#')[0]
    const m = clean.match(/\.(\w+)$/)
    return m ? m[1].toLowerCase() : ''
  } catch { return '' }
}

function fileNameFromHref(href: string): string {
  try {
    const clean = href.split('?')[0].split('#')[0]
    const parts = clean.split('/')
    return decodeURIComponent(parts[parts.length - 1] || 'file')
  } catch { return 'file' }
}

function resolveLocalHref(href: string): string {
  if (href && !href.startsWith('http') && !href.startsWith('file://') && !href.startsWith('data:') && _clawDir) {
    return `file://${_clawDir}/${href}`
  }
  return href
}

function isLocalFile(href: string): boolean {
  return href.startsWith('file://') || href.startsWith('/')
}

// ── Media renderers ──

function renderAudio(href: string, title: string): string {
  const name = fileNameFromHref(href)
  const titleAttr = title ? ` title="${title}"` : ''
  return `<div class="md-audio"${titleAttr}>
    <div class="md-audio-info">
      <span class="md-audio-icon">♫</span>
      <span class="md-audio-name">${name}</span>
    </div>
    <audio controls preload="metadata" src="${href}"></audio>
  </div>`
}

function renderVideo(href: string, title: string, text: string): string {
  const titleAttr = title ? ` title="${title}"` : ''
  return `<div class="md-video"${titleAttr}>
    <video controls preload="metadata" src="${href}">${text || ''}</video>
  </div>`
}

function renderFileCard(href: string, name: string): string {
  const ext = extFromHref(href).toUpperCase() || 'FILE'
  return `<a class="md-file-card" href="${href}" target="_blank" rel="noopener">
    <span class="md-file-icon">${ext}</span>
    <span class="md-file-name">${name}</span>
    <span class="md-file-open">↗</span>
  </a>`
}

// ── Renderer ──

function getRenderer() {
  // Reuse renderer if clawDir hasn't changed
  if (_cachedRenderer && _rendererClawDir === _clawDir) return _cachedRenderer

  const renderer = new window.marked.Renderer()

  // Image renderer: detect audio/video by extension, otherwise render as <img>
  renderer.image = function (token: any) {
    const rawHref = token.href || ''
    const href = resolveLocalHref(rawHref)
    const title = token.title || ''
    const text = token.text || ''
    const caption = text || title || ''
    const escaped = caption.replace(/"/g, '&quot;')

    // Determine if href looks like a real resource path
    const isValidHref = rawHref && (
      rawHref.startsWith('http') ||
      rawHref.startsWith('data:') ||
      rawHref.startsWith('file://') ||
      rawHref.startsWith('/') ||
      rawHref.startsWith('../') ||
      rawHref.startsWith('./') ||
      (rawHref.includes('/') && rawHref.includes('.')) ||  // relative path with extension
      IMAGE_EXT.test(rawHref) ||
      AUDIO_EXT.test(rawHref) ||
      VIDEO_EXT.test(rawHref)
    )

    // Invalid href → placeholder only (deterministic, no runtime events)
    if (!isValidHref) {
      if (!caption) return ''
      return `<span class="md-img-placeholder"><span class="md-img-placeholder-icon">🖼</span><span class="md-img-placeholder-text">${escaped}</span></span>`
    }

    if (AUDIO_EXT.test(href)) return renderAudio(href, title)
    if (VIDEO_EXT.test(href)) return renderVideo(href, title, text)

    // Valid href → always render <img>, no onerror tricks
    return `<img src="${href}" alt="${escaped}" style="max-width:100%;border-radius:8px;margin:8px 0">`
  }

  // Link renderer: detect media files, render inline players or file cards
  const originalLink = renderer.link.bind(renderer)
  renderer.link = function (token: any) {
    const href = resolveLocalHref(token.href || '')
    const title = token.title || ''
    const text = token.text || ''

    // Only enhance local file links (file:// or relative paths)
    if (isLocalFile(href)) {
      if (AUDIO_EXT.test(href)) return renderAudio(href, title)
      if (VIDEO_EXT.test(href)) return renderVideo(href, title, text)
      if (IMAGE_EXT.test(href)) {
        return `<img src="${href}" alt="${text}" style="max-width:100%;border-radius:8px;margin:8px 0">`
      }
      // Non-media local file → file card
      const name = text || fileNameFromHref(href)
      return renderFileCard(href, name)
    }

    // Remote links — pass through with resolved href
    return originalLink({ ...token, href })
  }

  // Hide empty table headers (all <th> cells have no text content)
  const originalTable = renderer.table.bind(renderer)
  renderer.table = function (token: any) {
    const html: string = originalTable(token)
    // Check if all header cells are empty (tokens array empty or only whitespace)
    const allEmpty = Array.isArray(token.header) && token.header.length > 0 &&
      token.header.every((cell: any) =>
        !cell.tokens || cell.tokens.length === 0 ||
        cell.tokens.every((t: any) => t.type === 'text' && !t.raw?.trim())
      )
    if (allEmpty) {
      return html.replace(/<thead>[\s\S]*?<\/thead>/i, '')
    }
    return html
  }

  _cachedRenderer = renderer
  _rendererClawDir = _clawDir
  return renderer
}

export function renderMarkdown(text: string): string {
  if (!window.marked) return text
  return window.marked.parse(text, { renderer: getRenderer() })
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '[image]')
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]+([^*_~]+)[*_~]+/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\n{2,}/g, ' ')
    .trim()
    .slice(0, 100)
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
