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

function getRenderer() {
  // Reuse renderer if clawDir hasn't changed
  if (_cachedRenderer && _rendererClawDir === _clawDir) return _cachedRenderer

  const renderer = new window.marked.Renderer()
  const originalImage = renderer.image
  renderer.image = function (href: string, title: string, text: string) {
    if (href && !href.startsWith('http') && !href.startsWith('file://') && !href.startsWith('data:') && _clawDir) {
      href = `file://${_clawDir}/${href}`
    }
    if (originalImage) return originalImage.call(this, href, title, text)
    const titleAttr = title ? ` title="${title}"` : ''
    return `<img src="${href}" alt="${text || ''}"${titleAttr} style="max-width:100%;border-radius:4px">`
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
