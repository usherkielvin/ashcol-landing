import { createContext, useContext, useState, useCallback, useRef } from 'react'

interface ArcticContextType {
  isOpen: boolean
  openArctic: (prefillQuestion?: string) => void
  closeArctic: () => void
  toggleArctic: () => void
  /** Free-text describing what the user is currently looking at (page, branch, date…). */
  pageContext: string | null
  setPageContext: (context: string | null) => void
  /** Free-text data snapshot a page can supply (e.g. the tickets currently visible in its table),
   *  so Arctic answers from what's actually on screen instead of guessing. Cleared by the page on unmount. */
  dataContext: string | null
  setDataContext: (context: string | null) => void
  /** Question queued by openArctic(question) — the drawer consumes and clears it. */
  consumePendingQuestion: () => string | null
}

const ArcticContext = createContext<ArcticContextType | undefined>(undefined)

export function ArcticProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [pageContext, setPageContext] = useState<string | null>(null)
  const [dataContext, setDataContext] = useState<string | null>(null)
  const pendingQuestionRef = useRef<string | null>(null)

  const openArctic = useCallback((prefillQuestion?: string) => {
    pendingQuestionRef.current = prefillQuestion ?? null
    setIsOpen(true)
  }, [])

  const closeArctic = useCallback(() => setIsOpen(false), [])
  const toggleArctic = useCallback(() => setIsOpen(prev => !prev), [])

  const consumePendingQuestion = useCallback(() => {
    const q = pendingQuestionRef.current
    pendingQuestionRef.current = null
    return q
  }, [])

  return (
    <ArcticContext.Provider value={{
      isOpen, openArctic, closeArctic, toggleArctic,
      pageContext, setPageContext,
      dataContext, setDataContext,
      consumePendingQuestion,
    }}>
      {children}
    </ArcticContext.Provider>
  )
}

export function useArctic() {
  const ctx = useContext(ArcticContext)
  if (!ctx) throw new Error('useArctic must be used within ArcticProvider')
  return ctx
}
