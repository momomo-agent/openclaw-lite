import { useState } from 'react'
import { ToolStep } from '../types'
import { humanizeToolStep, summarizeToolSteps, extractArgPreview, isVisibleToolStep } from '../utils/tools'

interface ToolGroupProps {
  steps: ToolStep[]
  isStreaming?: boolean
  roundPurpose?: string
}

export default function ToolGroup({ steps, isStreaming, roundPurpose }: ToolGroupProps) {
  const [expanded, setExpanded] = useState(false)

  // Filter: only show visible steps (exclude hidden + __thinking__)
  const visibleSteps = steps.filter(s => isVisibleToolStep(s))
  if (!visibleSteps.length) return null

  // Determine header text
  let headerIcon = '🔧'
  let headerText = ''

  if (roundPurpose) {
    // Round purpose takes priority when available
    headerIcon = '🔧'
    headerText = roundPurpose
  } else if (visibleSteps.length === 1) {
    // Single step — always show its humanized text (concise and clear)
    const h = humanizeToolStep(visibleSteps[0].name, visibleSteps[0].input)
    headerIcon = h.icon
    headerText = h.text
  } else if (isStreaming && visibleSteps.length > 0) {
    // While streaming, show the last visible step's humanized text
    const lastStep = visibleSteps[visibleSteps.length - 1]
    const h = humanizeToolStep(lastStep.name, lastStep.input)
    headerIcon = h.icon
    headerText = h.text
  } else {
    // When done, show summary
    const summary = summarizeToolSteps(visibleSteps)
    if (summary) {
      headerText = summary
    } else {
      // Fallback to last visible step
      const lastStep = visibleSteps[visibleSteps.length - 1]
      const h = humanizeToolStep(lastStep.name, lastStep.input)
      headerIcon = h.icon
      headerText = h.text
    }
  }

  // Safety: never render with empty header
  if (!headerText) headerText = `${visibleSteps.length} 个操作`

  return (
    <div className={`tool-group-inline${isStreaming ? ' tool-streaming' : ''}`}>
      <div
        className="tool-group-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tool-action-text">
          {headerIcon} {headerText}
        </span>
        <span className="tool-expand">{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div className="tool-group-body">
          {visibleSteps.map((step, i) => {
            const sh = humanizeToolStep(step.name, step.input)
            const argPreview = extractArgPreview(step.name, step.input)
            return (
              <div key={i} className="tool-step-item">
                <span className="tool-step-icon">{sh.icon}</span>
                <span className="tool-step-name">{sh.text}</span>
                {argPreview && (
                  <span className="tool-step-args">{argPreview}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
