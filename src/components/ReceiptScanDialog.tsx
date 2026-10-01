import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NumericFormat } from 'react-number-format'
import { AlertTriangle, Camera, Check, Loader2, RefreshCw, Upload, X } from 'lucide-react'
import { API_BASE_URL } from '../utils/api'
import { parseSmartDate } from '../utils/smartDate'
import { uploadReceiptImage } from '../services/supabaseStorage'
import { loadAuditExpenseCategories } from '../utils/auditExpenseCategoryStorage'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'

export type ReceiptDialogMode = 'expense' | 'deposit'

/** Receipt number stamped on an expense recorded without a receipt (the reason is appended to the description). */
export const NO_RECEIPT_NO = 'NO RECEIPT'
export const NO_RECEIPT_SEP = ' — NO RECEIPT: '

/** What the dialog hands back once the person confirms. Dates are normalised with parseSmartDate. */
export interface ReceiptDialogResult {
  receiptImage: string
  receiptDate: string
  company: string
  receiptNo: string
  amount: string
  description: string
  incurredBy: string
  expenseCategory: string
  sourceOfFunds: string
}

interface Props {
  mode: ReceiptDialogMode
  branchName: string
  /** DTR report date (ISO yyyy-mm-dd) — used when the receipt has no readable date. */
  reportDate: string
  /** Existing row values, so re-opening a row edits it instead of starting over. */
  initial?: Partial<ReceiptDialogResult>
  /** Receipt numbers already on this DTR (excluding the row being edited), to warn about duplicates. */
  otherReceiptNos?: string[]
  nameSuggestions?: string[]
  /** Optional hint under the date field. */
  dateNote?: string
  /** Cash that was handed out for this purchase; the receipt amount is compared against it. */
  expectedAmount?: number
  /** Expenses only: let the person record the expense without a receipt photo (a reason is then required). */
  allowNoReceipt?: boolean
  onClose: () => void
  onConfirm: (result: ReceiptDialogResult) => void | Promise<void>
}

interface Fields {
  date: string // ISO yyyy-mm-dd
  company: string
  receiptNo: string
  amount: string
  description: string
  incurredBy: string
  expenseCategory: string
  sourceOfFunds: string
}

const SOURCE_OF_FUNDS = ['CASH', 'BRANCH FUND', 'BRANCH MATERIALS FUND', 'COLLECTION']

/** Same description prefixes the Expense Records scanner applies, so both places read alike. */
function prefixDescription(desc: string, cat: string): string {
  const d = desc.trim()
  if (!d) return d
  const up = d.toUpperCase()
  if (cat === 'INSTALLATION MATERIALS' || cat === 'SERVICE MATERIALS') return up.startsWith('MATERIALS:') ? d : `MATERIALS: ${d}`
  if (cat === 'INCENTIVES') return up.startsWith('INCENTIVES:') ? d : `INCENTIVES: ${d}`
  if (cat === 'MOBILIZATION') {
    if (/GAS|FUEL|DIESEL|PETRON|SHELL|CALTEX/.test(up)) return up.startsWith('GAS:') ? d : `GAS: ${d}`
    if (/TOLL|NLEX|SLEX|SCTEX|CAVITEX|SKYWAY|AUTOSWEEP|EASYTRIP/.test(up)) return up.startsWith('TOLL:') ? d : `TOLL: ${d}`
    if (/PASSWAY|PARKING/.test(up)) return up.startsWith('PASSWAY:') ? d : `PASSWAY: ${d}`
    return up.startsWith('MOBILIZATION:') ? d : `MOBILIZATION: ${d}`
  }
  return d
}

