import { useRef, forwardRef, useImperativeHandle } from 'react'

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onKeyDown'> {
  /** Called on Enter key press (not during IME composition) */
  onSubmit?: () => void
}

/**
 * Input with IME composition awareness.
 * Prevents Enter from firing onSubmit while composing (e.g. Chinese input).
 */
const TextInput = forwardRef<HTMLInputElement, TextInputProps>(({ onSubmit, ...props }, ref) => {
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
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={() => { composing.current = false }}
    />
  )
})

TextInput.displayName = 'TextInput'
export default TextInput
