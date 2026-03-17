import { useState, useRef, useCallback, type ChangeEvent } from 'react'

/**
 * Hook for text inputs that need sanitization but must not break CJK IME.
 * During composition (e.g., typing Chinese/Japanese/Korean), raw text is kept.
 * Sanitization only runs when composition ends or on non-composing input.
 */
export function useSanitizedInput(
  sanitize: (v: string) => string,
  initial = ''
) {
  const [value, setValue] = useState(initial)
  const composingRef = useRef(false)

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (composingRef.current) {
      // During IME composition — accept raw value, don't sanitize
      setValue(e.target.value)
    } else {
      setValue(sanitize(e.target.value))
    }
  }, [sanitize])

  const onCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const onCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false
    // Sanitize the final composed text
    setValue(sanitize((e.target as HTMLInputElement).value))
  }, [sanitize])

  const inputProps = {
    value,
    onChange,
    onCompositionStart,
    onCompositionEnd,
  }

  return [value, setValue, inputProps] as const
}