/** "SEPTEMBER 25, 2026" / "2026-09-25" / anything parseSmartDate understands -> yyyy-mm-dd, or '' if unreadable. */
function toIsoDate(raw?: string | null): string {
  if (!raw) return ''
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const normalised = parseSmartDate(s) || s
  const d = new Date(normalised)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function cleanAmount(raw: unknown): string {
  if (raw == null || raw === '') return ''
  const n = parseFloat(String(raw).replace(/,/g, ''))
  return isNaN(n) ? '' : n.toFixed(2)
}

const php = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const label = 'text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400'
const inputBase =
  'w-full px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60'

export default function ReceiptScanDialog({
  mode, branchName, reportDate, initial, otherReceiptNos = [], nameSuggestions = [], dateNote, expectedAmount, allowNoReceipt = false, onClose, onConfirm,
}: Props) {
  const isExpense = mode === 'expense'
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const hasInitial = !!(initial && (initial.receiptImage || initial.amount || initial.description || initial.receiptNo))
  const [phase, setPhase] = useState<'pick' | 'review'>(hasInitial ? 'review' : 'pick')
  const [preview, setPreview] = useState<string>(initial?.receiptImage || '')
  const [imageUrl, setImageUrl] = useState<string>(initial?.receiptImage || '')
  const [uploading, setUploading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanned, setScanned] = useState<Set<keyof Fields>>(new Set())
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [categories, setCategories] = useState<string[]>(AUDIT_EXPENSE_CATEGORIES)
  const [catQuery, setCatQuery] = useState('')

  // Re-opening an expense that was saved without a receipt: split the reason back out of the description.
  const initialNoReceipt = allowNoReceipt && isExpense && initial?.receiptNo === NO_RECEIPT_NO
  const sepAt = initialNoReceipt ? (initial?.description || '').indexOf(NO_RECEIPT_SEP) : -1
  const [noReceipt, setNoReceipt] = useState(initialNoReceipt)
  const [noReceiptReason, setNoReceiptReason] = useState(sepAt >= 0 ? (initial?.description || '').slice(sepAt + NO_RECEIPT_SEP.length) : '')
  const reasonMissing = noReceipt && noReceiptReason.trim().length < 5

  const [f, setF] = useState<Fields>({
    date: toIsoDate(initial?.receiptDate) || reportDate,
    company: initial?.company || '',
    receiptNo: initialNoReceipt ? '' : initial?.receiptNo || '',
    amount: initial?.amount || '',
    description: sepAt >= 0 ? (initial?.description || '').slice(0, sepAt) : initial?.description || '',
    incurredBy: initial?.incurredBy || '',
    expenseCategory: initial?.expenseCategory || 'OTHER',
    sourceOfFunds: initial?.sourceOfFunds || 'CASH',
  })
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF(prev => ({ ...prev, [k]: v }))

  useEffect(() => {
    if (!isExpense) return
    let cancelled = false
    loadAuditExpenseCategories().then(list => {
      if (cancelled || list.length === 0) return
      setCategories(list.map(c => c.name))
    })
    return () => { cancelled = true }
  }, [isExpense])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setScanError('Please choose an image (photo or screenshot) of the receipt.'); return }
    setScanError('')
    setPreview(URL.createObjectURL(file))
    setImageUrl('')
    setPhase('review')
    setUploading(true)
    setScanning(true)

    // Upload and OCR run side by side; the review form is usable as soon as the scan returns.
    uploadReceiptImage(file, {
      folder: isExpense ? 'expenses' : 'deposits',
      branch: branchName,
      filename: isExpense ? 'expense' : 'deposit',
    })
      .then(res => setImageUrl(res.url))
      .catch(err => { console.error('[ReceiptScanDialog] upload failed', err); setScanError('Could not save the photo. Try again.') })
      .finally(() => setUploading(false))

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const body = new FormData()
      body.append('image', file)
      const res = await fetch(`${API_BASE_URL}/v1/receipts/scan`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
      if (!res.ok) throw new Error(`Scan failed (server error ${res.status}). You can fill the details in by hand.`)
      const data = await res.json() as Record<string, unknown>
      if (data.error) throw new Error(`Scan failed: ${data.error}. You can fill the details in by hand.`)

      const filled = new Set<keyof Fields>()
      setF(prev => {
        const next = { ...prev }
        const iso = toIsoDate(data.date ? String(data.date) : '')
        if (iso) { next.date = iso; filled.add('date') }
        if (data.company) { next.company = String(data.company).toUpperCase(); filled.add('company') }
        if (data.receiptNo) { next.receiptNo = String(data.receiptNo); filled.add('receiptNo') }
        const amt = cleanAmount(data.amount)
        if (amt) { next.amount = amt; filled.add('amount') }
        const cat = data.expenseCategory ? String(data.expenseCategory).toUpperCase() : ''
        if (isExpense && cat) { next.expenseCategory = cat; filled.add('expenseCategory') }
        const rawDesc = String(data.description || data.company || '')
        if (rawDesc) { next.description = isExpense ? prefixDescription(rawDesc, cat || next.expenseCategory) : rawDesc; filled.add('description') }
        const by = String(data.incurredBy || data.name || '')
        if (isExpense && by) { next.incurredBy = by.toUpperCase(); filled.add('incurredBy') }
        if (isExpense && data.sourceOfFunds) { next.sourceOfFunds = String(data.sourceOfFunds).toUpperCase(); filled.add('sourceOfFunds') }
        return next
      })
      setScanned(filled)
    } catch (err: any) {
      console.error('[ReceiptScanDialog] scan failed', err)
      setScanError(err?.message || 'Could not scan the receipt. You can fill the details in by hand.')
    } finally {
      setScanning(false)
    }
  }, [branchName, isExpense])

  // Paste a screenshot straight into the pick screen.
  useEffect(() => {
    if (phase !== 'pick') return
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file) void processFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [phase, processFile])

  // Alphabetical; a category read off the receipt that isn't on the list is still shown so it isn't silently lost.
  const sortedCategories = useMemo(() => {
    const names = new Set(categories)
    if (f.expenseCategory) names.add(f.expenseCategory)
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [categories, f.expenseCategory])

  const duplicate = useMemo(() => {
    const no = f.receiptNo.trim().toLowerCase()
    return !!no && otherReceiptNos.some(n => n.trim().toLowerCase() === no)
  }, [f.receiptNo, otherReceiptNos])

  const missing = useMemo(() => {
    const m: (keyof Fields)[] = []
    if (!(parseFloat(f.amount) > 0)) m.push('amount')
    if (!f.description.trim() || (isExpense && f.expenseCategory === 'OTHER' && f.description.trim().length < 10)) m.push('description')
    if (!f.date) m.push('date')
    if (isExpense && !f.incurredBy.trim()) m.push('incurredBy')
    return m
  }, [f, isExpense])

  const fieldBox = (k: keyof Fields) => {
    const isMissing = tried && missing.includes(k)
    if (isMissing) return 'border-red-400 ring-2 ring-red-400/30'
    if (scanned.has(k)) return 'border-emerald-400'
    return 'border-slate-300 dark:border-slate-700'
  }
  const badge = (k: keyof Fields) => scanned.has(k)
    ? <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Scanned</span>
    : null

  const confirm = async () => {
    setTried(true)
    if (missing.length > 0 || uploading || reasonMissing || (!noReceipt && !imageUrl)) return
    if (expectedAmount != null && (parseFloat(f.amount) || 0) - expectedAmount > 0.005 &&
      !window.confirm(`The receipt (${php(parseFloat(f.amount) || 0)}) is higher than the cash given (${php(expectedAmount)}). The extra ${php((parseFloat(f.amount) || 0) - expectedAmount)} was paid out of pocket and must be reimbursed. Save anyway?`)) return
    setSaving(true)
    try {
      await onConfirm({
        receiptImage: noReceipt ? '' : imageUrl,
        receiptDate: parseSmartDate(f.date) || f.date,
        company: f.company.trim().toUpperCase(),
        receiptNo: noReceipt ? NO_RECEIPT_NO : f.receiptNo.trim(),
        amount: parseFloat(f.amount).toFixed(2),
        description: noReceipt ? `${f.description.trim()}${NO_RECEIPT_SEP}${noReceiptReason.trim()}` : f.description.trim(),
        incurredBy: f.incurredBy.trim().toUpperCase(),
        expenseCategory: f.expenseCategory,
        sourceOfFunds: f.sourceOfFunds.trim().toUpperCase(),
      })
    } finally {
      setSaving(false)
    }
  }

  const scannedCount = scanned.size
  const totalScannable = isExpense ? 8 : 5

  return createPortal(
    <div className="fixed inset-0 z-[16000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{isExpense ? 'Scan Expense Receipt' : 'Scan Deposit Slip'}</h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {phase === 'pick'
                ? 'Add a clear photo of the whole receipt'
                : isExpense ? 'Check every detail — this is saved to Expense Records' : 'Check the details before saving'}
            </span>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="p-1.5 rounded-lg text-slate-400 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void processFile(file); e.target.value = '' }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void processFile(file); e.target.value = '' }} />

        {phase === 'pick' ? (
          <div className="p-5 sm:p-8 overflow-y-auto">
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) void processFile(file) }}
              className={`rounded-2xl border-2 border-dashed px-6 py-12 flex flex-col items-center gap-4 text-center transition-colors ${dragOver ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-300 dark:border-slate-700'}`}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                <Camera className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Drop, paste or choose a receipt photo</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Lay it flat, good lighting, all four corners and the total visible.</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={() => cameraRef.current?.click()} className="inline-flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors cursor-pointer">
                  <Camera className="w-4 h-4" /> Take photo
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-bold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer">
                  <Upload className="w-4 h-4" /> Upload image
                </button>
              </div>
              {scanError && <p className="text-xs font-semibold text-red-600">{scanError}</p>}
            </div>
            <div className="flex justify-end mt-5">
              {allowNoReceipt ? (
                <button type="button" onClick={() => { setNoReceipt(true); setPhase('review') }} className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer">
                  No receipt available — record this expense without a photo
                </button>
              ) : (
                <button type="button" onClick={() => setPhase('review')} className="text-xs font-bold text-slate-500 hover:underline cursor-pointer">
                  Skip — enter details without a photo
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5">
              {/* Receipt photo */}
              <div className="flex flex-col gap-2">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 overflow-hidden flex items-center justify-center min-h-[220px] md:min-h-[360px] relative">
                  {preview ? (
                    <a href={preview} target="_blank" rel="noopener noreferrer" title="Open full size" className="block w-full">
                      <img src={preview} alt="Receipt" className="w-full max-h-[440px] object-contain" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">No photo attached</span>
                  )}
                  {(scanning || uploading) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/75 dark:bg-slate-950/75">
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{scanning ? 'Reading receipt…' : 'Saving photo…'}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={scanning || saving} className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50 cursor-pointer">
                    <RefreshCw className="w-3.5 h-3.5" /> {preview ? 'Replace photo & rescan' : 'Add photo & scan'}
                  </button>
                </div>
              </div>

              {/* Details */}
              <div className="flex flex-col gap-3.5">
                {!scanning && scannedCount > 0 && (
                  <div className="rounded-lg px-3 py-2 text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    Read {scannedCount} of {totalScannable} details from the receipt. Please review each one — green ones were scanned.
                  </div>
                )}
                {scanError && (
                  <div className="rounded-lg px-3 py-2 text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> <span>{scanError}</span>
                  </div>
                )}
                {noReceipt && (
                  <div className="rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-2.5 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">No receipt — saved without a photo</span>
                      <button type="button" onClick={() => setNoReceipt(false)} className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">Attach a receipt instead</button>
                    </div>
                    <input type="text" value={noReceiptReason} onChange={e => setNoReceiptReason(e.target.value)}
                      placeholder="Why is there no receipt? (e.g. toll gate, no OR issued)"
                      className={`${inputBase} ${tried && reasonMissing ? 'border-red-400 ring-2 ring-red-400/30' : 'border-amber-400/60'}`} />
                    <span className="text-[10px] text-amber-800/80 dark:text-amber-300/80">It is still added to Expense Records, marked NO RECEIPT with this reason, so the admin can review it.</span>
                  </div>
                )}
                {duplicate && !noReceipt && (
                  <div className="rounded-lg px-3 py-2 text-xs font-semibold bg-red-500/10 text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> <span>Receipt no. {f.receiptNo} is already listed on this DTR. Make sure it isn't a duplicate.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between"><span className={label}>Receipt date <span className="text-red-500">*</span></span>{badge('date')}</div>
                    <input type="date" value={f.date} onChange={e => set('date', e.target.value)} className={`${inputBase} ${fieldBox('date')}`} />
                    {dateNote && <span className="text-[10px] text-slate-500 dark:text-slate-400">{dateNote}</span>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between"><span className={label}>Amount (₱) <span className="text-red-500">*</span></span>{badge('amount')}</div>
                    <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale allowNegative={false} placeholder="0.00" value={f.amount}
                      onValueChange={v => set('amount', v.value)} className={`${inputBase} text-right ${fieldBox('amount')}`} />
                    {expectedAmount != null && (() => {
                      const given = php(expectedAmount)
                      const got = parseFloat(f.amount) || 0
                      const diff = Math.round((got - expectedAmount) * 100) / 100
                      if (!got) return <span className="text-[10px] text-slate-500 dark:text-slate-400">Cash given for this purchase: {given}</span>
                      if (diff === 0) return <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Matches the {given} given.</span>
                      if (diff < 0) return <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">{php(-diff)} less than the {given} given — that {php(-diff)} must be returned as a Cash Return on the DTR.</span>
                      return <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">{php(diff)} more than the {given} given — the extra was paid out of pocket and needs a reimbursement on the DTR.</span>
                    })()}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between"><span className={label}>{isExpense ? 'Company / vendor' : 'Bank'}</span>{badge('company')}</div>
                  <input type="text" value={f.company} onChange={e => set('company', e.target.value)} placeholder={isExpense ? 'e.g. ROTEK TRADING CORPORATION' : 'e.g. BANK OF THE PHILIPPINE ISLANDS'} className={`${inputBase} uppercase ${fieldBox('company')}`} />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between"><span className={label}>Description <span className="text-red-500">*</span></span>{badge('description')}</div>
                  <input type="text" value={f.description} onChange={e => set('description', e.target.value)} placeholder="What was bought / deposited" className={`${inputBase} ${fieldBox('description')}`} />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between"><span className={label}>{isExpense ? 'Receipt / OR no.' : 'Reference no.'}</span>{badge('receiptNo')}</div>
                  <input type="text" value={f.receiptNo} onChange={e => set('receiptNo', e.target.value)} className={`${inputBase} ${duplicate ? 'border-red-400' : fieldBox('receiptNo')}`} />
                </div>

                {isExpense && (
                  <>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between"><span className={label}>Category</span>{badge('expenseCategory')}</div>
                      <input type="text" value={catQuery} onChange={e => setCatQuery(e.target.value)} placeholder="Search category…" className={`${inputBase} !py-1.5 !text-xs`} />
                      <div className={`flex flex-wrap gap-1.5 max-h-28 overflow-y-auto rounded-lg border p-2 ${fieldBox('expenseCategory')}`}>
                        {sortedCategories.filter(c => c.toLowerCase().includes(catQuery.trim().toLowerCase())).map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => set('expenseCategory', c)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${f.expenseCategory === c
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'}`}
                          >
                            {c}
                          </button>
                        ))}
                        {sortedCategories.filter(c => c.toLowerCase().includes(catQuery.trim().toLowerCase())).length === 0 && (
                          <span className="text-[11px] text-slate-500">No match — pick the closest one, or Other.</span>
                        )}
                      </div>
                      {f.expenseCategory === 'OTHER' && (
                        <span className={`text-[11px] font-semibold ${tried && missing.includes('description') ? 'text-red-600' : 'text-amber-600 dark:text-amber-400'}`}>
                          Other needs a clear description (what and why).
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between"><span className={label}>Source of funds</span>{badge('sourceOfFunds')}</div>
                      <input list="receipt-dialog-funds" type="text" value={f.sourceOfFunds} onChange={e => set('sourceOfFunds', e.target.value)} className={`${inputBase} uppercase ${fieldBox('sourceOfFunds')}`} />
                      <datalist id="receipt-dialog-funds">{SOURCE_OF_FUNDS.map(s => <option key={s} value={s} />)}</datalist>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between"><span className={label}>Incurred by <span className="text-red-500">*</span></span>{badge('incurredBy')}</div>
                      <input list="receipt-dialog-names" type="text" value={f.incurredBy} onChange={e => set('incurredBy', e.target.value)} placeholder="Who paid / spent this" className={`${inputBase} uppercase ${fieldBox('incurredBy')}`} />
                      <datalist id="receipt-dialog-names">{nameSuggestions.map(n => <option key={n} value={n} />)}</datalist>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-red-600">
                {tried && missing.length > 0 ? 'Fill in the highlighted fields.' : tried && reasonMissing ? 'Say why there is no receipt.' : tried && !noReceipt && !imageUrl && !uploading ? 'Add a photo of the receipt, or choose No receipt.' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} disabled={saving} className="px-4 h-10 rounded-xl text-sm font-bold text-slate-500 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                  Cancel
                </button>
                <button type="button" onClick={() => void confirm()} disabled={saving || scanning || uploading}
                  className="inline-flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors disabled:opacity-50 cursor-pointer">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {isExpense ? 'Add to expense records' : 'Save deposit'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
