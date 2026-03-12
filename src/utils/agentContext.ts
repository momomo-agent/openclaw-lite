import { Message } from '../types'

/**
 * Build per-agent context: each agent only sees user messages + its own responses.
 * Merges consecutive same-role messages (LLM APIs require alternating roles).
 */
export function buildAgentContext(
  sessionMsgs: Message[],
  agentName: string,
  isMain: boolean
): { role: string; content: string }[] {
  const raw: { role: string; content: string }[] = []
  for (const m of sessionMsgs) {
    if (m.role === 'user') {
      raw.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const isOwn = isMain
        ? (!m.sender || m.sender === 'Assistant')
        : m.sender === agentName
      if (isOwn && m.content?.trim()) {
        raw.push({ role: 'assistant', content: m.content })
      }
    }
  }
  // Merge consecutive same-role messages
  const merged: { role: string; content: string }[] = []
  for (const m of raw) {
    if (merged.length && merged[merged.length - 1].role === m.role) {
      merged[merged.length - 1].content += '\n\n' + m.content
    } else {
      merged.push({ ...m })
    }
  }
  return merged
}
