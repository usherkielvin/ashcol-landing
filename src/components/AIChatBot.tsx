import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Bot, User, Loader2, Square } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'

function describeChatNetworkError(message: string): string {
  const m = message.toLowerCase()
  if (
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('networkerror') ||
    m.includes('network request failed')
  ) {
    return (
      'Could not reach the API (browser "Failed to fetch"). Usual causes: backend not running; ' +
      'VITE_API_BASE_URL in .env does not match the real URL/port (if 8080 is in use Spring may pick 8081); ' +
      'or CORS — open DevTools → Network and confirm the request URL. ' +
      `(Trying: ${API_BASE_URL}/ai/chat)`
    )
  }
  return message
}

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

interface Message {
  id: string
  text: string
  sender: 'ai' | 'user'
  isTyping?: boolean   // true while typewriter animation is running for this bubble
}

// How fast the typewriter drains the buffer (ms per character batch)
const TYPEWRITER_INTERVAL_MS = 16  // ~60fps
const CHARS_PER_TICK = 3           // characters revealed per tick — increase for faster typing

export default function AIChatBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hi! I'm the ASHCOL Agentic Assistant. How can I help you today?", sender: 'ai' }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)

  // The raw buffer of characters received from the stream but not yet shown
  const charQueueRef = useRef<string[]>([])
  // The typewriter interval handle
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Whether the SSE stream is fully done sending
  const streamDoneRef = useRef(false)
  // The message ID of the active bot bubble being typed
  const activeBotMsgIdRef = useRef<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  const { theme } = useTheme()
  const isLight = theme === 'light'

  const bg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1e3254'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#6B90BE'
  const botBubble = isLight ? '#f1f5f9' : '#1e3254'

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cleanup intervals/streams on unmount
  useEffect(() => () => {
    stopTypewriter()
    abortControllerRef.current?.abort()
  }, [])

  const stopTypewriter = useCallback(() => {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current)
      typewriterRef.current = null
    }
  }, [])

  /**
   * Start the typewriter drain loop.
   * It drains CHARS_PER_TICK characters from charQueueRef into the active bot message
   * on every TYPEWRITER_INTERVAL_MS tick, independent of the network stream speed.
   */
  const startTypewriter = useCallback((botMsgId: string) => {
    activeBotMsgIdRef.current = botMsgId
    stopTypewriter()

    typewriterRef.current = setInterval(() => {
      const queue = charQueueRef.current
      if (queue.length === 0) {
        // If the stream is done and queue is empty, we are finished
        if (streamDoneRef.current) {
          stopTypewriter()
          setIsStreaming(false)
          // Remove blinking cursor flag
          setMessages(prev => prev.map(m =>
            m.id === botMsgId ? { ...m, isTyping: false } : m
          ))
          activeBotMsgIdRef.current = null
          inputRef.current?.focus()
        }
        return
      }

      // Take CHARS_PER_TICK characters from the front of the queue
      const batch = queue.splice(0, CHARS_PER_TICK).join('')

      setMessages(prev => prev.map(m =>
        m.id === botMsgId
          ? { ...m, text: m.text + batch, isTyping: true }
          : m
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
    // Remove typing cursor from last message
    if (activeBotMsgIdRef.current) {
      const id = activeBotMsgIdRef.current
      setMessages(prev => prev.map(m => m.id === id ? { ...m, isTyping: false } : m))
      activeBotMsgIdRef.current = null
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || isStreaming) return

    const userText = inputValue.trim()
    const tempId = Date.now().toString()

    setMessages(prev => [...prev, { id: tempId, text: userText, sender: 'user' }])
    setInputValue('')
    inputRef.current?.focus()
    setIsLoading(true)

    // Reset typewriter queue
    charQueueRef.current = []
    streamDoneRef.current = false

    try {
      abortControllerRef.current = new AbortController()

      // Use the reliable non-streaming endpoint — animate the full reply locally
      const response = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ashcol-token')}`
        },
        body: JSON.stringify({ message: userText }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => `HTTP ${response.status}`)
        console.error('[Ashcol AI] Backend error:', response.status, errBody)
        throw new Error(`Backend returned ${response.status}: ${errBody}`)
      }

      const data = await response.json()
      const rawReply: string = data.reply ?? 'No response received.'
      const reply = cleanAiText(rawReply)

      // Add empty bot bubble and start typewriter animation
      const botMsgId = (Date.now() + 1).toString()
      setMessages(prev => [...prev, { id: botMsgId, text: '', sender: 'ai', isTyping: true }])
      setIsLoading(false)
      setIsStreaming(true)

      // Feed ALL characters from the full reply into the queue at once —
      // the typewriter interval will drain them smoothly at its own pace.
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
        const errMsg = describeChatNetworkError(raw)
        console.error('[Ashcol AI] Chat error:', raw, { url: `${API_BASE_URL}/ai/chat` })
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          text: `⚠️ AI unavailable: ${errMsg}`,
          sender: 'ai'
        }])
      }

      if (activeBotMsgIdRef.current) {
        const id = activeBotMsgIdRef.current
        setMessages(prev => prev.map(m => m.id === id ? { ...m, isTyping: false } : m))
        activeBotMsgIdRef.current = null
      }
    }
  }

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          id="ai-chatbot-open-btn"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 p-4 rounded-full shadow-2xl hover:scale-105 transition-transform z-50 flex items-center justify-center bg-gradient-to-r from-[#10B981] to-[#059669] text-white"
        >
          <Bot className="w-6 h-6" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 w-[350px] sm:w-[400px] h-[500px] rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden"
          style={{ backgroundColor: bg, border: `1px solid ${border}` }}
        >
          {/* Header */}
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
              id="ai-chatbot-close-btn"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style={{ color: textMuted }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] ${msg.sender === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
              >
                {/* Avatar */}
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

                {/* Bubble */}
                <div
                  className="px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-sm whitespace-pre-wrap text-left break-words [word-spacing:normal]"
                  style={msg.sender === 'user'
                    ? { backgroundColor: '#10B981', color: '#ffffff', borderBottomRightRadius: '4px' }
                    : { backgroundColor: botBubble, color: textPrimary, borderBottomLeftRadius: '4px' }
                  }
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Thinking spinner — only while waiting for the first byte */}
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

          {/* Input Area */}
          <div
            className="p-3 shrink-0"
            style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0f1e36' }}
          >
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                id="ai-chatbot-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isLoading && !isStreaming) handleSendMessage() }}
                placeholder={isStreaming ? 'AI is responding…' : 'Ask me anything…'}
                className="w-full pl-4 pr-12 py-3 rounded-xl text-base sm:text-[13px] focus:outline-none transition-shadow"
                style={{
                  backgroundColor: isLight ? '#ffffff' : '#0A1120',
                  color: textPrimary,
                  border: `1px solid ${border}`,
                  opacity: (isLoading || isStreaming) ? 0.6 : 1
                }}
              />
              <button
                id="ai-chatbot-send-btn"
                onClick={isStreaming ? handleStopStreaming : handleSendMessage}
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
              Powered by Gemini 3 Flash-Lite · Google AI Studio
            </div>
          </div>
        </div>
      )}

      {/* Keyframe for blinking cursor */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </>
  )
}
