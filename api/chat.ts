import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import { ASHCOL_BRANCHES_FOR_AI } from './branchKnowledge'

// Clean AI text: remove markdown, normalize spacing
function cleanAiText(text: string): string {
  return text
    .replace(/\*+/g, '')
    .replace(/#+/g, '')
    .replace(/- +/g, '')
    .replace(/\n\s*\n/g, '\n')
    .replace(/  +/g, ' ')
    .trim()
}

const SYSTEM =
  `You are the Ashcol AI, a professional and friendly air conditioning services assistant for Ashcol Corporation. ` +
  `ASHCOL KNOWLEDGE: Founded in 2006 with 11 branches across Luzon. ` +
  `Services: Installation and Dismantling, Preventive Maintenance, Repair and Diagnostics, Ducting, Electrical Works, Commercial/Industrial solutions. ` +
  `Brands: Carrier, Daikin, Panasonic, Samsung, LG, Koppel, Mitsubishi, York, Gree, Midea, Sharp, Haier, TCL, Aux, Fuji-Aire, Kolin. ` +
  `Contact: +63 (917) 7143810, headoffice@ashcol.com.ph. ` +
  `FORMAT RULES: Use plain text only. NO markdown. NO asterisks, stars, bullets, dashes. ` +
  `Write in short natural paragraphs. Do NOT add extra spaces. Never use bullet points. ` +
  `LANGUAGE: When user speaks Filipino/Tagalog, reply in natural Taglish. ` +
  `Use "Aircon" not formal Tagalog. Use "Repair" not "Pagkukumpuni". Keep it conversational. ` +
  `SAFETY: Never give dangerous electrical advice.\n\n` +
  ASHCOL_BRANCHES_FOR_AI

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

    // Use stable model - gemini-1.5-flash is the most reliable
    const modelId = process.env.GEMINI_MODEL_ID || 'gemini-1.5-flash'

    console.log('[api/chat] Using model:', modelId)

    const result = await generateText({
      model: google(modelId),
      system: SYSTEM,
      prompt: message.trim(),
      maxOutputTokens: 1024,
    })

    // Clean the response text
    const cleanReply = cleanAiText(result.text)

    return res.status(200).json({ reply: cleanReply })
  } catch (e: unknown) {
    console.error('[api/chat]', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return res.status(500).json({ error: msg })
  }
}
