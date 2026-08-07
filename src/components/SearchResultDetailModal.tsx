import { useEffect } from 'react'
import { X, MapPin, Phone, User, CalendarDays, Tag } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────
interface SearchResult {
  type: 'ticket'
  id: string
  customerName?: string
  rawData?: Record<string, any>
}

interface SearchResultDetailModalProps {
  result: SearchResult
  onClose: () => void
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatAddress(loc: any): string {
  if (!loc) return '—'
  if (typeof loc === 'string') return loc
  const parts = [loc.addressLine1, loc.barangay, loc.city, loc.province].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : '—'
}

function getStatusStyle(status: string, isLight: boolean, textMuted: string) {
  const s = (status || '').toUpperCase()
  if (s.includes('COMPLETE'))  return { backgroundColor: 'rgba(16,185,129,0.1)',  color: '#10B981' }
  if (s.includes('PROGRESS') || s.includes('ASSIGNED'))
                               return { backgroundColor: 'rgba(59,130,246,0.1)',   color: '#3B82F6' }
  if (s.includes('PENDING'))   return { backgroundColor: 'rgba(245,158,11,0.1)',   color: '#F59E0B' }
  if (s.includes('CANCEL'))    return { backgroundColor: 'rgba(239,68,68,0.1)',    color: '#EF4444' }
  return { backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textMuted }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SearchResultDetailModal({ result, onClose }: SearchResultDetailModalProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const overlayBg   = isLight ? 'rgba(15,23,42,0.55)' : 'rgba(0,0,0,0.7)'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const green       = '#10B981'

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const d = result.rawData || {}
  const ticketNum  = d.ticketNumber  || d.ticket_number  || result.id
  const customer   = result.customerName || d.customerName || d.customer_name || '—'
  const status     = d.status || '—'
  const statusStyle = getStatusStyle(status, isLight, textMuted)
  const address    = formatAddress(d.location)
  const phone      = d.contactPhone || d.contact_phone || '—'
  const technician = d.assignedEmployeeName || d.assigned_employee_name || '—'
  const date       = d.preferredDate || d.preferred_date || '—'
  const serviceType = d.serviceType  || d.service_type  || '—'
  const unitType   = d.unitType      || d.unit_type      || '—'
  const branch     = d.branchId      || d.branch_id      || '—'
  const acDetails  = d.acDetails     || d.ac_details      || '—'

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: overlayBg }}
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
        style={{ backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="shrink-0 flex items-start justify-between px-6 py-5"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-extrabold tracking-widest uppercase" style={{ color: textMuted }}>
              Ticket #{ticketNum}
            </span>
            <h2 className="text-base font-black leading-tight" style={{ color: textPrimary }}>
              {customer}
            </h2>
            <span
              className="self-start mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
            >
              {status}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:opacity-70 transition-opacity focus:outline-none shrink-0 mt-0.5"
            style={{ color: textMuted }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {/* Detail rows */}
          {[
            { icon: <MapPin  className="w-4 h-4 shrink-0" style={{ color: green }} />, label: 'Address',     value: address },
            { icon: <Phone   className="w-4 h-4 shrink-0" style={{ color: green }} />, label: 'Contact',     value: phone },
            { icon: <User    className="w-4 h-4 shrink-0" style={{ color: green }} />, label: 'Technician',  value: technician },
            { icon: <CalendarDays className="w-4 h-4 shrink-0" style={{ color: green }} />, label: 'Date',   value: date },
            { icon: <Tag     className="w-4 h-4 shrink-0" style={{ color: green }} />, label: 'Service',     value: serviceType },
            { icon: <Tag     className="w-4 h-4 shrink-0" style={{ color: green }} />, label: 'Unit Type',   value: unitType },
            { icon: <Tag     className="w-4 h-4 shrink-0" style={{ color: green }} />, label: 'Branch',      value: branch },
            { icon: <Tag     className="w-4 h-4 shrink-0" style={{ color: green }} />, label: 'AC Details',  value: acDetails },
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-start gap-3">
              <span className="mt-0.5">{icon}</span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{label}</span>
                <span className="text-sm font-semibold break-words" style={{ color: textPrimary }}>{value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div
          className="shrink-0 px-6 py-4 flex justify-end"
          style={{ borderTop: `1px solid ${border}` }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold rounded-full transition-colors focus:outline-none"
            style={{ backgroundColor: green, color: '#fff', boxShadow: `0 2px 8px ${green}55` }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
