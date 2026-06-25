import { AlertTriangle, CheckCircle2, Save, Trash2, X } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export type ConfirmDialogVariant = 'save' | 'discard' | 'danger' | 'info'

export type ConfirmDialogState = {
  title: string
  message: string
  detail?: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmDialogVariant
  onConfirm: () => void
}

type ConfirmDialogProps = {
  dialog: ConfirmDialogState | null
  onClose: () => void
}

const VARIANT_STYLES: Record<ConfirmDialogVariant, {
  border: string
  bar: string
  iconBg: string
  iconColor: string
  button: string
}> = {
  save: {
    border: 'rgba(22,163,74,0.28)',
    bar: 'linear-gradient(90deg, #16A34A, #22C55E)',
    iconBg: 'rgba(22,163,74,0.12)',
    iconColor: '#16A34A',
    button: 'linear-gradient(135deg, #16A34A, #15803D)',
  },
  discard: {
    border: 'rgba(245,158,11,0.28)',
    bar: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
    iconBg: 'rgba(245,158,11,0.12)',
    iconColor: '#D97706',
    button: 'linear-gradient(135deg, #F59E0B, #D97706)',
  },
  danger: {
    border: 'rgba(239,68,68,0.28)',
    bar: 'linear-gradient(90deg, #EF4444, #F87171)',
    iconBg: 'rgba(239,68,68,0.12)',
    iconColor: '#EF4444',
    button: 'linear-gradient(135deg, #EF4444, #DC2626)',
  },
  info: {
    border: 'rgba(59,130,246,0.28)',
    bar: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
    iconBg: 'rgba(59,130,246,0.12)',
    iconColor: '#3B82F6',
    button: 'linear-gradient(135deg, #3B82F6, #2563EB)',
  },
}

function VariantIcon({ variant }: { variant: ConfirmDialogVariant }) {
  const color = VARIANT_STYLES[variant].iconColor
  if (variant === 'save') return <Save className="w-4 h-4" style={{ color }} />
  if (variant === 'discard') return <AlertTriangle className="w-4 h-4" style={{ color }} />
  if (variant === 'danger') return <Trash2 className="w-4 h-4" style={{ color }} />
  return <CheckCircle2 className="w-4 h-4" style={{ color }} />
}

export default function ConfirmDialog({ dialog, onClose }: ConfirmDialogProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  if (!dialog) return null

  const variant = dialog.variant ?? 'info'
  const styles = VARIANT_STYLES[variant]
  const cardBg = isLight ? '#ffffff' : '#1E293B'
  const border = isLight ? '#e2e8f0' : '#334155'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#94A3B8'

  return (
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
      onMouseDown={e => e.preventDefault()}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150"
        style={{ backgroundColor: cardBg, border: `1px solid ${styles.border}` }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div style={{ height: 3, background: styles.bar }} />

        <div className="px-5 py-4 flex items-start justify-between gap-3"
             style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                 style={{ backgroundColor: styles.iconBg }}>
              <VariantIcon variant={variant} />
            </div>
            <div className="min-w-0">
              <h2 id="confirm-dialog-title" className="text-sm font-black leading-snug"
                  style={{ color: textPrimary }}>
                {dialog.title}
              </h2>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: textMuted }}>
                {dialog.message}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose}
                  className="p-1.5 rounded-lg shrink-0 hover:opacity-70 transition-opacity"
                  style={{ color: textMuted }}
                  aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {dialog.detail && (
          <div className="px-5 py-3 mx-5 mt-4 rounded-xl text-xs font-semibold leading-relaxed"
               style={{
                 backgroundColor: isLight ? '#f8fafc' : '#0f172a',
                 border: `1px solid ${border}`,
                 color: textPrimary,
               }}>
            {dialog.detail}
          </div>
        )}

        <div className="px-5 py-4 flex items-center justify-end gap-2 mt-1">
          <button type="button" onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-80"
                  style={{
                    backgroundColor: isLight ? '#F1F5F9' : '#0F172A',
                    color: textMuted,
                    border: `1px solid ${border}`,
                  }}>
            {dialog.cancelText ?? 'Cancel'}
          </button>
          <button type="button"
                  onClick={() => { dialog.onConfirm(); onClose() }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] shadow-sm"
                  style={{ background: styles.button }}>
            {dialog.confirmText ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
