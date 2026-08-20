import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Bot, User, Loader2, Square } from 'lucide-react'
import { getPublicAiChatUrl } from '../utils/publicAiChat'

interface Message {
  id: string
  text: string
  sender: 'ai' | 'user'
  isTyping?: boolean
}

const TYPEWRITER_INTERVAL_MS = 16
const CHARS_PER_TICK = 3

// Clean AI text: remove markdown, normalize spacing
function cleanAiText(text: string): string {
  return text
    .replace(/\*+/g, '') // Remove asterisks
    .replace(/#+/g, '') // Remove hash symbols
    .replace(/- +/g, '') // Remove bullet dashes
    .replace(/\n\s*\n/g, '\n') // Remove extra blank lines
    .replace(/  +/g, ' ') // Collapse multiple spaces to single space
    .trim()
}

interface PublicAIChatBotProps {
  isOpen: boolean
  onClose: () => void
  /** Matches Landing page dark/light toggle */
  isDark: boolean
}

export default function PublicAIChatBot({ isOpen, onClose, isDark }: PublicAIChatBotProps) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hi! I'm the ASHCOL AI. Ask me about aircon service, booking, or basic troubleshooting.", sender: 'ai' },
  ])
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

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  const isLight = !isDark
  const bg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1e3254'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#6B90BE'
  const botBubble = isLight ? '#f1f5f9' : '#1e3254'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const stopTypewriter = useCallback(() => {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current)
      typewriterRef.current = null
    }
  }, [])

  useEffect(() => () => {
    stopTypewriter()
    abortControllerRef.current?.abort()
  }, [stopTypewriter])

  const startTypewriter = useCallback(
    (botMsgId: string) => {
      activeBotMsgIdRef.current = botMsgId
      stopTypewriter()
      typewriterRef.current = setInterval(() => {
        const queue = charQueueRef.current
        if (queue.length === 0) {
          if (streamDoneRef.current) {
            stopTypewriter()
            setIsStreaming(false)
            setMessages((prev) => prev.map((m) => (m.id === botMsgId ? { ...m, isTyping: false } : m)))
            activeBotMsgIdRef.current = null
          }
          return
        }
        const batch = queue.splice(0, CHARS_PER_TICK).join('')
        setMessages((prev) =>
          prev.map((m) => (m.id === botMsgId ? { ...m, text: m.text + batch, isTyping: true } : m)),
        )
      }, TYPEWRITER_INTERVAL_MS)
    },
    [stopTypewriter],
  )

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
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isTyping: false } : m)))
      activeBotMsgIdRef.current = null
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || isStreaming) return

    const userText = inputValue.trim()
    const tempId = Date.now().toString()
    setMessages((prev) => [...prev, { id: tempId, text: userText, sender: 'user' }])
    setInputValue('')
    setIsLoading(true)
    charQueueRef.current = []
    streamDoneRef.current = false

    const chatUrl = getPublicAiChatUrl()

    try {
      abortControllerRef.current = new AbortController()
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => `HTTP ${response.status}`)
        throw new Error(`HTTP ${response.status}: ${errBody}`)
      }

      const data = (await response.json()) as { reply?: string; error?: string }
      const rawReply = data.reply ?? (data.error ? `Error: ${data.error}` : 'No response received.')
      const reply = cleanAiText(rawReply)

      const botMsgId = (Date.now() + 1).toString()
      setMessages((prev) => [...prev, { id: botMsgId, text: '', sender: 'ai', isTyping: true }])
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
        const lower = raw.toLowerCase()
        let hint = raw
        if (lower.includes('404')) {
          hint =
            `HTTP 404 — Vite does not run /api/chat locally. Fix one of: (1) Add PUBLIC_AI_DEV_PROXY=https://your-app.vercel.app to .env and restart dev (proxies /api/chat), ` +
            `(2) Set VITE_PUBLIC_AI_CHAT_URL=https://your-app.vercel.app/api/chat, or (3) run npx vercel dev instead of npm run dev.`
        } else if (lower.includes('failed to fetch') || lower.includes('network')) {
          hint = `Could not reach ${chatUrl}. Set VITE_PUBLIC_AI_CHAT_URL to your deployed /api/chat URL, or PUBLIC_AI_DEV_PROXY in .env for local dev.`
        }
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 1).toString(), text: `⚠️ AI unavailable: ${hint}`, sender: 'ai' },
        ])
      }
      if (activeBotMsgIdRef.current) {
        const id = activeBotMsgIdRef.current
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isTyping: false } : m)))
        activeBotMsgIdRef.current = null
      }
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed bottom-6 right-6 w-[350px] sm:w-[400px] h-[500px] rounded-2xl shadow-2xl flex flex-col z-[70] overflow-hidden"
      style={{ backgroundColor: bg, border: `1px solid ${border}` }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#10B981]/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-[#10B981]" />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: textPrimary }}>ASHCOL AI</h3>
            <p className="text-[10px]" style={{ color: textMuted }}>Ask about services or booking</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          style={{ color: textMuted }}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 max-w-[85%] ${msg.sender === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
          >
            <div className="shrink-0 mt-auto">
              {msg.sender === 'ai' ? (
                <div className="w-6 h-6 rounded-full bg-[#10B981]/20 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-[#10B981]" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  <User className="w-3.5 h-3.5" style={{ color: textMuted }} />
                </div>
              )}
            </div>
            <div
              className="px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-sm whitespace-pre-wrap text-left break-words [word-spacing:normal]"
              style={
                msg.sender === 'user'
                  ? { backgroundColor: '#10B981', color: '#ffffff', borderBottomRightRadius: '4px' }
                  : { backgroundColor: botBubble, color: textPrimary, borderBottomLeftRadius: '4px' }
              }
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 max-w-[85%] self-start">
            <div className="shrink-0 mt-auto">
              <div className="w-6 h-6 rounded-full bg-[#10B981]/20 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-[#10B981]" />
              </div>
            </div>
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

      <div
        className="p-3 shrink-0"
        style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0f1e36' }}
      >
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isLoading && !isStreaming) handleSendMessage()
            }}
            placeholder={isStreaming ? 'AI is responding…' : 'Ask about aircon or booking…'}
            className="w-full pl-4 pr-12 py-3 rounded-xl text-base sm:text-[13px] focus:outline-none transition-shadow"
            style={{
              backgroundColor: isLight ? '#ffffff' : '#0A1120',
              color: textPrimary,
              border: `1px solid ${border}`,
            }}
          />
          <button
            type="button"
            onClick={isStreaming ? handleStopStreaming : handleSendMessage}
            disabled={(!inputValue.trim() && !isStreaming) || isLoading}
            className="absolute right-2 p-2 rounded-lg transition-colors"
            style={{
              backgroundColor: isStreaming ? '#EF4444' : inputValue.trim() ? '#10B981' : 'transparent',
              color: isStreaming ? '#ffffff' : inputValue.trim() ? '#ffffff' : textMuted,
              opacity: (!inputValue.trim() && !isStreaming) || isLoading ? 0.45 : 1,
            }}
          >
            {isStreaming ? <Square className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="mt-2 text-center text-[9px] font-medium" style={{ color: textMuted }}>
          Powered by Gemini · Google AI
        </p>
      </div>
    </div>
  )
}
