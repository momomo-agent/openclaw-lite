import { useState } from 'react'
import { ToolStep } from '../types'
import { humanizeToolStep } from '../utils/tools'

interface ToolGroupProps {
  steps: ToolStep[]
}

export default function ToolGroup({ steps }: ToolGroupProps) {
  const [expanded, setExpanded] = useState(false)

  if (!steps.length) return null

  const lastStep = steps[steps.length - 1]
  const h = humanizeToolStep(lastStep.name, lastStep.input)

  return (
    <div className="tool-group-inline">
      <div className="tool-group-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-action-text">
          {h.icon} {h.text}
        </span>
        <span className="tool-expand">{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div className="tool-group-body">
          {steps.map((step, i) => {
            const sh = humanizeToolStep(step.name, step.input)
            return (
              <div key={i} className="tool-step-item">
                <span className="tool-step-icon">{sh.icon}</span>
                <span className="tool-step-name">{sh.text}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
