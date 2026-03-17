import { useRef, forwardRef, useImperativeHandle } from 'react'

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onKeyDown'> {
  /** Called on Enter key press (not during IME composition) */
  onSubmit?: () => void
  onCompositionStart?: React.CompositionEventHandler<HTMLInputElement>
  onCompositionEnd?: React.CompositionEventHandler<HTMLInputElement>
}

/**
 * Input with IME composition awareness.
 * Prevents Enter from firing onSubmit while composing (e.g. Chinese input).
 * Merges external onCompositionStart/End with internal composing ref.
 */
const TextInput = forwardRef<HTMLInputElement, TextInputProps>(({ onSubmit, onCompositionStart, onCompositionEnd, ...props }, ref) => {
  const innerRef = useRef<HTMLInputElement>(null)
  const composing = useRef(false)

  useImperativeHandle(ref, () => innerRef.current!)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (composing.current) return
    if (e.key === 'Enter' && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <input
      ref={innerRef}
      {...props}
      onKeyDown={handleKeyDown}
      onCompositionStart={(e) => { composing.current = true; onCompositionStart?.(e) }}
      onCompositionEnd={(e) => { composing.current = false; onCompositionEnd?.(e) }}
    />
  )
})

TextInput.displayName = 'TextInput'
export default TextInput
