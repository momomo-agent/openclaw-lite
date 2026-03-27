// Widget renderer — initializes iframe widgets in rendered message content
// Called after DOM update, similar to renderMermaidBlocks

import { WIDGET_SHELL_HTML, sanitizeForStreaming } from './widget-shell'

// Track active widget iframes for cleanup
const widgetMap = new WeakMap<HTMLElement, {
  iframe: HTMLIFrameElement
  ready: boolean
  lastCode: string
  finalized: boolean
}>()

/**
 * Initialize or update widget iframes in a message container.
 * Call this after every content update (streaming or final).
 */
export function renderWidgets(container: HTMLElement | null, isStreaming: boolean) {
  if (!container) return

  const widgets = container.querySelectorAll<HTMLElement>('.widget-container')
  for (const el of widgets) {
    const code = decodeWidgetCode(el.dataset.widgetCode || '')
    if (!code || code.length < 10) continue

    let state = widgetMap.get(el)

    // Create iframe if not exists
    if (!state) {
      const iframe = document.createElement('iframe')
      iframe.sandbox.add('allow-scripts')
      iframe.className = 'widget-iframe'
      iframe.style.cssText = 'width:100%;border:none;background:transparent;transition:height 0.3s ease;'
      iframe.style.height = '200px'
      iframe.srcdoc = WIDGET_SHELL_HTML

      state = { iframe, ready: false, lastCode: '', finalized: false }
      widgetMap.set(el, state)

      // Clear loading placeholder
      el.innerHTML = ''
      el.appendChild(iframe)

      // Listen for ready signal
      const onReady = () => {
        state!.ready = true
        // Send current code
        const currentCode = decodeWidgetCode(el.dataset.widgetCode || '')
        if (currentCode) {
          sendToWidget(state!, currentCode, !isStreaming)
        }
      }

      iframe.addEventListener('load', onReady)
    }

    // Update content if code changed
    if (state.ready && code !== state.lastCode) {
      sendToWidget(state, code, !isStreaming)
    }
  }
}

/**
 * Finalize all widgets in a container (streaming ended).
 * Sends final content with script execution.
 */
export function finalizeWidgets(container: HTMLElement | null) {
  if (!container) return

  const widgets = container.querySelectorAll<HTMLElement>('.widget-container')
  for (const el of widgets) {
    const state = widgetMap.get(el)
    if (!state || state.finalized) continue

    const code = decodeWidgetCode(el.dataset.widgetCode || '')
    if (code && state.ready) {
      sendToWidget(state, code, true)
    }
  }
}

function sendToWidget(state: { iframe: HTMLIFrameElement, ready: boolean, lastCode: string, finalized: boolean }, html: string, finalize: boolean) {
  const iframe = state.iframe
  if (!iframe.contentWindow) return

  const safeHtml = finalize ? html : sanitizeForStreaming(html)
  state.lastCode = html
  if (finalize) state.finalized = true

  try {
    iframe.contentWindow.postMessage({
      type: finalize ? 'widget:finalize' : 'widget:update',
      html: safeHtml,
    }, '*')
  } catch {
    // Sandbox may block
  }
}

function decodeWidgetCode(encoded: string): string {
  if (!encoded) return ''
  return encoded
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

/**
 * Global message listener for widget postMessage events.
 * Call once on app init.
 */
export function initWidgetBridge() {
  window.addEventListener('message', (e: MessageEvent) => {
    if (!e.data?.type?.startsWith('widget:')) return

    // Find the iframe that sent this message
    const iframes = document.querySelectorAll<HTMLIFrameElement>('.widget-iframe')
    let sourceIframe: HTMLIFrameElement | null = null
    for (const iframe of iframes) {
      if (iframe.contentWindow === e.source) {
        sourceIframe = iframe
        break
      }
    }
    if (!sourceIframe) return

    switch (e.data.type) {
      case 'widget:resize': {
        const h = Math.max(100, Math.min(2000, e.data.height))
        sourceIframe.style.height = h + 'px'
        break
      }
      case 'widget:ready': {
        // Widget shell loaded — find container and trigger content send
        const container = sourceIframe.closest('.widget-container') as HTMLElement
        if (container) {
          const state = widgetMap.get(container)
          if (state) {
            state.ready = true
            const code = decodeWidgetCode(container.dataset.widgetCode || '')
            if (code) {
              sendToWidget(state, code, state.finalized)
            }
          }
        }
        break
      }
      case 'widget:sendPrompt': {
        // Bridge: widget button triggers new chat message
        const text = e.data.text
        if (text && typeof text === 'string') {
          window.dispatchEvent(new CustomEvent('widget-prompt', { detail: text }))
        }
        break
      }
      case 'widget:openLink': {
        // Open links via Electron shell
        const url = e.data.url
        if (url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
          ;(window as any).api?.openExternal?.(url)
        }
        break
      }
    }
  })
}
