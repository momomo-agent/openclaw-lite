import { useEffect } from 'react'

declare global {
  interface Window {
    api: any
  }
}

export function useIPC() {
  return window.api
}

export function useIPCListener(event: string, handler: (data: any) => void) {
  useEffect(() => {
    if (window.api && window.api[event]) {
      window.api[event](handler)
    }
  }, [event, handler])
}
