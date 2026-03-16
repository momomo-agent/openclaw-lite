// src/utils/mermaid-render.ts — Lazy mermaid initialization & rendering
let initialized = false

export async function renderMermaidBlocks(container: HTMLElement | null) {
  if (!container) return
  const blocks = container.querySelectorAll('pre.mermaid:not([data-processed])')
  if (blocks.length === 0) return

  // Lazy import
  const mermaid = (await import('mermaid')).default

  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      fontFamily: 'inherit',
      securityLevel: 'loose',
    })
    initialized = true
  }

  for (const block of blocks) {
    const code = block.textContent || ''
    block.setAttribute('data-processed', 'true')
    try {
      const id = 'mermaid-' + Math.random().toString(36).slice(2, 8)
      const { svg } = await mermaid.render(id, code)
      block.innerHTML = svg
      block.classList.add('mermaid-rendered')
    } catch (e) {
      // Show error in block
      block.innerHTML = `<span class="mermaid-error">⚠ Diagram error: ${(e as Error).message}</span>`
    }
  }
}
