import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Square, Loader2, RotateCcw } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useArctic } from '../../contexts/ArcticContext'
import { API_BASE_URL } from '../../utils/api'

function describeChatNetworkError(message: string): string {
  const m = message.toLowerCase()
  if (
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('networkerror') ||
    m.includes('network request failed')
  ) {
    return 'Could not reach the API. Check that the backend is running and reachable.'
  }
  return message
}

function cleanAiText(text: string): string {
  return text
    .replace(/\*+/g, '')
    .replace(/#+/g, '')
    .replace(/- +/g, '')
    .replace(/\n\s*\n/g, '\n')
    .replace(/  +/g, ' ')
    .trim()
}

interface Message {
  id: string
  text: string
  sender: 'ai' | 'user'
  isTyping?: boolean
}

const TYPEWRITER_INTERVAL_MS = 16
const CHARS_PER_TICK = 3

const SUGGESTED_PROMPTS = [
  "What's today's schedule?",
  'Which tickets are still pending?',
  'Summarize collections this week',
]

function greetingFor(): string {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return `Good ${part}. I can help you with schedules, tickets, technicians, customers, collections and more.`
}

export default function ArcticDrawer() {
  const { isOpen, closeArctic, pageContext, dataContext, consumePendingQuestion } = useArctic()
  const fullContext = [pageContext, dataContext].filter(Boolean).join('\n\n')
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)

  const charQueueRef = useRef<string[]>([])
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamDoneRef = useRef(false)
  const activeBotMsgIdRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const bg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1e3254'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#6B90BE'
  const botBubble = isLight ? '#f1f5f9' : '#1e3254'
  const chipBg = isLight ? '#f8fafc' : '#0f1e36'

  const stopTypewriter = useCallback(() => {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current)
      typewriterRef.current = null
    }
  }, [])

  const startTypewriter = useCallback((botMsgId: string) => {
    activeBotMsgIdRef.current = botMsgId
    stopTypewriter()

    typewriterRef.current = setInterval(() => {
      const queue = charQueueRef.current
      if (queue.length === 0) {
        if (streamDoneRef.current) {
          stopTypewriter()
          setIsStreaming(false)
          setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isTyping: false } : m))
          activeBotMsgIdRef.current = null
          inputRef.current?.focus()
        }
        return
      }
      const batch = queue.splice(0, CHARS_PER_TICK).join('')
      setMessages(prev => prev.map(m =>
        m.id === botMsgId ? { ...m, text: m.text + batch, isTyping: true } : m
      ))
    }, TYPEWRITER_INTERVAL_MS)
  }, [stopTypewriter])

  const handleStopStreaming = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    stopTypewriter()
    charQueueRef.current = []
    streamDoneRef.current = false
    setIsStreaming(false)
    setIsLoading(false)
    if (activeBotMsgIdRef.current) {
      const id = activeBotMsgIdRef.current
      setMessages(prev => prev.map(m => m.id === id ? { ...m, isTyping: false } : m))
      activeBotMsgIdRef.current = null
    }
  }

  const handleResetChat = useCallback(() => {
    handleStopStreaming()
    setMessages([])
    setInputValue('')
    inputRef.current?.focus()
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || isStreaming) return
    const userText = text.trim()
    const tempId = Date.now().toString()

    setMessages(prev => [...prev, { id: tempId, text: userText, sender: 'user' }])
    setInputValue('')
    setIsLoading(true)
    charQueueRef.current = []
    streamDoneRef.current = false

    try {
      abortControllerRef.current = new AbortController()
      const response = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')}`
        },
        body: JSON.stringify({ message: userText, context: fullContext || null }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => `HTTP ${response.status}`)
        throw new Error(`Backend returned ${response.status}: ${errBody}`)
      }

      const data = await response.json()
      const reply = cleanAiText(data.reply ?? 'No response received.')

      const botMsgId = (Date.now() + 1).toString()
      setMessages(prev => [...prev, { id: botMsgId, text: '', sender: 'ai', isTyping: true }])
      setIsLoading(false)
      setIsStreaming(true)
      charQueueRef.current.push(...reply.split(''))
      streamDoneRef.current = true
      startTypewriter(botMsgId)
    } catch (error: unknown) {
      setIsLoading(false)
      stopTypewriter()
      charQueueRef.current = []
      streamDoneRef.current = false
      setIsStreaming(false)
      abortControllerRef.current = null

      const isAbort = error instanceof Error && error.name === 'AbortError'
      if (!isAbort) {
        const raw = error instanceof Error ? error.message : 'Unknown error'
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          text: `Arctic is unavailable right now: ${describeChatNetworkError(raw)}`,
          sender: 'ai'
        }])
      }
      if (activeBotMsgIdRef.current) {
        const id = activeBotMsgIdRef.current
        setMessages(prev => prev.map(m => m.id === id ? { ...m, isTyping: false } : m))
        activeBotMsgIdRef.current = null
      }
    }
  }, [isLoading, isStreaming, fullContext, startTypewriter, stopTypewriter])

  // Auto-send a queued question (from a contextual "Ask Arctic" button elsewhere) on open
  useEffect(() => {
    if (!isOpen) return
    setTimeout(() => inputRef.current?.focus(), 150)
    const queued = consumePendingQuestion()
    if (queued) void sendMessage(queued)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => () => {
    stopTypewriter()
    abortControllerRef.current?.abort()
  }, [stopTypewriter])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeArctic() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, closeArctic])

  if (!isOpen) return null

  const showSuggestions = messages.length === 0

  return (
    <>
      {/* Backdrop — dims content behind the drawer, click to close */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
        onClick={closeArctic}
      />

      <div
        ref={panelRef}
        className="fixed top-0 right-0 h-full w-full sm:w-[400px] z-50 flex flex-col shadow-2xl"
        style={{ backgroundColor: bg, borderLeft: `1px solid ${border}` }}
      >
        {/* Header */}
        <div
          className="px-4 py-3.5 flex items-center justify-between shrink-0"
          style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#10B981]/15 flex items-center justify-center text-lg shrink-0">
              🦊
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-black tracking-tight" style={{ color: textPrimary }}>ARCTIC</h3>
              <p className="text-[10.5px] font-medium truncate" style={{ color: textMuted }}>ASHCOL AI Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                onClick={handleResetChat}
                className="px-2 py-1 rounded-lg transition-colors flex items-center gap-1.5 text-[11px] font-semibold"
                title="Reset conversation and start fresh"
                style={{ color: textMuted, backgroundColor: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.color = '#10B981'
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#e2e8f0' : 'rgba(16,185,129,0.15)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.color = textMuted
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
            <button
              onClick={closeArctic}
              className="p-1.5 rounded-lg transition-colors shrink-0"
              style={{ color: textMuted }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {pageContext && (
          <div className="px-4 py-2 shrink-0 text-[10.5px] font-semibold truncate" style={{ color: '#10B981', backgroundColor: isLight ? '#f0fdf4' : 'rgba(16,185,129,0.08)', borderBottom: `1px solid ${border}` }}>
            Looking at: {pageContext}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {showSuggestions && (
            <div className="flex flex-col gap-3">
              <p className="text-[13.5px] leading-relaxed" style={{ color: textPrimary }}>
                {greetingFor()}
              </p>
              <div className="flex flex-col gap-2 mt-1">
                {SUGGESTED_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => void sendMessage(prompt)}
                    className="text-left px-3.5 py-2.5 rounded-xl text-[12.5px] font-medium transition-colors"
                    style={{ backgroundColor: chipBg, color: textPrimary, border: `1px solid ${border}` }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#10B981'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = border}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex max-w-[90%] ${msg.sender === 'user' ? 'self-end' : 'self-start'}`}
            >
              <div
                className="px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-sm whitespace-pre-wrap text-left break-words"
                style={msg.sender === 'user'
                  ? { backgroundColor: '#10B981', color: '#ffffff', borderBottomRightRadius: '4px' }
                  : { backgroundColor: botBubble, color: textPrimary, borderBottomLeftRadius: '4px' }
                }
              >
                {msg.text}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex max-w-[90%] self-start">
              <div
                className="px-4 py-3 rounded-2xl text-[13px] flex items-center gap-2"
                style={{ backgroundColor: botBubble, color: textMuted, borderBottomLeftRadius: '4px' }}
              >
                <Loader2 className="w-4 h-4 animate-spin text-[#10B981]" />
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          className="p-3 shrink-0"
          style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0f1e36' }}
        >
          <div className="relative flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isLoading && !isStreaming) void sendMessage(inputValue) }}
              placeholder={isStreaming ? 'Arctic is responding…' : 'Ask Arctic…'}
              className="w-full pl-4 pr-12 py-3 rounded-xl text-base sm:text-[13px] focus:outline-none transition-shadow"
              style={{
                backgroundColor: isLight ? '#ffffff' : '#0A1120',
                color: textPrimary,
                border: `1px solid ${border}`,
                opacity: (isLoading || isStreaming) ? 0.6 : 1
              }}
            />
            <button
              onClick={() => isStreaming ? handleStopStreaming() : void sendMessage(inputValue)}
              disabled={(!inputValue.trim() && !isStreaming) || isLoading}
              className="absolute right-2 p-2 rounded-lg transition-colors"
              style={{
                backgroundColor: isStreaming ? '#EF4444' : (inputValue.trim() ? '#10B981' : 'transparent'),
                color: isStreaming ? '#ffffff' : (inputValue.trim() ? '#ffffff' : textMuted),
                opacity: ((!inputValue.trim() && !isStreaming) || isLoading) ? 0.45 : 1
              }}
            >
              {isStreaming ? <Square className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="mt-2 text-center text-[9px] font-medium" style={{ color: textMuted }}>
            Arctic · ASHCOL Intelligence
          </div>
        </div>
      </div>
    </>
  )
}
