import { describe, it, expect } from 'vitest'

/**
 * 🔴 Blue Team: resolveLocalHref attack vectors
 * 
 * Testing all path resolution edge cases for markdown images/links.
 */

// Inline the function under test (can't import TS directly without full setup)
function encodeFilePath(p) {
  return p.split('/').map(seg => encodeURIComponent(seg)).join('/')
}

function resolveLocalHref(href, clawDir) {
  if (!href) return href
  if (href.startsWith('http') || href.startsWith('file://') || href.startsWith('data:')) return href
  if (href.startsWith('/')) return 'file://' + encodeFilePath(href)
  if (clawDir) return 'file://' + encodeFilePath(clawDir) + '/' + encodeFilePath(href)
  return href
}

const WS = '/Users/kenefe/projects/myws'

describe('🔴 BLUE TEAM: resolveLocalHref edge cases', () => {

  // ── Normal cases ──

  it('relative path resolves against workspace', () => {
    expect(resolveLocalHref('images/cat.png', WS)).toBe(`file://${WS}/images/cat.png`)
  })

  it('absolute path gets file:// only', () => {
    expect(resolveLocalHref('/Users/kenefe/Desktop/img.png', WS))
      .toBe('file:///Users/kenefe/Desktop/img.png')
  })

  it('http URL passes through', () => {
    expect(resolveLocalHref('https://example.com/img.png', WS))
      .toBe('https://example.com/img.png')
  })

  it('file:// URL passes through', () => {
    expect(resolveLocalHref('file:///tmp/img.png', WS))
      .toBe('file:///tmp/img.png')
  })

  it('data URI passes through', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo='
    expect(resolveLocalHref(dataUri, WS)).toBe(dataUri)
  })

  // ── ATTACK: path traversal ──

  it('ATTACK: ../../../etc/passwd via relative path', () => {
    const result = resolveLocalHref('../../../etc/passwd', WS)
    // This resolves to file:///Users/kenefe/projects/myws/../../../etc/passwd
    // Chromium will normalize to file:///Users/etc/passwd
    // Electron's webSecurity should block, but this is a concern
    expect(result).toBe(`file://${WS}/../../../etc/passwd`)
    // NOTE: This is technically exploitable if webSecurity is off.
    // Mitigation: sanitize relative paths to block .. traversal
  })

  it('ATTACK: absolute path to /etc/shadow', () => {
    const result = resolveLocalHref('/etc/shadow', WS)
    // Returns file:///etc/shadow — could read system files!
    expect(result).toBe('file:///etc/shadow')
    // NOTE: Any absolute path works. Should we restrict to workspace subtree?
  })

  // ── ATTACK: special characters ──

  it('spaces in filename', () => {
    expect(resolveLocalHref('my folder/my image.png', WS))
      .toBe(`file://${WS}/my%20folder/my%20image.png`)
    // Browser may need encoding: spaces → %20
  })

  it('Chinese characters in path', () => {
    expect(resolveLocalHref('图片/截图.png', WS))
      .toBe(`file://${WS}/${encodeURIComponent('图片')}/${encodeURIComponent('截图.png')}`)
  })

  it('hash in filename — now encoded correctly', () => {
    // # is now percent-encoded, so browser loads the file correctly
    expect(resolveLocalHref('img#1.png', WS))
      .toBe(`file://${WS}/${encodeURIComponent('img#1.png')}`)
  })

  // ── ATTACK: protocol confusion ──

  it('javascript: URI', () => {
    // If href starts with javascript:, should NOT be resolved
    const result = resolveLocalHref('javascript:alert(1)', WS)
    // Current code: doesn't start with http/file/data, not /
    // Returns file:///Users/.../javascript:alert(1) — safe by accident
    expect(result).toBe(`file://${WS}/${encodeURIComponent('javascript:alert(1)')}`)
  })

  it('httpxyz should not be treated as http', () => {
    // startsWith('http') catches 'httpxyz://...' 
    // But this is fine — 'https' and 'http' both start with 'http'
    const result = resolveLocalHref('httpxyz://evil.com', WS)
    expect(result).toBe('httpxyz://evil.com') // passes through — ok for our case
  })

  // ── ATTACK: empty / null ──

  it('empty string', () => {
    expect(resolveLocalHref('', WS)).toBe('')
  })

  it('no workspace dir (clawDir = null)', () => {
    expect(resolveLocalHref('relative/img.png', null)).toBe('relative/img.png')
    // Returns raw relative path — won't load, but won't crash
  })

  // ── ATTACK: double resolution ──

  it('already-resolved file:// path not double-resolved', () => {
    const already = `file://${WS}/img.png`
    expect(resolveLocalHref(already, WS)).toBe(already)
  })

  // ── ATTACK: Windows paths (if cross-platform someday) ──

  it('Windows-style backslash path', () => {
    const result = resolveLocalHref('folder\\img.png', WS)
    // Treated as relative path — backslash not special on macOS
    expect(result).toBe(`file://${WS}/${encodeURIComponent('folder\\img.png')}`)
  })
})
