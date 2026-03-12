import { useState, useEffect } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState('default')

  useEffect(() => {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  return { theme, setTheme }
}
