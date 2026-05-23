/**
 * Vercel serverless only: public landing AI (`/api/chat`). Uses GOOGLE_GENERATIVE_AI_API_KEY.
 * Does not run in Vite dev unless you use `vercel dev` or proxy to a deployed URL.
 * Model: VERCEL_PUBLIC_AI_MODEL (preferred) or GEMINI_MODEL_ID, then default below.
 * Separate from Spring Boot portal AI (`/api/ai/chat`) — that stack uses GEMINI_API_KEY + application.properties.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

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

// Branch knowledge - inline to avoid import issues
const ASHCOL_BRANCHES = `OFFICIAL ASHCOL BRANCH DIRECTORY:

Head Office (Taguig) - Metro Manila
Address: Unit 2A & 2B, 2/F Genesis Bldg., 182-A 19th Ave., East Rembo, Taguig
Mobile: 0917 828 5595, 0917 506 2090, 0998 566 4801
Email: headoffice@ashcol.com.ph

ASHCOL Valenzuela - Metro Manila
Address: 0147 M.H. Del Pilar St., Arkong Bato, District 1, Valenzuela City
Mobile: 0943 358 4220, 0905 420 1556
Email: ashcolnorth@ashcol.com.ph

ASHCOL Bulacan
Address: Ground Floor, RME Building, Salangan, San Miguel, Bulacan
Mobile: 0917 506 2090, 0939 973 3163
Email: ashcolbulacan@gmail.com

ASHCOL Pampanga
Address: Unit 202, CitiCorp Building, Brgy. San Isidro, City of San Fernando, Pampanga
Mobile: 0917 103 8743. Landline: 045 300 8533
Email: ashcolpampanga@ashcol.com.ph

ASHCOL Rizal
Address: 2nd Flr Norika Bldg #70 E. Rodriguez Sr., San Jose Hi-way, Rodriguez, Rizal
Mobile: 0917 682 8328, 0920 923 2071
Email: ashcolrodriguezrizal@gmail.com

ASHCOL Laguna
Address: Purok 4, Kalye Pogi, Bangyas, Calauan, Laguna
Mobile: 0999 990 5224, 0949 994 3299
Email: ashcolcalauan@gmail.com

ASHCOL Batangas
Address: Ground Floor, BMI Building, 12 Laguile, Taal, Batangas
Mobile: 0998 999 3041, 0919 005 9032
Email: ashcolbatangas@ashcol.com.ph

ASHCOL Candelaria (Quezon)
Address: Maharlika Highway, Malabanban Norte, Candelaria, Quezon Province
Mobile: 0917 159 6995, 0947 993 9208
Email: ashcolcandelaria@gmail.com

ASHCOL Gen. Trias (Cavite)
Address: Blk 9 Lot 16, South Square Village, Pasong Kawayan II, General Trias, Cavite
Mobile: 0995 014 6891, 0949 307 1625
Email: ashcolcavite@ashcol.com.ph

ASHCOL Dasmarinas (Cavite)
Address: 2/F Unit 5, Blk 94 Lot 5 & 6, Governor's Drive, Metro Gate Subd., San Agustin 1, City of Dasmarinas, Cavite
Mobile: 0917 505 4925, 0949 994 3299. Landline: 046 413 1726
Email: ashcoldasma@gmail.com

ASHCOL Silang (Cavite)
Address: 2nd Floor, Rheayanelle Building, 9015 Pandan St., Brgy. Puting Kahoy, Sta. Rosa Tagaytay Road, Silang, Cavite
Mobile: 0998 577 0421, 0917 714 3810
Email: ashcolsouth@ashcol.com.ph`

const SYSTEM =
  `You are the ASHCOL AI, a professional and friendly air conditioning services assistant for ASHCOL Corporation. ` +
  `ASHCOL ORIGIN: Family-run business founded in 2014. The name ASHCOL comes from the founder's two daughters: Ashanti and Coleene. ` +
  `Tagline: "Keeping YOU Cool" - give people the comfort they deserve. ` +
  `LOCATION: Units 2A & 2B, 2/F Genesis Building, 182-A 19th Ave, East Rembo, Taguig. ` +
  `BRANCHES: 11 branches across Luzon (see directory below). ` +
  `Services: Installation and Dismantling, Preventive Maintenance, Repair and Diagnostics, Ducting, Electrical Works, Commercial/Industrial solutions. ` +
  `Brands: Carrier, Daikin, Panasonic, Samsung, LG, Koppel, Mitsubishi, York, Gree, Midea, Sharp, Haier, TCL, Aux, Fuji-Aire, Kolin. ` +
  `Contact: +63 (917) 7143810, headoffice@ashcol.com.ph. ` +
  `FORMAT RULES: Use plain text only. NO markdown. NO asterisks, stars, bullets, dashes. ` +
  `Write in short natural paragraphs. Do NOT add extra spaces. Never use bullet points. ` +
  `LANGUAGE: When user speaks Filipino/Tagalog, reply in natural Taglish. ` +
  `Use "Aircon" not formal Tagalog. Use "Repair" not "Pagkukumpuni". Keep it conversational. ` +
  `SAFETY: Never give dangerous electrical advice.\n\n` +
  ASHCOL_BRANCHES

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Log all requests for debugging
  console.log(`[api/chat] ${req.method} request received`)
  
  setCors(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Check API key
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    console.error('[api/chat] Missing GOOGLE_GENERATIVE_AI_API_KEY')
    return res.status(503).json({ error: 'AI service not configured. Missing API key.' })
  }

  try {
    // Dynamic import to handle any SDK issues gracefully
    const { generateText } = await import('ai')
    const { google } = await import('@ai-sdk/google')
    
    // Parse body safely
    let body: Record<string, unknown> = {}
    try {
      const raw = req.body
      body = typeof raw === 'string' ? (JSON.parse(raw || '{}') as Record<string, unknown>) : (raw as Record<string, unknown>) || {}
    } catch (parseErr) {
      console.error('[api/chat] Body parse error:', parseErr)
      return res.status(400).json({ error: 'Invalid JSON body' })
    }
    
    const message = body.message
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: "Field 'message' is required." })
    }

    const modelId =
      process.env.VERCEL_PUBLIC_AI_MODEL?.trim() ||
      process.env.GEMINI_MODEL_ID?.trim() ||
      'gemini-3.1-flash-lite-preview'
    console.log('[api/chat] Processing message with model:', modelId)

    const result = await generateText({
      model: google(modelId),
      system: SYSTEM,
      prompt: message.trim(),
      maxOutputTokens: 1024,
    })

    const cleanReply = cleanAiText(result.text)
    console.log('[api/chat] Success, reply length:', cleanReply.length)

    return res.status(200).json({ reply: cleanReply })
  } catch (e: unknown) {
    console.error('[api/chat] Error:', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    // Return 200 with error in body to prevent frontend crash, but mark as error
    return res.status(500).json({ error: `AI service error: ${msg}` })
  }
}
