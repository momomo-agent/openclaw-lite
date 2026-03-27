// Widget Shell HTML — the iframe's srcdoc for interactive widgets
// Ported from Visual Talk's widget-shell.js
// Contains: CSS variables, SVG preset classes, morphdom for smooth streaming,
// postMessage receiver for content updates, and ResizeObserver for height reporting.

const SVG_STYLES = `
svg .t  { font-family: var(--font-sans); font-size: 14px; fill: var(--p); }
svg .ts { font-family: var(--font-sans); font-size: 12px; fill: var(--s); }
svg .th { font-family: var(--font-sans); font-size: 14px; font-weight: 500; fill: var(--p); }
svg .box { fill: var(--bg2); stroke: var(--b); }
svg .node { cursor: pointer; }
svg .node:hover { opacity: 0.8; }
svg .arr { stroke: var(--t); stroke-width: 1.5; fill: none; }
svg .leader { stroke: var(--t); stroke-width: 0.5; stroke-dasharray: 4 3; fill: none; }

svg .c-purple > rect, svg .c-purple > circle, svg .c-purple > ellipse { fill: #3C3489; stroke: #AFA9EC; }
svg .c-purple > .th, svg .c-purple > .t { fill: #CECBF6; } svg .c-purple > .ts { fill: #AFA9EC; }
svg rect.c-purple, svg circle.c-purple { fill: #3C3489; stroke: #AFA9EC; }

svg .c-teal > rect, svg .c-teal > circle, svg .c-teal > ellipse { fill: #085041; stroke: #5DCAA5; }
svg .c-teal > .th, svg .c-teal > .t { fill: #9FE1CB; } svg .c-teal > .ts { fill: #5DCAA5; }
svg rect.c-teal, svg circle.c-teal { fill: #085041; stroke: #5DCAA5; }

svg .c-coral > rect, svg .c-coral > circle, svg .c-coral > ellipse { fill: #712B13; stroke: #F0997B; }
svg .c-coral > .th, svg .c-coral > .t { fill: #F5C4B3; } svg .c-coral > .ts { fill: #F0997B; }
svg rect.c-coral, svg circle.c-coral { fill: #712B13; stroke: #F0997B; }

svg .c-pink > rect, svg .c-pink > circle, svg .c-pink > ellipse { fill: #72243E; stroke: #ED93B1; }
svg .c-pink > .th, svg .c-pink > .t { fill: #F4C0D1; } svg .c-pink > .ts { fill: #ED93B1; }
svg rect.c-pink, svg circle.c-pink { fill: #72243E; stroke: #ED93B1; }

svg .c-gray > rect, svg .c-gray > circle, svg .c-gray > ellipse { fill: #444441; stroke: #B4B2A9; }
svg .c-gray > .th, svg .c-gray > .t { fill: #D3D1C7; } svg .c-gray > .ts { fill: #B4B2A9; }
svg rect.c-gray, svg circle.c-gray { fill: #444441; stroke: #B4B2A9; }

svg .c-blue > rect, svg .c-blue > circle, svg .c-blue > ellipse { fill: #0C447C; stroke: #85B7EB; }
svg .c-blue > .th, svg .c-blue > .t { fill: #B5D4F4; } svg .c-blue > .ts { fill: #85B7EB; }
svg rect.c-blue, svg circle.c-blue { fill: #0C447C; stroke: #85B7EB; }

svg .c-green > rect, svg .c-green > circle, svg .c-green > ellipse { fill: #27500A; stroke: #97C459; }
svg .c-green > .th, svg .c-green > .t { fill: #C0DD97; } svg .c-green > .ts { fill: #97C459; }
svg rect.c-green, svg circle.c-green { fill: #27500A; stroke: #97C459; }

svg .c-amber > rect, svg .c-amber > circle, svg .c-amber > ellipse { fill: #633806; stroke: #EF9F27; }
svg .c-amber > .th, svg .c-amber > .t { fill: #FAC775; } svg .c-amber > .ts { fill: #EF9F27; }
svg rect.c-amber, svg circle.c-amber { fill: #633806; stroke: #EF9F27; }

svg .c-red > rect, svg .c-red > circle, svg .c-red > ellipse { fill: #791F1F; stroke: #F09595; }
svg .c-red > .th, svg .c-red > .t { fill: #F7C1C1; } svg .c-red > .ts { fill: #F09595; }
svg rect.c-red, svg circle.c-red { fill: #791F1F; stroke: #F09595; }

button {
  background: transparent;
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-md);
  color: var(--color-text-primary);
  padding: 6px 14px; font-size: 14px; cursor: pointer;
  font-family: var(--font-sans);
}
button:hover { background: var(--color-background-secondary); }
button:active { transform: scale(0.98); }
input[type="range"] {
  -webkit-appearance: none; height: 4px;
  background: var(--color-border-secondary); border-radius: 2px; outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px;
  border-radius: 50%; background: var(--color-text-primary); cursor: pointer;
}
input[type="text"], input[type="number"], textarea, select {
  height: 36px; background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-md); color: var(--color-text-primary);
  padding: 0 10px; font-size: 14px; font-family: var(--font-sans); outline: none;
}
input[type="text"]:hover, input[type="number"]:hover, textarea:hover, select:hover {
  border-color: var(--color-border-secondary);
}
input[type="text"]:focus, input[type="number"]:focus, textarea:focus, select:focus {
  border-color: var(--color-border-primary);
  box-shadow: 0 0 0 2px rgba(255,255,255,0.1);
}
`

