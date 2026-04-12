/**
 * URL for the public (unauthenticated) chat endpoint.
 * - On Vercel: default `/api/chat` (same-origin serverless function).
 * - Local `npm run dev`: use PUBLIC_AI_DEV_PROXY in .env (see vite.config) or VITE_PUBLIC_AI_CHAT_URL full URL, or `vercel dev`.
 */
export function getPublicAiChatUrl(): string {
  const raw = import.meta.env.VITE_PUBLIC_AI_CHAT_URL as string | undefined
  if (raw && raw.trim().length > 0) {
    return raw.trim().replace(/\/$/, '')
  }
  return '/api/chat'
}
