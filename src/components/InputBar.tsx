import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppState } from '../store'

interface InputBarProps {
  sessionId: string | null
  onSend: (text: string, files: File[]) => void
}

export default function InputBar({ sessionId, onSend }: InputBarProps) {
  const { workspaces } = useAppState()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // F241: IME composition tracking
  const composing = useRef(false)

  // F229: Draft per session
  const drafts = useRef<Map<string, { text: string; files: File[] }>>(new Map())
  const prevSessionId = useRef<string | null>(null)

  useEffect(() => {
    if (prevSessionId.current && (text || files.length)) {
      drafts.current.set(prevSessionId.current, { text, files })
    }
    if (sessionId) {
      const draft = drafts.current.get(sessionId)
      setText(draft?.text || '')
      setFiles(draft?.files || [])
      drafts.current.delete(sessionId)
    } else {
      setText('')
      setFiles([])
    }
    prevSessionId.current = sessionId
  }, [sessionId])

  // F252: Cmd+K focus input
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault()
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [])

  // F245: Drag & drop
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(true)
    }
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      // Only clear if leaving the window
      if (e.relatedTarget === null) setDragOver(false)
    }
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      if (e.dataTransfer?.files?.length) {
        setFiles(prev => [...prev, ...Array.from(e.dataTransfer!.files)])
      }
    }
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  // F224: @mention autocomplete
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionIdx, setMentionIdx] = useState(0)
  const mentionStartPos = useRef(-1)

  const agentNames = workspaces.map(w => w.identity?.name || w.id)

  const filteredMentions = mentionFilter
    ? agentNames.filter(n => n.toLowerCase().includes(mentionFilter.toLowerCase()))
    : agentNames

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    const pos = e.target.selectionStart
    setText(val)

    // Check for @ trigger
    const beforeCursor = val.slice(0, pos)
    const atIdx = beforeCursor.lastIndexOf('@')
    if (atIdx >= 0 && (atIdx === 0 || /\s/.test(beforeCursor[atIdx - 1]))) {
      const query = beforeCursor.slice(atIdx + 1)
      if (!query.includes(' ')) {
        mentionStartPos.current = atIdx
        setMentionFilter(query)
        setMentionOpen(true)
        setMentionIdx(0)
        return
      }
    }
    setMentionOpen(false)
  }

  const insertMention = useCallback((name: string) => {
    const start = mentionStartPos.current
    if (start < 0) return
    const after = text.slice(textareaRef.current?.selectionStart || text.length)
    setText(text.slice(0, start) + '@' + name + ' ' + after)
    setMentionOpen(false)
    textareaRef.current?.focus()
  }, [text])

  const handleSend = () => {
    if (!text.trim() && files.length === 0) return
    onSend(text, files)
    setText('')
    setFiles([])
    if (sessionId) drafts.current.delete(sessionId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // F241: Block send during IME composition
    if (composing.current) return

    if (mentionOpen && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, filteredMentions.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentions[mentionIdx]); return }
      if (e.key === 'Escape') { setMentionOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // F246: Image preview helper
  const isImage = (f: File) => f.type.startsWith('image/')

  return (
    <div ref={wrapRef} className={`input-float-wrap ${dragOver ? 'drag-over' : ''}`}>
      {/* F245: Drag overlay */}
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', borderRadius: 12, pointerEvents: 'none',
          color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
        }}>
          Drop files here
        </div>
      )}
      <div className="input-float">
        {/* F246: Attach preview with image thumbnails */}
        {files.length > 0 && (
          <div className="attach-preview-area">
            {files.map((f, i) => (
              <div key={i} className="attach-chip" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isImage(f) && (
                  <img
                    src={URL.createObjectURL(f)}
                    style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }}
                  />
                )}
                <span>{f.name}</span>
                <span className="remove" onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</span>
              </div>
            ))}
          </div>
        )}
        {/* F224: Mention dropdown */}
        {mentionOpen && filteredMentions.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 12, marginBottom: 4,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '4px 0', minWidth: 160, zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,.3)'
          }}>
            {filteredMentions.map((name, i) => (
              <div key={name}
                onClick={() => insertMention(name)}
                style={{
                  padding: '6px 12px', cursor: 'pointer', fontSize: 13,
                  background: i === mentionIdx ? 'var(--accent-dim)' : 'transparent',
                  color: 'var(--text-primary)'
                }}>
                @{name}
              </div>
            ))}
          </div>
        )}
        <div className="input-bar">
          <button className="icon-btn attach-btn" onClick={() => document.getElementById('fileInput')?.click()}>
            <span className="ic">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </span>
          </button>
          <input type="file" id="fileInput" style={{ display: 'none' }} multiple onChange={(e) => e.target.files && setFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 120) + 'px'
            }}
            onCompositionStart={() => { composing.current = true }}
            onCompositionEnd={() => { composing.current = false }}
            placeholder="Ask anything... (@name to target)"
            rows={1}
          />
          <button id="sendBtn" className={text.trim() || files.length ? 'active' : ''} onClick={handleSend}>
            <span className="ic">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
