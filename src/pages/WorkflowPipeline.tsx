import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'
import {
  Radio, Building2, UserCog, ShieldCheck, HandCoins, Calculator, Landmark,
  RefreshCw, X, ChevronRight, Clock, ArrowRight, Loader2, AlertCircle,
  Inbox, CheckCircle2, Upload, FileText
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────
interface TicketResponse {
  id: string
  controlNumber?: string
  firstName?: string
  lastName?: string
  branchName?: string
  branchId?: string
  status?: string
  stage?: string
  currentStage?: string
  createdAt?: string
  assignedNegotiatorId?: string
  assignedNegotiatorName?: string
  charges?: number
  paymentMode?: string
  warrantyRegistrationNumber?: string
  adminIncentive?: number
  promodiserCommission?: number
  storeReferralFee?: number
}

interface StageConfig {
  key: string
  label: string
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>
  gradient: string
  color: string
}

// ── Stage Definitions ──────────────────────────────────────────────
const STAGES: StageConfig[] = [
  { key: 'DISPATCHER', label: 'Dispatcher', icon: Radio, gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#8b5cf6' },
  { key: 'MAIN_BRANCH', label: 'Branch OIC', icon: Building2, gradient: 'linear-gradient(135deg, #3b82f6, #2dd4bf)', color: '#3b82f6' },
  { key: 'NEGOTIATOR', label: 'Negotiator', icon: UserCog, gradient: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#f59e0b' },
  { key: 'WARRANTY_REGISTRATION', label: 'Warranty', icon: ShieldCheck, gradient: 'linear-gradient(135deg, #10b981, #059669)', color: '#10b981' },
  { key: 'PAYROLL', label: 'Payroll', icon: HandCoins, gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)', color: '#ec4899' },
  { key: 'ACCOUNTING', label: 'Accounting', icon: Calculator, gradient: 'linear-gradient(135deg, #14b8a6, #06b6d4)', color: '#14b8a6' },
  { key: 'FINANCE', label: 'Finance', icon: Landmark, gradient: 'linear-gradient(135deg, #a855f7, #6366f1)', color: '#a855f7' },
]

// ── Utility: relative time ─────────────────────────────────────────
function timeAgo(dateStr?: string): string {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMonth = Math.floor(diffDay / 30)
  return `${diffMonth}mo ago`
}

function getToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

// ── Skeleton Components ────────────────────────────────────────────
function StatSkeleton({ cardBg, border }: { cardBg: string; border: string }) {
  return (
    <div
      className="rounded-2xl p-4 min-w-[160px] flex-1 animate-pulse"
      style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-6 w-8 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    </div>
  )
}

function CardSkeleton({ cardBg, border }: { cardBg: string; border: string }) {
  return (
    <div
      className="rounded-2xl p-4 animate-pulse space-y-3"
      style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
    >
      <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="flex justify-between">
        <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-12 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════
export default function WorkflowPipeline() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const pageBg      = isLight ? '#f1f5f9' : '#060B18'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const rowHover    = isLight ? '#f1f5f9' : '#0f1e36'

  // ── State ──────────────────────────────────────────────────────
  const [boardData, setBoardData] = useState<Record<string, TicketResponse[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Modal state
  const [selectedTicket, setSelectedTicket] = useState<TicketResponse | null>(null)
  const [modalStage, setModalStage] = useState<string>('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState(false)

  // Stage-specific form fields
  const [formBranch, setFormBranch] = useState('')
  const [formNegotiator, setFormNegotiator] = useState('')
  const [formCharges, setFormCharges] = useState('')
  const [formPaymentMode, setFormPaymentMode] = useState('CASH')
  const [formRegNumber, setFormRegNumber] = useState('')
  const [formFileName, setFormFileName] = useState('')
  const [formPayrollChecks, setFormPayrollChecks] = useState({ docsComplete: false, chargesVerified: false, warrantyValid: false })
  const [formAdminIncentive, setFormAdminIncentive] = useState('')
  const [formPromoCommission, setFormPromoCommission] = useState('')
  const [formStoreReferral, setFormStoreReferral] = useState('')

  // Branch & negotiator options
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [negotiators, setNegotiators] = useState<{ id: string; name: string }[]>([])

  const boardRef = useRef<HTMLDivElement>(null)

  // ── Fetch board data ──────────────────────────────────────────
  const fetchBoard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch(`${API_BASE_URL}/tickets/workflow/board`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Failed to load workflow board (${res.status})`)
      const data = await res.json()
      // Normalize: API may return { data: ... } wrapper or bare map
      const map: Record<string, TicketResponse[]> = data?.data || data || {}
      setBoardData(map)
    } catch (err: any) {
      setError(err?.message || 'Failed to load workflow data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchBoard() }, [fetchBoard])

  // ── Fetch branch & negotiator lookups ─────────────────────────
  useEffect(() => {
    const load = async () => {
      const token = getToken()
      try {
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const d = await res.json()
          const list = (d?.data || d || []).map((b: any) => ({ id: b.id, name: b.name }))
          setBranches(list)
        }
      } catch { /* ignore */ }
      try {
        const res = await fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const d = await res.json()
          const list = (d?.data || d || []).map((u: any) => ({ id: u.id, name: u.name }))
          setNegotiators(list)
        }
      } catch { /* ignore */ }
    }
    load()
  }, [])

  // ── Computed totals ─────────────────────────────────────────────
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    STAGES.forEach(s => {
      counts[s.key] = (boardData[s.key] || []).length
    })
    return counts
  }, [boardData])

  const totalActive = useMemo(() =>
    Object.values(stageCounts).reduce((sum, c) => sum + c, 0)
  , [stageCounts])

  // ── Scroll to column ──────────────────────────────────────────
  const scrollToColumn = (stageKey: string) => {
    const el = document.getElementById(`col-${stageKey}`)
    if (el && boardRef.current) {
      const containerLeft = boardRef.current.getBoundingClientRect().left
      const elLeft = el.getBoundingClientRect().left
      boardRef.current.scrollBy({ left: elLeft - containerLeft - 16, behavior: 'smooth' })
    }
  }

  // ── Open modal ────────────────────────────────────────────────
  const openModal = (ticket: TicketResponse, stageKey: string) => {
    setSelectedTicket(ticket)
    setModalStage(stageKey)
    setActionError(null)
    setActionSuccess(false)
    // Pre-fill form fields
    setFormBranch(ticket.branchId || '')
    setFormNegotiator(ticket.assignedNegotiatorId || '')
    setFormCharges(ticket.charges?.toString() || '')
    setFormPaymentMode(ticket.paymentMode || 'CASH')
    setFormRegNumber(ticket.warrantyRegistrationNumber || '')
    setFormFileName('')
    setFormPayrollChecks({ docsComplete: false, chargesVerified: false, warrantyValid: false })
    setFormAdminIncentive(ticket.adminIncentive?.toString() || '')
    setFormPromoCommission(ticket.promodiserCommission?.toString() || '')
    setFormStoreReferral(ticket.storeReferralFee?.toString() || '')
  }

  const closeModal = () => {
    setSelectedTicket(null)
    setModalStage('')
    setActionError(null)
    setActionSuccess(false)
  }

  // ── Stage action handler ──────────────────────────────────────
  const handleStageAction = async () => {
    if (!selectedTicket) return
    setActionLoading(true)
    setActionError(null)
    setActionSuccess(false)
    const token = getToken()
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    try {
      const stageIndex = STAGES.findIndex(s => s.key === modalStage)
      const nextStage = stageIndex < STAGES.length - 1 ? STAGES[stageIndex + 1].key : null

      // Stage-specific updates
      if (modalStage === 'DISPATCHER') {
        if (!formBranch) { setActionError('Please select a branch'); setActionLoading(false); return }
        await fetch(`${API_BASE_URL}/tickets/${selectedTicket.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ branchId: formBranch }),
        })
      } else if (modalStage === 'MAIN_BRANCH') {
        if (!formNegotiator) { setActionError('Please select a negotiator'); setActionLoading(false); return }
        await fetch(`${API_BASE_URL}/tickets/${selectedTicket.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ assignedNegotiatorId: formNegotiator }),
        })
      } else if (modalStage === 'NEGOTIATOR') {
        if (!formCharges) { setActionError('Please enter charges'); setActionLoading(false); return }
        await fetch(`${API_BASE_URL}/tickets/${selectedTicket.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ charges: parseFloat(formCharges), paymentMode: formPaymentMode }),
        })
      } else if (modalStage === 'WARRANTY_REGISTRATION') {
        if (!formRegNumber) { setActionError('Please enter registration number'); setActionLoading(false); return }
        await fetch(`${API_BASE_URL}/tickets/${selectedTicket.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ warrantyRegistrationNumber: formRegNumber }),
        })
      } else if (modalStage === 'PAYROLL') {
        if (!formPayrollChecks.docsComplete || !formPayrollChecks.chargesVerified || !formPayrollChecks.warrantyValid) {
          setActionError('Please complete all validation checks')
          setActionLoading(false)
          return
        }
      } else if (modalStage === 'ACCOUNTING') {
        await fetch(`${API_BASE_URL}/tickets/${selectedTicket.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({
            adminIncentive: parseFloat(formAdminIncentive) || 0,
            promodiserCommission: parseFloat(formPromoCommission) || 0,
            storeReferralFee: parseFloat(formStoreReferral) || 0,
          }),
        })
      }

      // Transition to next stage (or finalize)
      if (nextStage) {
        const transRes = await fetch(`${API_BASE_URL}/tickets/workflow/${selectedTicket.id}/transition`, {
          method: 'PUT', headers,
          body: JSON.stringify({ stage: nextStage }),
        })
        if (!transRes.ok) {
          const errBody = await transRes.text()
          throw new Error(errBody || `Transition failed (${transRes.status})`)
        }
      } else {
        // Finance final approval
        const transRes = await fetch(`${API_BASE_URL}/tickets/workflow/${selectedTicket.id}/transition`, {
          method: 'PUT', headers,
          body: JSON.stringify({ stage: 'COMPLETED' }),
        })
        if (!transRes.ok) {
          const errBody = await transRes.text()
          throw new Error(errBody || `Approval failed (${transRes.status})`)
        }
      }

      setActionSuccess(true)
      setTimeout(() => {
        closeModal()
        fetchBoard(true)
      }, 1200)
    } catch (err: any) {
      setActionError(err?.message || 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Action button labels ──────────────────────────────────────
  const getActionLabel = (stageKey: string): string => {
    switch (stageKey) {
      case 'DISPATCHER': return 'Assign to Branch'
      case 'MAIN_BRANCH': return 'Assign Negotiator'
      case 'NEGOTIATOR': return 'Complete & Send to Warranty'
      case 'WARRANTY_REGISTRATION': return 'Register & Send to Payroll'
      case 'PAYROLL': return 'Send to Accounting'
      case 'ACCOUNTING': return 'Request Funding'
      case 'FINANCE': return 'Approve & Release Funds'
      default: return 'Advance'
    }
  }

  // ── CSS keyframes (injected once) ─────────────────────────────
  useEffect(() => {
    const id = 'wf-pipeline-styles'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      @keyframes wf-fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes wf-slide-up { from { opacity: 0; transform: translateY(40px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes wf-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      @keyframes wf-pulse-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.3); } 50% { box-shadow: 0 0 0 6px rgba(16,185,129,0); } }
      @keyframes wf-check-pop { 0% { transform: scale(0); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
      .wf-card-enter { animation: wf-fade-in 0.35s ease-out both; }
      .wf-modal-enter { animation: wf-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both; }
      .wf-board-scroll::-webkit-scrollbar { height: 8px; }
      .wf-board-scroll::-webkit-scrollbar-track { background: transparent; }
      .wf-board-scroll::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.25); border-radius: 99px; }
      .wf-board-scroll::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,0.4); }
      .wf-col-scroll::-webkit-scrollbar { width: 4px; }
      .wf-col-scroll::-webkit-scrollbar-track { background: transparent; }
      .wf-col-scroll::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.2); border-radius: 99px; }
    `
    document.head.appendChild(style)
  }, [])

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col gap-6 min-h-full" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: pageBg }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
            Workflow Pipeline
          </h2>
          <p className="text-sm" style={{ color: textMuted }}>
            {loading ? 'Loading pipeline…' : `${totalActive} active ticket${totalActive !== 1 ? 's' : ''} across ${STAGES.length} stages`}
          </p>
        </div>
        <button
          onClick={() => fetchBoard(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #10B981, #059669)',
            color: '#fff',
            opacity: refreshing ? 0.7 : 1,
            boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Error Banner ─────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-3 p-4 rounded-2xl"
          style={{
            backgroundColor: isLight ? '#fef2f2' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${isLight ? '#fecaca' : '#7f1d1d'}`,
            color: isLight ? '#dc2626' : '#f87171',
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium flex-1">{error}</span>
          <button
            onClick={() => fetchBoard()}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: isLight ? '#fee2e2' : 'rgba(239,68,68,0.15)' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Stats Row ────────────────────────────────────────── */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {loading
          ? Array.from({ length: 7 }).map((_, i) => <StatSkeleton key={i} cardBg={cardBg} border={border} />)
          : STAGES.map((stage, idx) => {
              const Icon = stage.icon
              const count = stageCounts[stage.key] || 0
              return (
                <button
                  key={stage.key}
                  onClick={() => scrollToColumn(stage.key)}
                  className="rounded-2xl p-4 min-w-[160px] flex-1 text-left transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] group wf-card-enter"
                  style={{
                    animationDelay: `${idx * 60}ms`,
                    backgroundColor: cardBg,
                    border: `1px solid ${border}`,
                    boxShadow: isLight
                      ? '0 1px 3px rgba(0,0,0,0.04)'
                      : '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = stage.color
                    ;(e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 1px ${stage.color}33, 0 4px 16px ${stage.color}18`
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = border
                    ;(e.currentTarget as HTMLElement).style.boxShadow = isLight ? '0 1px 3px rgba(0,0,0,0.04)' : '0 1px 3px rgba(0,0,0,0.2)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110"
                      style={{ background: stage.gradient }}
                    >
                      <Icon className="w-5 h-5" style={{ color: '#fff' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: textMuted }}>
                        {stage.label}
                      </p>
                      <p className="text-xl font-black tabular-nums" style={{ color: textPrimary }}>
                        {count}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })
        }
      </div>

      {/* ── Kanban Board ─────────────────────────────────────── */}
      <div
        ref={boardRef}
        className="flex gap-4 overflow-x-auto pb-4 wf-board-scroll flex-1"
        style={{ minHeight: 420 }}
      >
        {STAGES.map((stage, colIdx) => {
          const Icon = stage.icon
          const tickets = boardData[stage.key] || []
          const count = tickets.length
          return (
            <div
              id={`col-${stage.key}`}
              key={stage.key}
              className="flex-shrink-0 flex flex-col rounded-2xl overflow-hidden wf-card-enter"
              style={{
                width: 320,
                animationDelay: `${colIdx * 70}ms`,
                backgroundColor: isLight ? '#f8fafc' : '#080F1E',
                border: `1px solid ${border}`,
              }}
            >
              {/* Column Header */}
              <div
                className="px-4 py-3.5 flex items-center gap-3"
                style={{ background: stage.gradient }}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" style={{ color: 'rgba(255,255,255,0.9)' }} />
                <span className="text-sm font-bold text-white flex-1 truncate">{stage.label}</span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-black tabular-nums"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
                >
                  {count}
                </span>
              </div>

              {/* Card list */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 wf-col-scroll" style={{ maxHeight: 540 }}>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} cardBg={cardBg} border={border} />)
                ) : count === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-50">
                    <Inbox className="w-8 h-8" style={{ color: textMuted }} />
                    <p className="text-xs font-medium" style={{ color: textMuted }}>No tickets</p>
                  </div>
                ) : (
                  tickets.map((ticket, tIdx) => (
                    <button
                      key={ticket.id}
                      onClick={() => openModal(ticket, stage.key)}
                      className="w-full text-left rounded-2xl p-4 transition-all duration-200 group wf-card-enter"
                      style={{
                        animationDelay: `${(colIdx * 70) + (tIdx * 40)}ms`,
                        backgroundColor: cardBg,
                        border: `1px solid ${border}`,
                        boxShadow: isLight
                          ? '0 1px 3px rgba(0,0,0,0.04)'
                          : '0 1px 3px rgba(0,0,0,0.2)',
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLElement
                        el.style.borderColor = stage.color
                        el.style.boxShadow = `0 0 0 1px ${stage.color}22, 0 8px 24px ${stage.color}12`
                        el.style.transform = 'translateY(-2px)'
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLElement
                        el.style.borderColor = border
                        el.style.boxShadow = isLight ? '0 1px 3px rgba(0,0,0,0.04)' : '0 1px 3px rgba(0,0,0,0.2)'
                        el.style.transform = 'translateY(0)'
                      }}
                    >
                      {/* Control Number */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black tracking-wide" style={{ color: stage.color }}>
                          {ticket.controlNumber || ticket.id.slice(0, 8).toUpperCase()}
                        </span>
                        <ChevronRight
                          className="w-3.5 h-3.5 opacity-0 group-hover:opacity-70 transition-opacity shrink-0"
                          style={{ color: textMuted }}
                        />
                      </div>

                      {/* Customer Name */}
                      <p className="text-sm font-bold truncate mb-1" style={{ color: textPrimary }}>
                        {[ticket.firstName, ticket.lastName].filter(Boolean).join(' ') || 'Unknown Customer'}
                      </p>

                      {/* Branch */}
                      {ticket.branchName && (
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <Building2 className="w-3 h-3 shrink-0" style={{ color: textMuted }} />
                          <span className="text-[11px] font-medium truncate" style={{ color: textMuted }}>
                            {ticket.branchName}
                          </span>
                        </div>
                      )}

                      {/* Bottom row */}
                      <div className="flex items-center justify-between">
                        {/* Status Badge */}
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: `${stage.color}18`,
                            color: stage.color,
                          }}
                        >
                          {ticket.status || stage.label}
                        </span>

                        {/* Date */}
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" style={{ color: textMuted }} />
                          <span className="text-[10px] font-medium" style={{ color: textMuted }}>
                            {timeAgo(ticket.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Advance indicator */}
                      <div
                        className="mt-3 pt-2.5 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ borderTop: `1px solid ${border}` }}
                      >
                        <ArrowRight className="w-3 h-3" style={{ color: '#10B981' }} />
                        <span className="text-[10px] font-bold" style={{ color: '#10B981' }}>
                          {getActionLabel(stage.key)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Action Modal ─────────────────────────────────────── */}
      {selectedTicket && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          />

          {/* Modal Card */}
          <div
            className="relative w-full max-w-lg rounded-3xl overflow-hidden wf-modal-enter flex flex-col"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${border}`,
              boxShadow: `0 24px 80px rgba(0,0,0,${isLight ? '0.15' : '0.5'})`,
              maxHeight: '90vh',
            }}
          >
            {/* Modal Header */}
            <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {(() => {
                    const stg = STAGES.find(s => s.key === modalStage)
                    if (!stg) return null
                    const SIcon = stg.icon
                    return (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: stg.gradient }}>
                        <SIcon className="w-4 h-4" style={{ color: '#fff' }} />
                      </div>
                    )
                  })()}
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: STAGES.find(s => s.key === modalStage)?.color || textMuted }}>
                      {STAGES.find(s => s.key === modalStage)?.label} Stage
                    </p>
                    <p className="text-lg font-black truncate" style={{ color: textPrimary }}>
                      {selectedTicket.controlNumber || selectedTicket.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-xl transition-colors shrink-0"
                style={{ color: textMuted, backgroundColor: rowHover }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 flex-1 overflow-y-auto space-y-5">

              {/* Ticket Summary */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Customer', value: [selectedTicket.firstName, selectedTicket.lastName].filter(Boolean).join(' ') || '—' },
                  { label: 'Branch', value: selectedTicket.branchName || '—' },
                  { label: 'Status', value: selectedTicket.status || '—' },
                  { label: 'Created', value: selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                ].map(item => (
                  <div key={item.label} className="rounded-xl p-3" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: textMuted }}>{item.label}</p>
                    <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div className="h-px" style={{ backgroundColor: border }} />

              {/* Stage-specific form */}
              <div className="space-y-3">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: textMuted }}>Action</p>

                {/* DISPATCHER */}
                {modalStage === 'DISPATCHER' && (
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block" style={{ color: textPrimary }}>Assign to Branch</label>
                    <select
                      value={formBranch}
                      onChange={e => setFormBranch(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 transition-all"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                    >
                      <option value="">Select branch…</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}

                {/* MAIN_BRANCH */}
                {modalStage === 'MAIN_BRANCH' && (
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block" style={{ color: textPrimary }}>Assign Negotiator</label>
                    <select
                      value={formNegotiator}
                      onChange={e => setFormNegotiator(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 transition-all"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                    >
                      <option value="">Select negotiator…</option>
                      {negotiators.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  </div>
                )}

                {/* NEGOTIATOR */}
                {modalStage === 'NEGOTIATOR' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block" style={{ color: textPrimary }}>Charges (₱)</label>
                      <input
                        type="number"
                        value={formCharges}
                        onChange={e => setFormCharges(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-2.5 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 transition-all"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block" style={{ color: textPrimary }}>Payment Mode</label>
                      <select
                        value={formPaymentMode}
                        onChange={e => setFormPaymentMode(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 transition-all"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                      >
                        <option value="CASH">Cash</option>
                        <option value="ONLINE">Online Payment</option>
                        <option value="CHECK">Check</option>
                        <option value="INSTALLMENT">Installment</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* WARRANTY_REGISTRATION */}
                {modalStage === 'WARRANTY_REGISTRATION' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block" style={{ color: textPrimary }}>Warranty Registration Number</label>
                      <input
                        type="text"
                        value={formRegNumber}
                        onChange={e => setFormRegNumber(e.target.value)}
                        placeholder="Enter registration number"
                        className="w-full px-4 py-2.5 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 transition-all"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block" style={{ color: textPrimary }}>Upload Document</label>
                      <div
                        className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all hover:opacity-80"
                        style={{ backgroundColor: inputBg, border: `1px dashed ${inputBorder}` }}
                        onClick={() => {
                          setFormFileName('warranty_doc_' + Date.now() + '.pdf')
                        }}
                      >
                        <Upload className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
                        <span className="text-xs font-medium truncate" style={{ color: formFileName ? textPrimary : textMuted }}>
                          {formFileName || 'Click to upload warranty document'}
                        </span>
                        {formFileName && <FileText className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />}
                      </div>
                    </div>
                  </div>
                )}

                {/* PAYROLL */}
                {modalStage === 'PAYROLL' && (
                  <div className="space-y-2">
                    {[
                      { key: 'docsComplete', label: 'All required documents are complete' },
                      { key: 'chargesVerified', label: 'Charges and payment mode verified' },
                      { key: 'warrantyValid', label: 'Warranty registration is valid' },
                    ].map(item => (
                      <label
                        key={item.key}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all"
                        style={{
                          backgroundColor: formPayrollChecks[item.key as keyof typeof formPayrollChecks] ? `${STAGES[4].color}10` : inputBg,
                          border: `1px solid ${formPayrollChecks[item.key as keyof typeof formPayrollChecks] ? STAGES[4].color : inputBorder}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={formPayrollChecks[item.key as keyof typeof formPayrollChecks]}
                          onChange={e => setFormPayrollChecks(prev => ({ ...prev, [item.key]: e.target.checked }))}
                          className="w-4 h-4 rounded accent-[#10B981]"
                        />
                        <span className="text-sm font-medium" style={{ color: textPrimary }}>{item.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* ACCOUNTING */}
                {modalStage === 'ACCOUNTING' && (
                  <div className="space-y-3">
                    {[
                      { label: 'Admin Incentive (₱)', value: formAdminIncentive, setter: setFormAdminIncentive },
                      { label: 'Promodiser Commission (₱)', value: formPromoCommission, setter: setFormPromoCommission },
                      { label: 'Store Referral Fee (₱)', value: formStoreReferral, setter: setFormStoreReferral },
                    ].map(item => (
                      <div key={item.label}>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: textPrimary }}>{item.label}</label>
                        <input
                          type="number"
                          value={item.value}
                          onChange={e => item.setter(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-4 py-2.5 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 transition-all"
                          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* FINANCE */}
                {modalStage === 'FINANCE' && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium" style={{ color: textMuted }}>Funding Summary</p>
                    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${inputBorder}` }}>
                      {[
                        { label: 'Admin Incentive', value: selectedTicket.adminIncentive },
                        { label: 'Promodiser Commission', value: selectedTicket.promodiserCommission },
                        { label: 'Store Referral Fee', value: selectedTicket.storeReferralFee },
                      ].map((row, i) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between px-4 py-3"
                          style={{
                            backgroundColor: i % 2 === 0 ? inputBg : cardBg,
                            borderBottom: i < 2 ? `1px solid ${inputBorder}` : undefined,
                          }}
                        >
                          <span className="text-xs font-medium" style={{ color: textMuted }}>{row.label}</span>
                          <span className="text-sm font-bold tabular-nums" style={{ color: textPrimary }}>
                            ₱{(row.value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                        <span className="text-xs font-bold text-white/80">Total Release</span>
                        <span className="text-sm font-black tabular-nums text-white">
                          ₱{(
                            (selectedTicket.adminIncentive ?? 0) +
                            (selectedTicket.promodiserCommission ?? 0) +
                            (selectedTicket.storeReferralFee ?? 0)
                          ).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Error / Success */}
              {actionError && (
                <div className="flex items-center gap-2 p-3 rounded-xl text-xs font-semibold" style={{ backgroundColor: isLight ? '#fef2f2' : 'rgba(239,68,68,0.1)', color: '#ef4444', border: `1px solid ${isLight ? '#fecaca' : '#7f1d1d'}` }}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-xl text-xs font-semibold" style={{ backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.1)', color: '#10B981', border: `1px solid ${isLight ? '#a7f3d0' : '#065f46'}` }}>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ animation: 'wf-check-pop 0.4s ease-out' }} />
                  Ticket advanced successfully!
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: `1px solid ${border}` }}>
              <button
                onClick={closeModal}
                className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
                style={{ color: textMuted, backgroundColor: rowHover, border: `1px solid ${inputBorder}` }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = border }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = rowHover }}
              >
                Cancel
              </button>
              <button
                onClick={handleStageAction}
                disabled={actionLoading || actionSuccess}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                style={{
                  background: actionSuccess ? '#10B981' : (STAGES.find(s => s.key === modalStage)?.gradient || 'linear-gradient(135deg, #10B981, #059669)'),
                  opacity: (actionLoading || actionSuccess) ? 0.8 : 1,
                  boxShadow: `0 4px 14px ${(STAGES.find(s => s.key === modalStage)?.color || '#10B981')}33`,
                }}
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {actionSuccess ? 'Done ✓' : getActionLabel(modalStage)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
