import { useEffect, useState } from 'react'

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000 // active within the last 5 min = "online now"

function timeAgo(from: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return from.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Online dot + "last seen" text, derived client-side from lastActiveAt/lastLoginAt so it stays
 *  live (re-evaluates every tick) without needing to refetch the profile. */
export default function PresenceStatus({ lastActiveAt, lastLoginAt, textMuted }: {
  lastActiveAt?: string | null
  lastLoginAt?: string | null
  textMuted: string
}) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const activeDate = lastActiveAt ? new Date(lastActiveAt) : null
  const isOnline = !!activeDate && !isNaN(activeDate.getTime()) && (now.getTime() - activeDate.getTime()) < ONLINE_THRESHOLD_MS

  const referenceDate = activeDate && !isNaN(activeDate.getTime()) ? activeDate : (lastLoginAt ? new Date(lastLoginAt) : null)
  const hasReference = !!referenceDate && !isNaN(referenceDate.getTime())

  return (
    <span className="text-[11px] flex items-center gap-1.5" style={{ color: isOnline ? '#10B981' : textMuted }}>
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: isOnline ? '#10B981' : hasReference ? textMuted : 'rgba(148, 163, 184, 0.6)' }}
      />
      {isOnline ? 'Online now' : hasReference ? `Last seen ${timeAgo(referenceDate!, now)}` : 'Account not yet activated'}
    </span>
  )
}
