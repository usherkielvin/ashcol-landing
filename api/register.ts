/**
 * Serves the SPA shell for /register with its own link-preview tags (title, description, banner image).
 * Chat apps and social crawlers read the raw HTML and never run the app, so the registration link can only
 * get its own preview if the server hands them different <meta> tags. Browsers still get the normal app:
 * the body is the real built index.html, so the client router boots on /register as usual.
 * Wired up by the /register rewrite in vercel.json.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const TITLE = 'Join the ASHCOL team | Register your member account'
const DESCRIPTION =
  'Create your ASHCOL member account in a few quick steps. An admin reviews every sign-up before you can log in.'
const IMAGE_ALT = 'Join the ASHCOL team — register your member account'

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Replace the tag's content if present, otherwise add the tag just before </head>. */
function setMeta(html: string, attr: 'name' | 'property', key: string, content: string): string {
  const tag = `<meta ${attr}="${key}" content="${escAttr(content)}" />`
  const existing = new RegExp(`<meta\\s+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'i')
  return existing.test(html) ? html.replace(existing, tag) : html.replace('</head>', `    ${tag}\n  </head>`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]
  const origin = `${proto}://${host}`

  let html = ''
  try {
    // The built index.html is a static file, so this bypasses the rewrite that sent us here.
    const shell = await fetch(`${origin}/index.html`)
    if (shell.ok) html = await shell.text()
  } catch {
    html = ''
  }
  if (!html.includes('</head>')) {
    return res.status(502).send('Could not load the registration page. Please try again.')
  }

  const url = `${origin}/register`
  const image = `${origin}/og-register.png`

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escAttr(TITLE)}</title>`)
  html = setMeta(html, 'name', 'description', DESCRIPTION)
  html = setMeta(html, 'property', 'og:url', url)
  html = setMeta(html, 'property', 'og:title', TITLE)
  html = setMeta(html, 'property', 'og:description', DESCRIPTION)
  html = setMeta(html, 'property', 'og:image', image)
  html = setMeta(html, 'property', 'og:image:secure_url', image)
  html = setMeta(html, 'property', 'og:image:type', 'image/png')
  html = setMeta(html, 'property', 'og:image:width', '1200')
  html = setMeta(html, 'property', 'og:image:height', '630')
  html = setMeta(html, 'property', 'og:image:alt', IMAGE_ALT)
  html = setMeta(html, 'name', 'twitter:url', url)
  html = setMeta(html, 'name', 'twitter:title', TITLE)
  html = setMeta(html, 'name', 'twitter:description', DESCRIPTION)
  html = setMeta(html, 'name', 'twitter:image', image)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  return res.status(200).send(html)
}
