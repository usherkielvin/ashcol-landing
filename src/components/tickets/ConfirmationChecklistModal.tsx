import { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { X, Save, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import type { Ticket } from '../../utils/ticketHelpers'
import { getCustomerDisplayName, getF } from '../../utils/ticketHelpers'
import { API_BASE_URL } from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'

export const CHECKLIST_QUESTIONS: { id: string; num: number; question: string }[] = [
  { id: 'q1', num: 1, question: 'Na-deliver na po ba ang unit?' },
  { id: 'q2', num: 2, question: 'May power supply na po ba sila? May electrician na gagawa ng Electrical Works?' },
  { id: 'q3', num: 3, question: 'Required po ang Earth Grounding sa Installation ng aircon para sa protection. Willing po ba silang bayaran?' },
  { id: 'q4', num: 4, question: 'Under construction or renovation or finish na po ba ang site?' },
  { id: 'q5', num: 5, question: 'Saan po ipapadaan ang piping, sa ceiling or wall po ba or exposed?' },
  { id: 'q6', num: 6, question: 'Mataas po ba paglalagyan ng outdoor? Kailangan po ba ng hagdan na mataas o scaffolding?' },
  { id: 'q7', num: 7, question: 'Yung may-ari po ba ang nasa site para mag-assist? Kung hindi po sino?' },
  { id: 'q8', num: 8, question: 'Saan po ilalagay ang indoor? Sa sala, sa kwarto, o sa kusina?' },
  { id: 'q9', num: 9, question: 'Kung sakaling undersize ang ac unit, willing po ba silang mag upgrade o mag sign na lang mag waiver?' },
  { id: 'q10', num: 10, question: 'Cash po ba ibabayad nila o check?' },
  { id: 'q11', num: 11, question: 'Yung sales invoice nasa site po ba? Kailangan po namin makunan ng picture for Warranty registration.' },
  { id: 'q12', num: 12, question: 'May existing pipe po ba o existing aircon na tatanggalin? Incase po Existing or Old pipe kailangan pong palitan may additional charge po.' },
  { id: 'q13', num: 13, question: 'May iba po bang Service Center na tumawag sa inyo maliban po sa amin?' },
  { id: 'q14', num: 14, question: 'Na-advise po ba kayo regarding sa charges? (Yes or No) After all questions, i-discuss ang total estimated charges.' },
  { id: 'q15', num: 15, question: 'Company po ba ito, Bldg or Residential lang? If bldg, pwede ba gumawa pag weekdays?' },
]

export interface ChecklistItem {
  answer: 'YES' | 'NO' | null
  remarks: string
}

export interface ChecklistData {
  answers: Record<string, ChecklistItem>
  calledBy: string
  checkedBy: string
  completedAt?: string
}

export function parseChecklistData(jsonStr?: any): ChecklistData {
  const defaultAnswers: Record<string, ChecklistItem> = {}
  CHECKLIST_QUESTIONS.forEach(q => {
    defaultAnswers[q.id] = { answer: null, remarks: '' }
  })

  if (!jsonStr) {
    return { answers: defaultAnswers, calledBy: '', checkedBy: '' }
  }

  try {
    const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr
    const answers: Record<string, ChecklistItem> = { ...defaultAnswers }
    if (parsed && parsed.answers && typeof parsed.answers === 'object') {
      Object.keys(parsed.answers).forEach(k => {
        if (answers[k]) {
          const item = parsed.answers[k]
          answers[k] = {
            answer: item?.answer === 'YES' || item?.answer === 'NO' ? item.answer : null,
            remarks: item?.remarks || '',
          }
        }
      })
    }
    return {
      answers,
      calledBy: parsed.calledBy || parsed.called_by || '',
      checkedBy: parsed.checkedBy || parsed.checked_by || '',
      completedAt: parsed.completedAt || parsed.completed_at,
    }
  } catch (e) {
    return { answers: defaultAnswers, calledBy: '', checkedBy: '' }
  }
}

export function isChecklistFilled(jsonStr?: any): boolean {
  if (!jsonStr) return false
  const data = parseChecklistData(jsonStr)
  const answeredCount = Object.values(data.answers).filter(a => a.answer !== null).length
  return answeredCount > 0
}

interface ConfirmationChecklistModalProps {
  ticket: Ticket
  isLight: boolean
  onClose: () => void
  onSaved?: (updatedTicket: Ticket) => void
}

export function ConfirmationChecklistModal({
  ticket,
  isLight,
  onClose,
  onSaved,
}: ConfirmationChecklistModalProps) {
  const { user } = useAuth()
  const rawChecklist = ticket.confirmationChecklist || (ticket as any).confirmation_checklist
  const initialData = parseChecklistData(rawChecklist)
  const [data, setData] = useState<ChecklistData>(initialData)
  const [saving, setSaving] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const raw = ticket.confirmationChecklist || (ticket as any).confirmation_checklist
    setData(parseChecklistData(raw))
  }, [ticket])

  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const headerBg = isLight ? '#f8fafc' : '#1e293b'
  const border = isLight ? '#cbd5e1' : '#334155'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'

  const custName = getCustomerDisplayName(ticket) || ticket.title
  const ticketNo = ticket.ticketNumber || ticket.ticket_number || 'N/A'
  const contactPhone = getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')

  const handleAnswerChange = (qId: string, answer: 'YES' | 'NO') => {
    setData(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [qId]: {
          ...prev.answers[qId],
          answer: prev.answers[qId]?.answer === answer ? null : answer,
        },
      },
    }))
  }

  const handleRemarksChange = (qId: string, remarks: string) => {
    setData(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [qId]: {
          ...prev.answers[qId],
          remarks,
        },
      },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setErrorMessage(null)
    setToastMessage(null)

    const updatedData: ChecklistData = {
      ...data,
      completedAt: new Date().toISOString(),
    }

    // Build "JINKY encoded 15Q form" history note using the logged-in user's first name
    const firstName = (user?.name || '').split(' ')[0].toUpperCase() || 'STAFF'
    const historyNote = `${firstName} encoded 15Q form`

    const payload = {
      confirmationChecklist: JSON.stringify(updatedData),
      remarksUpdate: historyNote,
    }

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Failed to save checklist (${res.status}): ${errText || res.statusText}`)
      }

      const json = await res.json()
      const returnedObj = json?.data || json
      // Construct updated ticket object with confirmationChecklist guaranteed
      const updatedTicket: Ticket = {
        ...ticket,
        ...returnedObj,
        confirmationChecklist: JSON.stringify(updatedData),
        confirmation_checklist: JSON.stringify(updatedData),
      }

      setToastMessage('Checklist saved successfully!')
      if (onSaved) {
        onSaved(updatedTicket)
      }
      setTimeout(() => {
        onClose()
      }, 500)
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving checklist')
    } finally {
      setSaving(false)
    }
  }

  const filledCount = Object.values(data.answers).filter(a => a.answer !== null).length

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-fadeIn"
    >
      <div
        className="w-[96vw] max-w-[1400px] h-[92vh] max-h-[920px] rounded-2xl shadow-2xl flex flex-col overflow-hidden border"
        style={{ backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Header Banner */}
        <div
          className="px-6 py-4 shrink-0 border-b flex items-center justify-between"
          style={{ backgroundColor: headerBg, borderColor: border }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Installation Form
              </span>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-400">
                {filledCount} of 15 Answered
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black uppercase tracking-wide" style={{ color: textPrimary }}>
              ASHCOL INSTALLATION – CONFIRMATION CHECKLIST
            </h2>
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              <span>Client: <strong className="font-extrabold uppercase text-sm" style={{ color: textPrimary }}>{custName}</strong></span>
              <span>•</span>
              <span>Ticket #: <strong className="font-extrabold text-sm" style={{ color: textPrimary }}>{ticketNo}</strong></span>
              {contactPhone && (
                <>
                  <span>•</span>
                  <span>Contact #: <strong className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400">{contactPhone}</strong></span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl border transition-colors hover:bg-slate-500/10"
            style={{ borderColor: border, backgroundColor: cardBg, color: textMuted }}
            aria-label="Close form"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Questions Form */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-5">
          {toastMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm font-bold flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm font-bold flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border shadow-sm" style={{ borderColor: border }}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-400" style={{ backgroundColor: headerBg, borderColor: border }}>
                  <th className="py-4 px-4 w-12 text-center">#</th>
                  <th className="py-4 px-5 min-w-[420px]">Question</th>
                  <th className="py-4 px-4 w-44 text-center">Answer</th>
                  <th className="py-4 px-5 min-w-[320px]">Remarks / Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: border }}>
                {CHECKLIST_QUESTIONS.map(q => {
                  const current = data.answers[q.id] || { answer: null, remarks: '' }
                  const isYes = current.answer === 'YES'
                  const isNo = current.answer === 'NO'

                  return (
                    <tr
                      key={q.id}
                      className="transition-colors hover:bg-slate-500/5"
                      style={{
                        backgroundColor: isYes
                          ? (isLight ? 'rgba(16,185,129,0.04)' : 'rgba(16,185,129,0.08)')
                          : isNo
                          ? (isLight ? 'rgba(239,68,68,0.04)' : 'rgba(239,68,68,0.08)')
                          : undefined,
                      }}
                    >
                      <td className="py-4 px-4 text-center font-extrabold text-sm text-slate-400 dark:text-slate-500">
                        {q.num}
                      </td>
                      <td className="py-4 px-5 text-sm font-bold leading-relaxed" style={{ color: textPrimary }}>
                        {q.question}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex items-center gap-2 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => handleAnswerChange(q.id, 'YES')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                              isYes
                                ? 'bg-emerald-600 text-white shadow-md scale-105'
                                : 'text-slate-600 dark:text-slate-400 hover:text-emerald-500'
                            }`}
                          >
                            YES
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAnswerChange(q.id, 'NO')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                              isNo
                                ? 'bg-rose-600 text-white shadow-md scale-105'
                                : 'text-slate-600 dark:text-slate-400 hover:text-rose-500'
                            }`}
                          >
                            NO
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <input
                          type="text"
                          value={current.remarks}
                          onChange={e => handleRemarksChange(q.id, e.target.value)}
                          placeholder="Type notes / details here..."
                          className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold border focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                          style={{
                            backgroundColor: inputBg,
                            borderColor: border,
                            color: textPrimary,
                          }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Caller / Checker metadata fields */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-5 rounded-2xl border mt-5"
            style={{ backgroundColor: headerBg, borderColor: border }}
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">
                Called By:
              </label>
              <input
                type="text"
                value={data.calledBy}
                onChange={e => setData(prev => ({ ...prev, calledBy: e.target.value }))}
                placeholder="Enter caller name / staff..."
                className="w-full px-4 py-2.5 rounded-xl text-sm font-bold border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                style={{
                  backgroundColor: inputBg,
                  borderColor: border,
                  color: textPrimary,
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">
                Checked By:
              </label>
              <input
                type="text"
                value={data.checkedBy}
                onChange={e => setData(prev => ({ ...prev, checkedBy: e.target.value }))}
                placeholder="Enter checker / supervisor name..."
                className="w-full px-4 py-2.5 rounded-xl text-sm font-bold border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                style={{
                  backgroundColor: inputBg,
                  borderColor: border,
                  color: textPrimary,
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className="px-6 py-4 shrink-0 border-t flex items-center justify-between"
          style={{ backgroundColor: headerBg, borderColor: border }}
        >
          <div className="text-xs text-slate-400 dark:text-slate-400 font-semibold">
            {data.completedAt ? (
              <span>Last saved: {new Date(data.completedAt).toLocaleString()}</span>
            ) : (
              <span>Unsaved changes</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-colors hover:bg-slate-500/10"
              style={{ borderColor: border, color: textMuted }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 shadow-lg shadow-emerald-600/25 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Form</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
