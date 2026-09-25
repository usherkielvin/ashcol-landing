import ReactDOM from 'react-dom'
import { X, Building2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import TicketHistoryTable, { type HistoryPerson } from './TicketHistoryTable'

export interface InstallerTicketHistoryModalProps {
  installer: HistoryPerson | null
  isOpen: boolean
  onClose: () => void
}

export default function InstallerTicketHistoryModal({
  installer,
  isOpen,
  onClose
}: InstallerTicketHistoryModalProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  if (!isOpen || !installer) return null

  const modalRoot = document.body

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 md:p-6"
      style={{
        backgroundColor: isLight ? 'rgba(15, 23, 42, 0.65)' : 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border animate-[fadeIn_0.15s_ease-out]"
        style={{
          backgroundColor: isLight ? '#ffffff' : '#0A1120',
          borderColor: isLight ? '#cbd5e1' : '#1E2D48',
        }}
      >
        {/* ── Modal Header ── */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between shrink-0"
          style={{
            borderColor: isLight ? '#e2e8f0' : '#1E2D48',
            backgroundColor: isLight ? '#f8fafc' : '#0F1A2E',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm"
              style={{
                background: `linear-gradient(135deg, ${
                  ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6', '#6366F1'][
                    ((installer.name || '').charCodeAt(0) || 0) % 7
                  ]
                }, #059669)`,
              }}
            >
              {(installer.name || 'IN')
                .split(' ')
                .map(n => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  className="text-base sm:text-lg font-black uppercase tracking-tight truncate"
                  style={{ color: isLight ? '#0f172a' : '#F8FAFC' }}
                >
                  {installer.name.toUpperCase()}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {installer.jobTitle || installer.role || 'INSTALLER'}
                </span>
                {installer.branchName && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase">
                    <Building2 className="w-3 h-3 text-emerald-500" />
                    {installer.branchName}
                  </span>
                )}
              </div>
              <p
                className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-3"
              >
                <span>Assigned Tickets & Job Orders History</span>
                {installer.email && <span className="lowercase">· {installer.email}</span>}
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border transition-all hover:bg-slate-500/10 cursor-pointer shrink-0 ml-2"
            style={{
              borderColor: isLight ? '#e2e8f0' : '#1E2D48',
              color: isLight ? '#64748b' : '#94A3B8',
            }}
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Modal Body: TicketHistoryTable ── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-transparent">
          <TicketHistoryTable person={installer} />
        </div>
      </div>
    </div>,
    modalRoot
  )
}
