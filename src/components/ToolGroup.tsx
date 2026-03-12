import { useState } from 'react'
import { ToolStep } from '../types'
import { humanizeToolStep, summarizeToolSteps, extractArgPreview } from '../utils/tools'

interface ToolGroupProps {
  steps: ToolStep[]
  isStreaming?: boolean
  roundPurpose?: string
}

export default function ToolGroup({ steps, isStreaming, roundPurpose }: ToolGroupProps) {
  const [expanded, setExpanded] = useState(false)

  if (!steps.length) return null

  // Filter out hidden steps for display purposes
  const visibleSteps = steps.filter(s => {
    const h = humanizeToolStep(s.name, s.input)
    return !h.hidden
  })

  // Determine header text
  let headerIcon = '🔧'
  let headerText = ''

  if (roundPurpose) {
    // Round purpose takes priority when available
    headerIcon = '🔧'
    headerText = roundPurpose
  } else if (isStreaming && steps.length > 0) {
    // While streaming, show the last step's humanized text
    const lastStep = steps[steps.length - 1]
    const h = humanizeToolStep(lastStep.name, lastStep.input)
    headerIcon = h.icon
    headerText = h.text
  } else {
    // When done, show summary
    const summary = summarizeToolSteps(steps)
    if (summary) {
      headerText = summary
    } else {
      // Fallback to last step
      const lastStep = steps[steps.length - 1]
      const h = humanizeToolStep(lastStep.name, lastStep.input)
      headerIcon = h.icon
      headerText = h.text
    }
  }

  return (
    <div className={`tool-group-inline ${isStreaming ? 'tool-pulse' : ''}`}>
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
