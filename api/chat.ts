import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

const SYSTEM = `You are the Ashcol AI, a professional and friendly air conditioning services assistant for Ashcol Corporation. ` +
  `You help with basic troubleshooting, maintenance tips, and how to book service. ` +
  `When the user writes in Filipino or Tagalog, respond in natural Taglish. ` +
  `Use "Aircon" not overly formal Tagalog for technical terms. ` +
  `Do not give dangerous electrical advice; suggest contacting Ashcol or a licensed technician for risky work.`

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error('[api/chat] Missing GOOGLE_GENERATIVE_AI_API_KEY')
    return res.status(503).json({ error: 'AI is not configured on the server.' })
  }

  try {
    const raw = req.body
    const body = typeof raw === 'string' ? (JSON.parse(raw || '{}') as Record<string, unknown>) : (raw as Record<string, unknown>) || {}
    const message = body.message
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: "Field 'message' is required." })
    }

    const modelId = process.env.GEMINI_MODEL_ID || 'gemini-3.1-flash-lite-preview'

    const result = await generateText({
      model: google(modelId),
      system: SYSTEM,
      prompt: message.trim(),
      maxOutputTokens: 1024,
    })

    return res.status(200).json({ reply: result.text })
  } catch (e: unknown) {
    console.error('[api/chat]', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return res.status(500).json({ error: msg })
  }
}