export const WIDGET_SHELL_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://esm.sh https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline'; img-src data: https:; connect-src 'none'; frame-src 'none';">
<style>
* { box-sizing: border-box; }
body {
  margin: 0; padding: 1rem;
  font-family: system-ui, -apple-system, sans-serif;
  background: transparent;
  overflow: hidden;
  --p: #e0e0e0; --s: #a0a0a0; --t: #707070; --bg2: #2a2a2a; --b: #404040;
  --color-text-primary: #e0e0e0;
  --color-text-secondary: #a0a0a0;
  --color-text-tertiary: #707070;
  --color-text-info: #85B7EB;
  --color-text-danger: #F09595;
  --color-text-success: #97C459;
  --color-text-warning: #EF9F27;
  --color-background-primary: transparent;
  --color-background-secondary: #2a2a2a;
  --color-background-tertiary: #111111;
  --color-background-info: #0C447C;
  --color-background-danger: #791F1F;
  --color-background-success: #27500A;
  --color-background-warning: #633806;
  --color-border-primary: rgba(255,255,255,0.4);
  --color-border-secondary: rgba(255,255,255,0.3);
  --color-border-tertiary: rgba(255,255,255,0.15);
  --color-border-info: #85B7EB;
  --font-sans: system-ui, -apple-system, sans-serif;
  --font-serif: Georgia, serif;
  --font-mono: ui-monospace, monospace;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  --border-radius-xl: 16px;
  color: var(--color-text-primary);
}
body.light {
  --p: #1a1a1a; --s: #666; --t: #999; --bg2: #f5f5f5; --b: #e0e0e0;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #666;
  --color-text-tertiary: #999;
  --color-text-info: #185FA5;
  --color-text-danger: #A32D2D;
  --color-text-success: #3B6D11;
  --color-text-warning: #854F0B;
  --color-background-secondary: #f5f5f5;
  --color-background-tertiary: #e8e8e8;
  --color-background-info: #E6F1FB;
  --color-background-danger: #FCEBEB;
  --color-background-success: #EAF3DE;
  --color-background-warning: #FAEEDA;
  --color-border-primary: rgba(0,0,0,0.4);
  --color-border-secondary: rgba(0,0,0,0.2);
  --color-border-tertiary: rgba(0,0,0,0.1);
  --color-border-info: #378ADD;
  color: #1a1a1a;
}
body.light * { color: inherit !important; }
body.light button { color: var(--color-text-primary) !important; border-color: var(--color-border-secondary) !important; }
body.light input, body.light select, body.light textarea { color: var(--color-text-primary) !important; border-color: var(--color-border-tertiary) !important; }
@keyframes _fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
${SVG_STYLES}
</style>
</head><body>
<div id="root"></div>
<script>
window._morphReady = false;
window._pending = null;

window._setContent = function(html) {
  if (!window._morphReady) { window._pending = html; return; }
  var root = document.getElementById('root');
  var target = document.createElement('div');
  target.id = 'root';
  target.innerHTML = html;
  morphdom(root, target, {
    onBeforeElUpdated: function(from, to) {
      if (from.isEqualNode(to)) return false;
      return true;
    },
    onNodeAdded: function(node) {
      if (node.nodeType === 1 && node.tagName !== 'STYLE' && node.tagName !== 'SCRIPT') {
        node.style.animation = '_fadeIn 0.3s ease both';
      }
      return node;
    }
  });
  _reportHeight();
};

window._scriptsRan = false;
window._runScripts = function() {
  if (window._scriptsRan) return;
  window._scriptsRan = true;
  document.querySelectorAll('#root script').forEach(function(old) {
    var s = document.createElement('script');
    if (old.src) { s.src = old.src; } else { s.textContent = old.textContent; }
    old.parentNode.replaceChild(s, old);
  });
};

function _reportHeight() {
  var root = document.getElementById('root');
  if (!root) return;
  var h = root.scrollHeight + 32;
  parent.postMessage({ type: 'widget:resize', height: h }, '*');
}

var _ro = new ResizeObserver(function() { _reportHeight(); });
_ro.observe(document.getElementById('root'));

window.sendPrompt = function(text) {
  parent.postMessage({ type: 'widget:sendPrompt', text: text }, '*');
};

document.addEventListener('click', function(e) {
  var a = e.target.closest('a');
  if (a && a.href) {
    e.preventDefault();
    parent.postMessage({ type: 'widget:openLink', url: a.href }, '*');
  }
});

window.addEventListener('message', function(e) {
  if (e.data.type === 'widget:update') {
    window._setContent(e.data.html);
  }
  if (e.data.type === 'widget:finalize') {
    window._setContent(e.data.html);
    window._runScripts();
  }
  if (e.data.type === 'widget:theme') {
    document.body.className = e.data.theme === 'light' ? 'light' : '';
  }
});
<\/script>
<script src="https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js"
  onload="window._morphReady=true;if(window._pending){window._setContent(window._pending);window._pending=null;}"><\/script>
<script>
parent.postMessage({ type: 'widget:ready' }, '*');
<\/script>
</body></html>`

// Strip <script> tags during streaming to prevent partial execution
export function sanitizeForStreaming(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
}
