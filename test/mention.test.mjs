/**
 * test/mention.test.mjs — Tests for @mention autocomplete logic
 *
 * Covers: fuzzy matching, pill lifecycle, mention trigger detection,
 * pill revalidation on text changes.
 */
import { describe, it, expect } from 'vitest'

// ── Extracted logic from InputBar.tsx ──

/** Fuzzy match: substring + initials */
function fuzzyMatch(name, query) {
  const lowerName = name.toLowerCase()
  const lowerQuery = query.toLowerCase()
  if (lowerName.includes(lowerQuery)) return true
  const initials = name.split(/\s+/).map(w => w[0]).join('').toLowerCase()
  return initials.includes(lowerQuery)
}

/** Check if @ trigger is valid at cursor position */
function detectMentionTrigger(text, cursorPos) {
  const beforeCursor = text.slice(0, cursorPos)
  const atIdx = beforeCursor.lastIndexOf('@')
  if (atIdx < 0) return null
  if (atIdx > 0 && !/\s/.test(beforeCursor[atIdx - 1])) return null
  const query = beforeCursor.slice(atIdx + 1)
  if (query.includes(' ')) return null
  return { atIdx, query }
}

/** Insert mention into text, return new text + pill */
function insertMention(text, cursorPos, name, atIdx) {
  const pillText = `@${name}`
  const after = text.slice(cursorPos)
  const newText = text.slice(0, atIdx) + pillText + ' ' + after
  const pill = { name, start: atIdx, end: atIdx + pillText.length }
  return { text: newText, pill }
}

/** Revalidate pills against current text */
function revalidatePills(pills, text) {
  const updated = []
  for (const pill of pills) {
    const pillText = `@${pill.name}`
    // Search near last known position first, then anywhere
    let idx = text.indexOf(pillText, Math.max(0, pill.start - 20))
    if (idx === -1) idx = text.indexOf(pillText)
    if (idx !== -1) {
      updated.push({ ...pill, start: idx, end: idx + pillText.length })
    }
  }
  return updated
}

// ══════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════

describe('Fuzzy matching', () => {
  it('matches substring', () => {
    expect(fuzzyMatch('Momo Clone', 'mom')).toBe(true)
    expect(fuzzyMatch('Momo Clone', 'clone')).toBe(true)
    expect(fuzzyMatch('Momo Clone', 'mo cl')).toBe(true) // substring of "momo clone"
  })

  it('matches initials', () => {
    expect(fuzzyMatch('Momo Clone', 'mc')).toBe(true)
    expect(fuzzyMatch('Claude Code', 'cc')).toBe(true)
    expect(fuzzyMatch('The Quick Fox', 'tqf')).toBe(true)
  })

  it('is case insensitive', () => {
    expect(fuzzyMatch('Momo', 'MOMO')).toBe(true)
    expect(fuzzyMatch('MOMO', 'momo')).toBe(true)
  })

  it('rejects non-matches', () => {
    expect(fuzzyMatch('Momo', 'xyz')).toBe(false)
    expect(fuzzyMatch('Momo', 'mz')).toBe(false)
  })

  it('single word name has single-char initial', () => {
    expect(fuzzyMatch('Momo', 'm')).toBe(true) // substring match
    expect(fuzzyMatch('Momo', 'o')).toBe(true)  // substring match
  })

  it('empty query matches everything', () => {
    expect(fuzzyMatch('Anything', '')).toBe(true)
  })
})

describe('Mention trigger detection', () => {
  it('detects @ at start of text', () => {
    const result = detectMentionTrigger('@mo', 3)
    expect(result).toEqual({ atIdx: 0, query: 'mo' })
  })

  it('detects @ after space', () => {
    const result = detectMentionTrigger('hello @mo', 9)
    expect(result).toEqual({ atIdx: 6, query: 'mo' })
  })

  it('rejects @ in middle of word', () => {
    const result = detectMentionTrigger('email@example', 13)
    expect(result).toBeNull()
  })

  it('rejects @ with space in query', () => {
    const result = detectMentionTrigger('@hello world', 12)
    expect(result).toBeNull()
  })

  it('returns empty query for bare @', () => {
    const result = detectMentionTrigger('@', 1)
    expect(result).toEqual({ atIdx: 0, query: '' })
  })

  it('uses last @ before cursor', () => {
    const result = detectMentionTrigger('@first @sec', 11)
    expect(result).toEqual({ atIdx: 7, query: 'sec' })
  })

  it('returns null with no @', () => {
    const result = detectMentionTrigger('hello world', 11)
    expect(result).toBeNull()
  })
})

describe('Mention insertion', () => {
  it('inserts mention at @ position', () => {
    const result = insertMention('@mo', 3, 'Momo', 0)
    expect(result.text).toBe('@Momo ')
    expect(result.pill).toEqual({ name: 'Momo', start: 0, end: 5 })
  })

  it('inserts mention mid-text', () => {
    const result = insertMention('hey @mo how', 7, 'Momo', 4)
    expect(result.text).toBe('hey @Momo  how')
    expect(result.pill).toEqual({ name: 'Momo', start: 4, end: 9 })
  })

  it('preserves text before @', () => {
    const result = insertMention('check this @cl', 14, 'Claude', 11)
    expect(result.text).toBe('check this @Claude ')
    expect(result.pill.start).toBe(11)
  })
})

describe('Pill revalidation', () => {
  it('keeps pill when text unchanged', () => {
    const pills = [{ id: '1', name: 'Momo', start: 0, end: 5 }]
    const result = revalidatePills(pills, '@Momo hello')
    expect(result).toHaveLength(1)
    expect(result[0].start).toBe(0)
    expect(result[0].end).toBe(5)
  })

  it('updates pill position when text inserted before it', () => {
    const pills = [{ id: '1', name: 'Momo', start: 0, end: 5 }]
    // User typed "hey " before @Momo
    const result = revalidatePills(pills, 'hey @Momo hello')
    expect(result).toHaveLength(1)
    expect(result[0].start).toBe(4)
    expect(result[0].end).toBe(9)
  })

  it('removes pill when mention text is deleted', () => {
    const pills = [{ id: '1', name: 'Momo', start: 0, end: 5 }]
    const result = revalidatePills(pills, 'hello')
    expect(result).toHaveLength(0)
  })

  it('handles multiple pills', () => {
    const pills = [
      { id: '1', name: 'Momo', start: 0, end: 5 },
      { id: '2', name: 'Claude', start: 6, end: 13 },
    ]
    const result = revalidatePills(pills, '@Momo @Claude what do you think')
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Momo')
    expect(result[1].name).toBe('Claude')
  })

  it('removes one pill but keeps another', () => {
    const pills = [
      { id: '1', name: 'Momo', start: 0, end: 5 },
      { id: '2', name: 'Claude', start: 6, end: 13 },
    ]
    const result = revalidatePills(pills, '@Claude hello')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Claude')
    expect(result[0].start).toBe(0) // shifted to new position
  })

  it('handles partial deletion (pill text broken)', () => {
    const pills = [{ id: '1', name: 'Momo', start: 0, end: 5 }]
    // User deleted part of @Momo → @Mo
    const result = revalidatePills(pills, '@Mo hello')
    expect(result).toHaveLength(0) // @Momo not found
  })
})
