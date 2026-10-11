import { useEffect, useState } from 'react'
import { getInitials } from '../contexts/AuthContext'
import { resolveImageUrl } from '../utils/api'

export type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_MAP: Record<UserAvatarSize, { box: string; text: string }> = {
  xs: { box: 'w-8 h-8', text: 'text-[10px]' },
  sm: { box: 'w-9 h-9', text: 'text-xs' },
  md: { box: 'w-14 h-14', text: 'text-sm' },
  lg: { box: 'w-24 h-24', text: 'text-2xl' },
  xl: { box: 'w-32 h-32', text: 'text-3xl' },
}

const AVATAR_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6', '#6366F1']

function colorForName(name: string) {
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length]
}

interface UserAvatarProps {
  name?: string
  imageUrl?: string | null
  size?: UserAvatarSize
  className?: string
  ring?: boolean
  /** Sidebar / dark surfaces — white ring instead of green */
  variant?: 'default' | 'sidebar'
}

export default function UserAvatar({
  name = '',
  imageUrl,
  size = 'md',
  className = '',
  ring = false,
  variant = 'default',
}: UserAvatarProps) {
  const [broken, setBroken] = useState(false)
  const src = resolveImageUrl(imageUrl)
  const { box, text } = SIZE_MAP[size]

  useEffect(() => {
    setBroken(false)
  }, [src])

  const ringCls = ring
    ? variant === 'sidebar'
      ? 'ring-2 ring-white/30'
      : 'ring-2 ring-[#10B981]/30'
  : ''

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name || 'Profile'}
        className={`${box} rounded-full object-cover shrink-0 ${ringCls} ${className}`}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    )
  }

  return (
    <div
      className={`${box} rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${text} ${className}`}
      style={{ background: `linear-gradient(135deg, ${colorForName(name)}, #059669)` }}
      aria-hidden={!name}
    >
      {getInitials(name) || '?'}
    </div>
  )
}
