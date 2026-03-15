// core/tool-result.js — Tool result truncation
// OpenClaw-aligned: head+tail strategy, preserves error info at tail

const TOOL_RESULT_MAX_SHARE = 0.3       // Max 30% of context window per result
const TOOL_RESULT_HARD_MAX = 400000     // Hard cap even for large context windows
const TOOL_RESULT_MIN_KEEP = 2000       // Always keep at least this much
const TRUNCATION_SUFFIX = '\n\n⚠️ [Content truncated — original was too large. Use offset/limit to read smaller chunks.]'
const MIDDLE_OMISSION = '\n\n⚠️ [... middle content omitted — showing head and tail ...]\n\n'

function hasImportantTail(text) {
  const tail = text.slice(-2000).toLowerCase()
  return /\b(error|exception|failed|fatal|traceback|panic|errno|exit code)\b/.test(tail)
    || /\}\s*$/.test(tail.trim())
    || /\b(total|summary|result|complete|finished|done)\b/.test(tail)
}

function calculateMaxChars(contextWindowTokens) {
  const maxTokens = Math.floor((contextWindowTokens || 200000) * TOOL_RESULT_MAX_SHARE)
  return Math.min(maxTokens * 4, TOOL_RESULT_HARD_MAX)
}

function truncateToolResult(result, contextWindowTokens) {
  const s = String(result)
  const maxChars = calculateMaxChars(contextWindowTokens)
  if (s.length <= maxChars) return s

  const budget = Math.max(TOOL_RESULT_MIN_KEEP, maxChars - TRUNCATION_SUFFIX.length)

  // Head+tail strategy if tail has important content (errors, summaries)
  if (hasImportantTail(s) && budget > TOOL_RESULT_MIN_KEEP * 2) {
    const tailBudget = Math.min(Math.floor(budget * 0.3), 4000)
    const headBudget = budget - tailBudget - MIDDLE_OMISSION.length
    if (headBudget > TOOL_RESULT_MIN_KEEP) {
      let headCut = headBudget
      const headNl = s.lastIndexOf('\n', headBudget)
      if (headNl > headBudget * 0.8) headCut = headNl
      let tailStart = s.length - tailBudget
      const tailNl = s.indexOf('\n', tailStart)
      if (tailNl !== -1 && tailNl < tailStart + tailBudget * 0.2) tailStart = tailNl + 1
      return s.slice(0, headCut) + MIDDLE_OMISSION + s.slice(tailStart) + TRUNCATION_SUFFIX
    }
  }

  // Default: keep head
  let cutPoint = budget
  const lastNl = s.lastIndexOf('\n', budget)
  if (lastNl > budget * 0.8) cutPoint = lastNl
  return s.slice(0, cutPoint) + TRUNCATION_SUFFIX
}

module.exports = { truncateToolResult, calculateMaxChars }
