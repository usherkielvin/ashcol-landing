import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, FileDown, X, Info } from 'lucide-react'
import {
  exportPayoutSheetPdf, formatPhoneNumber, sheetBranchTitle, sheetDate, sheetPeso, splitMemberName,
  type PayoutSheetEntry,
} from '../utils/payoutSheetPdf'

/** What the Payouts roster knows about one installer for the selected week. */
export interface PayoutSheetSource {
  /** Resolved member-account full name (the roster's grouping key). */
  name: string
  /** Same figure as the roster's Payout Amount (gross − deductions). */
  net: number
  /** Roster "Payout Status" is Complete for every row of this installer. */
  complete: boolean
  /** Phone on the member account — used as the G-Cash number until a payout account field exists. */
  phone: string
  /** False when the name could not be matched to a member account. */
  hasAccount: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
  isLight: boolean
  branchLabel: string
  weekFrom: string
  weekTo: string
  weekClosed: boolean
  sources: PayoutSheetSource[]
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default function InstallerPayoutSheet({ isOpen, onClose, isLight, branchLabel, weekFrom, weekTo, weekClosed, sources }: Props) {
  const [includePending, setIncludePending] = useState(false)
  // Per-installer edits made on the preview (name split / account) — one-off, not saved anywhere.
  const [edits, setEdits] = useState<Record<string, Partial<Pick<PayoutSheetEntry, 'lastName' | 'firstName' | 'account'>>>>({})

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const shown = useMemo(() => sources.filter(s => s.hasAccount && (includePending || s.complete)), [sources, includePending])
  const unmatched = useMemo(() => sources.filter(s => !s.hasAccount && (includePending || s.complete)), [sources, includePending])
  const pendingCount = sources.filter(s => s.hasAccount && !s.complete).length

  const entries: PayoutSheetEntry[] = useMemo(() => shown
    .map(s => {
      const split = splitMemberName(s.name)
      const e = edits[s.name] || {}
      return {
        key: s.name,
        lastName: e.lastName ?? split.lastName,
        firstName: e.firstName ?? split.firstName,
        net: s.net,
        account: e.account ?? formatPhoneNumber(s.phone),
        accountLabel: 'GCASH ACCOUNT',
      }
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)), [shown, edits])

  if (!isOpen) return null

  const total = entries.reduce((s, e) => s + e.net, 0)
  const data = { branchLabel, weekFrom, weekTo, isFinal: weekClosed, entries }
  const fileName = `Payout_Sheet_${branchLabel.replace(/[^A-Za-z0-9]+/g, '_')}_${weekFrom}_${weekTo}.pdf`

  const printSheet = () => {
    const rowsHtml = entries.map((e, i) => `<tr class="row">
      <td class="c n">${i + 1}</td><td class="c">${esc(e.lastName)}</td><td class="c">${esc(e.firstName)}</td>
      <td class="c b">${esc(sheetPeso(e.net))}</td>
      <td class="c">${e.account ? `${esc(e.account)}<br/>(${e.accountLabel})` : '-'}</td><td class="sig"></td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Payout Sheet ${esc(branchLabel)}</title>
      <style>
        @page { size: A4 portrait; margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #1e293b; padding: 6px 8px; font-size: 12px; }
        .h1 { color: #15803d; font-weight: 700; font-size: 14px; text-align: center; }
        .h2 { background: #dcfce7; font-weight: 700; font-size: 13px; text-align: center; }
        .h3 { background: #f0fdf4; font-size: 12px; text-align: center; }
        th { background: #dcfce7; font-weight: 700; text-align: center; }
        .c { text-align: center; } .b { font-weight: 700; } .n { width: 28px; }
        .sig { width: 150px; } tr.row td { height: 46px; }
        tfoot td { background: #dcfce7; font-weight: 700; text-align: center; }
        tr { page-break-inside: avoid; }
      </style></head><body>
      <table>
        <thead>
        <tr><td colspan="6" class="h1">ASHCOL AIRCONDITIONING CORP</td></tr>
        <tr><td colspan="6" class="h2">${esc(sheetBranchTitle(branchLabel))}</td></tr>
        <tr><td colspan="6" class="h3">CUT-OFF DATE: ${esc(sheetDate(weekFrom))} - ${esc(sheetDate(weekTo))}</td></tr>
        <tr><td colspan="6" class="h3">PAYROLL DATE: ${esc(sheetDate(weekTo, 2))}${weekClosed ? ' &nbsp;|&nbsp; FINAL' : ''}</td></tr>
        <tr><th></th><th>LAST NAME</th><th>FIRST NAME</th><th>NET LABOR<br/>COST</th><th>G-CASH/BANK<br/>ACCOUNT</th><th>SIGNATURE</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr><td colspan="3">TOTAL</td><td>${esc(sheetPeso(total))}</td><td colspan="2"></td></tr></tfoot>
      </table>
      <script>window.onload = function () { window.focus(); window.print(); }</script>
      </body></html>`
    const w = window.open('', '_blank', 'width=900,height=1100')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  const bg = isLight ? '#ffffff' : '#0B132B'
  const border = isLight ? '#e2e8f0' : '#1e293b'
  const text = isLight ? '#0f172a' : '#E2E8F0'
  const muted = isLight ? '#64748b' : '#94a3b8'
  const cell: React.CSSProperties = { border: '1px solid #1e293b', padding: '8px 10px', textAlign: 'center', fontSize: 13, color: '#0f172a' }
  const inputStyle: React.CSSProperties = { width: '100%', textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', font: 'inherit', color: 'inherit', textTransform: 'uppercase' }

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-3xl max-h-[94dvh] flex flex-col rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: bg, border: `1px solid ${border}` }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="min-w-0">
            <div className="text-sm font-black uppercase tracking-wide" style={{ color: text }}>Payout Sheet</div>
            <div className="text-[11px] font-semibold" style={{ color: muted }}>{entries.length} installer{entries.length === 1 ? '' : 's'} · {sheetDate(weekFrom)} – {sheetDate(weekTo)}</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={printSheet} disabled={entries.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer disabled:opacity-50"
              style={{ color: text, borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0F1A2E' }}>
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button type="button" onClick={() => exportPayoutSheetPdf(data, fileName)} disabled={entries.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-white cursor-pointer disabled:opacity-50"
              style={{ background: '#10B981' }}>
              <FileDown className="w-3.5 h-3.5" /> Save PDF
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-full border cursor-pointer" style={{ color: muted, borderColor: border }} aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-2.5 text-[11px] font-semibold shrink-0" style={{ color: muted, borderBottom: `1px solid ${border}` }}>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={includePending} onChange={e => setIncludePending(e.target.checked)} />
            Also include installers whose payout is not Complete yet{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </label>
          <span className="flex items-center gap-1"><Info className="w-3 h-3" /> Names and numbers are editable here for this print only. The account column uses the member's phone as G-Cash.</span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-5" style={{ backgroundColor: isLight ? '#f1f5f9' : '#060d1c' }}>
          <div style={{ backgroundColor: '#ffffff', padding: 16, maxWidth: 720, margin: '0 auto', boxShadow: '0 1px 8px rgba(15,23,42,0.18)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td colSpan={6} style={{ ...cell, color: '#15803d', fontWeight: 700, fontSize: 15 }}>ASHCOL AIRCONDITIONING CORP</td></tr>
                <tr><td colSpan={6} style={{ ...cell, background: '#dcfce7', fontWeight: 700 }}>{sheetBranchTitle(branchLabel)}</td></tr>
                <tr><td colSpan={6} style={{ ...cell, background: '#f0fdf4' }}>CUT-OFF DATE: {sheetDate(weekFrom)} - {sheetDate(weekTo)}</td></tr>
                <tr><td colSpan={6} style={{ ...cell, background: '#f0fdf4' }}>PAYROLL DATE: {sheetDate(weekTo, 2)}{weekClosed ? '  |  FINAL' : ''}</td></tr>
                <tr style={{ background: '#dcfce7', fontWeight: 700 }}>
                  <td style={{ ...cell, width: 34 }} />
                  <td style={cell}>LAST NAME</td><td style={cell}>FIRST NAME</td>
                  <td style={cell}>NET LABOR<br />COST</td><td style={cell}>G-CASH/BANK<br />ACCOUNT</td><td style={{ ...cell, width: 150 }}>SIGNATURE</td>
                </tr>
                {entries.length === 0 && (
                  <tr><td colSpan={6} style={{ ...cell, padding: 28, color: '#64748b' }}>No completed payouts for this week yet.</td></tr>
                )}
                {entries.map((e, i) => (
                  <tr key={e.key} style={{ height: 48 }}>
                    <td style={cell}>{i + 1}</td>
                    <td style={cell}><input style={inputStyle} value={e.lastName} onChange={ev => setEdits(p => ({ ...p, [e.key]: { ...p[e.key], lastName: ev.target.value } }))} /></td>
                    <td style={cell}><input style={inputStyle} value={e.firstName} onChange={ev => setEdits(p => ({ ...p, [e.key]: { ...p[e.key], firstName: ev.target.value } }))} /></td>
                    <td style={{ ...cell, fontWeight: 700, color: e.net < 0 ? '#dc2626' : '#0f172a' }}>{sheetPeso(e.net).replace('PHP ', '₱')}</td>
                    <td style={cell}>
                      <input style={inputStyle} value={e.account} placeholder="No number on file" onChange={ev => setEdits(p => ({ ...p, [e.key]: { ...p[e.key], account: ev.target.value } }))} />
                      {e.account && <div style={{ fontSize: 11 }}>({e.accountLabel})</div>}
                    </td>
                    <td style={cell} />
                  </tr>
                ))}
                <tr style={{ background: '#dcfce7', fontWeight: 700 }}>
                  <td colSpan={3} style={cell}>TOTAL</td>
                  <td style={cell}>{sheetPeso(total).replace('PHP ', '₱')}</td>
                  <td colSpan={2} style={cell} />
                </tr>
              </tbody>
            </table>
            {unmatched.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#b45309' }}>
                Not listed — no matching member account: <b>{unmatched.map(u => u.name).join(', ')}</b>. Create or fix the account under Members so they appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
