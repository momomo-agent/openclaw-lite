declare global {
  interface Window {
    marked: any
    hljs: any
  }
}

export function renderMarkdown(text: string): string {
  if (!window.marked) return text
  return window.marked.parse(text)
}

export function stripMarkdown(text: string): string {
  return text.replace(/[*_~`#\[\]]/g, '').slice(0, 100)
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
