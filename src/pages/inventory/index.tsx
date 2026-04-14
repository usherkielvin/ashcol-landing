import { Package } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

export default function InventoryPage() {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1a2844'
  const textMuted = isLight ? '#64748b' : '#6B90BE'

  return (
    <div className="max-w-3xl">
      <div
        className="rounded-2xl p-8 md:p-10 border"
        style={{ backgroundColor: cardBg, borderColor: border }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }}
          >
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight">Inventory</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: textMuted }}>
              Stock, transfers, and parts usage will live here. Backend APIs are not wired yet—this
              route reserves the area for upcoming work.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
