import { useState, useRef, useEffect } from 'react'

interface InputBarProps {
  sessionId: string | null
  onSend: (text: string, files: File[]) => void
}

export default function InputBar({ onSend }: InputBarProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [text])

  const handleSend = () => {
    if (!text.trim() && files.length === 0) return
    onSend(text, files)
    setText('')
    setFiles([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  return (
    <div className="input-float-wrap">
      <div className="input-float">
        {files.length > 0 && (
          <div className="attach-preview-area">
            {files.map((f, i) => (
              <div key={i} className="attach-chip">
                <span>{f.name}</span>
                <span className="remove" onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</span>
              </div>
            ))}
          </div>
        )}
        <div className="input-bar">
          <button className="icon-btn attach-btn" onClick={() => document.getElementById('fileInput')?.click()}>
            <span className="ic">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </span>
          </button>
          <input type="file" id="fileInput" style={{ display: 'none' }} multiple onChange={handleFileChange} />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything... (@name to target)"
            rows={1}
          />
          <button id="sendBtn" className={text.trim() || files.length ? 'active' : ''} onClick={handleSend}>
            <span className="ic">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M12 19V5"/>
                <path d="m5 12 7-7 7 7"/>
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
