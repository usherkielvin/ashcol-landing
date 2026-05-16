import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Receipt, Building2, Plus, Trash2, Pencil, FileSpreadsheet, Search, X, Camera, Loader2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import type { AuditExpense, AuditExpenseCategory } from '../types/auditExpense'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'
import { formatTodayReceiptDate } from '../utils/auditExpenseDates'
import { bulkImportAuditExpenses, createExpenseId, deleteAuditExpense, loadAuditExpenses, upsertAuditExpense } from '../utils/auditExpenseStorage'
import { parseAuditExpenseExcelFile } from '../utils/parseAuditExpenseExcel'
import { parseSmartDate } from '../utils/smartDate'
import AutoSuggestInput from '../components/AutoSuggestInput'

interface BranchOption { id: string; name: string }
const peso = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const emptyForm = () => ({ date: formatTodayReceiptDate(), company: '', description: '', receiptNo: '', amount: '', expenseCategory: 'OTHER' as AuditExpenseCategory, sourceOfFunds: '', incurredBy: '' })

export default function AuditFinanceExpenses() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const isLight = theme === 'light'
  const bg = isLight ? '#f0f4f8' : '#060D1A'
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const accent = '#10B981'
  const danger = '#EF4444'

  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const canAccess = isAdmin || isManager

  const [branches, setBranches] = useState<BranchOption[]>([])
  const [branchId, setBranchId] = useState('')
  const [expenses, setExpenses] = useState<AuditExpense[]>([])
  const [importing, setImporting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AuditExpense | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [dateRaw, setDateRaw] = useState(formatTodayReceiptDate())
  const [dateError, setDateError] = useState('')
  const [search, setSearch] = useState('')
  const [viewAll, setViewAll] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set())
  const scanRef = useRef<HTMLInputElement>(null)

  const branchName = branches.find((b) => b.id === branchId)?.name ?? ''

  // Suggestions derived from past expenses
  const suggestions = useMemo(() => {
    const companies = [...new Set(expenses.map((e) => e.company).filter(Boolean))].sort()
    const descs = [...new Set(expenses.map((e) => e.description).filter(Boolean))].sort()
    const people = [...new Set(expenses.map((e) => e.incurredBy).filter(Boolean))].sort()
    const sources = [...new Set(expenses.map((e) => e.sourceOfFunds).filter(Boolean))].sort()
    return { companies, descs, people, sources }
  }, [expenses])

  const loadBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list: BranchOption[] = (data?.data || data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))
      setBranches(list)
      if (isManager && user?.branchId) setBranchId(user.branchId)
      else if (list.length > 0) setBranchId(list[0].id)
    } catch (e) { console.error(e) }
  }, [isManager, user?.branchId])

  const reload = useCallback(() => setExpenses(loadAuditExpenses()), [])

  useEffect(() => { if (canAccess) void loadBranches() }, [canAccess, loadBranches])
  useEffect(() => { reload() }, [reload])

  const branchExpenses = useMemo(() =>
    expenses.filter((e) => e.branchId === branchId), [expenses, branchId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = branchExpenses
    if (!q) return rows
    return rows.filter((e) =>
      e.company.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.receiptNo.toLowerCase().includes(q) ||
      e.incurredBy.toLowerCase().includes(q) ||
      e.date.toLowerCase().includes(q)
    )
  }, [branchExpenses, search])

  // Group by date for daily view
  const byDate = useMemo(() => {
    const map: Record<string, AuditExpense[]> = {}
    for (const e of filtered) {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0)

  const handleDateBlur = (raw: string) => {
    const parsed = parseSmartDate(raw)
    if (parsed) { setDateRaw(parsed); setForm((f) => ({ ...f, date: parsed })); setDateError('') }
    else if (raw.trim()) setDateError('Cannot parse date. Try: May 16, 16-May-26, 2026-05-16')
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !branchId) { e.target.value = ''; return }
    if (!window.confirm(`Import "${file.name}" for ${branchName}?\n\nNew rows will be added.`)) { e.target.value = ''; return }
    setImporting(true)
    try {
      const result = await parseAuditExpenseExcelFile(file, { branchId, branchName, monthKey: '', filterToMonth: false })
      if (result.imported.length === 0) {
        alert(result.errors.length > 0 ? `No rows imported.\n${result.errors.slice(0, 5).join('\n')}` : `No rows imported (${result.skipped} skipped).`)
        return
      }
      bulkImportAuditExpenses(result.imported, { branchId, monthKey: '', replaceExisting: false })
      reload()
      alert(`Imported ${result.imported.length} receipt(s).` + (result.skipped > 0 ? ` Skipped ${result.skipped}.` : ''))
    } catch { alert('Failed to read Excel file.') }
    finally { setImporting(false); e.target.value = '' }
  }

  const submitReceipt = () => {
    if (!branchId) return
    const amount = parseFloat(form.amount.replace(/,/g, ''))
    if (!form.company.trim() && !form.description.trim()) { alert('Enter company or description.'); return }
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return }
    if (!form.date.trim()) { alert('Enter a valid date.'); return }
    const now = new Date().toISOString()
    const expense: AuditExpense = editing
      ? { ...editing, date: form.date.trim(), company: form.company.trim(), description: form.description.trim(), receiptNo: form.receiptNo.trim(), amount, expenseCategory: form.expenseCategory, sourceOfFunds: form.sourceOfFunds.trim(), updatedAt: now }
      : { id: createExpenseId(), branchId, branchName, date: form.date.trim(), incurredBy: (form.incurredBy.trim() || user?.name || 'STAFF').toUpperCase(), company: form.company.trim(), description: form.description.trim(), receiptNo: form.receiptNo.trim(), amount, expenseCategory: form.expenseCategory, sourceOfFunds: form.sourceOfFunds.trim(), createdAt: now, updatedAt: now }
    upsertAuditExpense(expense)
    reload()
    setShowForm(false); setEditing(null); setForm(emptyForm()); setDateRaw(formatTodayReceiptDate()); setDateError('')
  }

  const startEdit = (row: AuditExpense) => {
    setEditing(row); setDateRaw(row.date); setDateError(''); setScanPreview(null)
    setForm({ date: row.date, company: row.company, description: row.description, receiptNo: row.receiptNo, amount: String(row.amount), expenseCategory: row.expenseCategory, sourceOfFunds: row.sourceOfFunds, incurredBy: row.incurredBy })
    setShowForm(true)
  }

  const handleScanImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setScanPreview(url)
    setScanning(true)
    setScannedFields(new Set())
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`${API_BASE_URL}/v1/receipts/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json() as Record<string, unknown>
      if (data.error) { alert(`Scan failed: ${data.error}`); return }

      const scannedDate = data.date ? String(data.date) : ''
      const parsed = scannedDate ? (parseSmartDate(scannedDate) ?? scannedDate) : ''
      const filled = new Set<string>()

      setForm((f) => {
        const next = { ...f }
        if (parsed)                          { next.date = parsed;                              filled.add('date') }
        if (data.company)                    { next.company = String(data.company);             filled.add('company') }
        if (data.description)                { next.description = String(data.description);     filled.add('description') }
        if (data.receiptNo)                  { next.receiptNo = String(data.receiptNo);         filled.add('receiptNo') }
        if (data.amount != null && data.amount !== '') { next.amount = String(data.amount);     filled.add('amount') }
        if (data.expenseCategory)            { next.expenseCategory = data.expenseCategory as AuditExpenseCategory; filled.add('expenseCategory') }
        if (data.sourceOfFunds)              { next.sourceOfFunds = String(data.sourceOfFunds); filled.add('sourceOfFunds') }
        if (data.incurredBy)                 { next.incurredBy = String(data.incurredBy);       filled.add('incurredBy') }
        return next
      })
      if (parsed) { setDateRaw(parsed); setDateError('') }
      setScannedFields(filled)
    } catch (err) {
      console.error('[ReceiptScan]', err)
      alert('Could not scan receipt. Make sure the backend is running.')
    } finally {
      setScanning(false)
      e.target.value = ''
    }
  }

  // Clear the "scanned" highlight when user manually edits a field
  const clearScanned = (field: string) =>
    setScannedFields((prev) => { const next = new Set(prev); next.delete(field); return next })

  // Highlight style for scanned fields (amber = please review)
  const scanBorder = '#F59E0B'
  const scannedStyle = (field: string): React.CSSProperties =>
    scannedFields.has(field)
      ? { borderColor: scanBorder, boxShadow: `0 0 0 2px ${scanBorder}33` }
      : {}

  const field = (label: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: textMuted }}>{label}</label>
      {children}
    </div>
  )

  const inp = (style?: React.CSSProperties) => ({
    className: 'w-full rounded-lg px-3 py-2 text-sm outline-none',
    style: { backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...style },
  })

  if (!canAccess) return <div className="p-8 text-center" style={{ color: textMuted }}>Audit finance expenses are available for managers and admins only.</div>

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg }} className="flex flex-col gap-4 p-4 md:p-6 pb-12">

      {/* ── HEADER ── */}
      <div className="rounded-2xl p-5 md:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="rounded-xl p-2" style={{ backgroundColor: `${accent}22` }}><Receipt size={20} style={{ color: accent }} /></div>
            <h1 className="text-xl md:text-2xl font-bold" style={{ color: textPrimary }}>Receipt Monitor</h1>
          </div>
          <p className="text-sm" style={{ color: textMuted }}>Encode and track daily branch receipts. Import from Excel or add manually.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (showForm) {
                setShowForm(false); setEditing(null)
              } else {
                setEditing(null); setForm(emptyForm()); setDateRaw(formatTodayReceiptDate()); setDateError(''); setShowForm(true)
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow transition-all duration-200"
            style={{ backgroundColor: showForm ? '#EF4444' : accent, minWidth: 140, justifyContent: 'center' }}
          >
            {showForm
              ? <><X size={16} /> Close Form</>
              : <><Plus size={16} /> Add Receipt</>
            }
          </button>
          <button type="button" disabled={!branchId || importing} onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
            <Upload size={16} />{importing ? 'Importing…' : 'Import Excel'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="rounded-2xl p-4 flex flex-col md:flex-row flex-wrap gap-3 items-stretch md:items-end"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <label className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1" style={{ color: textMuted }}><Building2 size={13} /> Branch</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={isManager && !!user?.branchId}
            className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
            {branches.length === 0 ? <option value="">Loading…</option> : null}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 max-w-md">
          <label className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1" style={{ color: textMuted }}><Search size={13} /> Search</label>
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company, description, date, receipt no…"
              className="w-full rounded-lg px-3 py-2 text-sm pl-9" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: textMuted }} />
          </div>
        </div>
        {/* Summary pill */}
        {branchId && (
          <div className="rounded-xl px-4 py-2 flex flex-col items-center justify-center" style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}44` }}>
            <span className="text-xs font-semibold" style={{ color: accent }}>{filtered.length} receipts</span>
            <span className="text-base font-bold" style={{ color: accent }}>₱{peso(totalFiltered)}</span>
          </div>
        )}
      </div>

      {/* ── ENTRY FORM ── */}
      {showForm && (
        <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${accent}55`, boxShadow: `0 0 0 2px ${accent}22` }}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2" style={{ color: textPrimary }}>
              <div className="rounded-lg p-1.5" style={{ backgroundColor: `${accent}22` }}><Receipt size={16} style={{ color: accent }} /></div>
              {editing ? 'Edit Receipt' : 'New Receipt'}
            </h2>
            <div className="flex items-center gap-2">
              {/* Scan receipt image button */}
              <button
                type="button"
                disabled={scanning}
                onClick={() => scanRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ backgroundColor: scanning ? `${accent}11` : `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
                title="Upload a photo of the receipt to auto-fill fields"
              >
                {scanning
                  ? <><Loader2 size={13} className="animate-spin" /> Scanning…</>
                  : <><Camera size={13} /> Scan Receipt</>
                }
              </button>
              <input ref={scanRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanImage} />
              <button onClick={() => { setShowForm(false); setEditing(null); setScanPreview(null) }} style={{ color: textMuted }}><X size={18} /></button>
            </div>
          </div>

          {/* Image preview + scan overlay */}
          {scanPreview && (
            <div className="flex gap-4 items-start p-3 rounded-xl" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={scanPreview} alt="Receipt preview" style={{ width: 100, height: 130, objectFit: 'cover', borderRadius: 8, border: `1px solid ${border}` }} />
                {scanning && (
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={24} className="animate-spin" style={{ color: accent }} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => { setScanPreview(null); setScannedFields(new Set()) }} className="text-xs mt-2" style={{ color: textMuted }}>× Clear</button>
              </div>
            )}

            {/* Form grid */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Date */}
              {field(
                <span className="flex items-center gap-1">
                  Date {scannedFields.has('date') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}
                </span> as unknown as string,
                <div>
                  <input value={dateRaw}
                    onChange={(e) => { setDateRaw(e.target.value); setDateError(''); clearScanned('date') }}
                    onBlur={(e) => handleDateBlur(e.target.value)}
                    placeholder="May 16, 16 May, 16-May-26"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('date') }} />
                  {dateError
                    ? <p className="text-xs mt-1" style={{ color: danger }}>{dateError}</p>
                    : form.date ? <p className="text-xs mt-1" style={{ color: accent }}>✓ {form.date}</p> : null}
                </div>
              )}

              {/* Incurred By */}
              {field(
                <span className="flex items-center gap-1">Incurred By {scannedFields.has('incurredBy') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <AutoSuggestInput value={form.incurredBy}
                  onChange={(v) => { setForm((f) => ({ ...f, incurredBy: v })); clearScanned('incurredBy') }}
                  suggestions={suggestions.people} placeholder="Who incurred this?"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputBorder={scannedFields.has('incurredBy') ? scanBorder : inputBorder} />
              )}

              {/* Description */}
              {field(
                <span className="flex items-center gap-1">Description {scannedFields.has('description') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <AutoSuggestInput value={form.description}
                  onChange={(v) => { setForm((f) => ({ ...f, description: v })); clearScanned('description') }}
                  suggestions={suggestions.descs} placeholder="What was purchased?"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputBorder={scannedFields.has('description') ? scanBorder : inputBorder} />
              )}

              {/* Company */}
              {field(
                <span className="flex items-center gap-1">Company / Vendor {scannedFields.has('company') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <AutoSuggestInput value={form.company}
                  onChange={(v) => { setForm((f) => ({ ...f, company: v })); clearScanned('company') }}
                  suggestions={suggestions.companies} placeholder="Store or vendor name"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputBorder={scannedFields.has('company') ? scanBorder : inputBorder} />
              )}

              {/* Receipt No */}
              {field(
                <span className="flex items-center gap-1">Receipt No. {scannedFields.has('receiptNo') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <input value={form.receiptNo}
                  onChange={(e) => { setForm((f) => ({ ...f, receiptNo: e.target.value })); clearScanned('receiptNo') }}
                  placeholder="OR / SI number"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('receiptNo') }} />
              )}

              {/* Amount */}
              {field(
                <span className="flex items-center gap-1">Amount (₱) {scannedFields.has('amount') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <input type="number" value={form.amount}
                  onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); clearScanned('amount') }}
                  placeholder="0.00"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('amount') }} />
              )}

              {/* Source of Funds */}
              {field(
                <span className="flex items-center gap-1">Source of Funds {scannedFields.has('sourceOfFunds') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <AutoSuggestInput value={form.sourceOfFunds}
                  onChange={(v) => { setForm((f) => ({ ...f, sourceOfFunds: v })); clearScanned('sourceOfFunds') }}
                  suggestions={suggestions.sources} placeholder="Petty cash, reimbursement…"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputBorder={scannedFields.has('sourceOfFunds') ? scanBorder : inputBorder} />
              )}
            </div>
          </div>

          {/* Category chips */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: textMuted }}>Expense Category</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {AUDIT_EXPENSE_CATEGORIES.map((cat) => (
                <button key={cat} type="button" onClick={() => setForm((f) => ({ ...f, expenseCategory: cat }))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ border: `1px solid ${form.expenseCategory === cat ? accent : inputBorder}`, backgroundColor: form.expenseCategory === cat ? `${accent}22` : inputBg, color: form.expenseCategory === cat ? accent : textMuted }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 text-sm rounded-lg" style={{ color: textMuted, backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>Cancel</button>
            <button type="button" onClick={submitReceipt} className="px-5 py-2 rounded-xl text-sm font-semibold text-white shadow" style={{ backgroundColor: accent }}>
              {editing ? 'Update Receipt' : 'Save Receipt'}
            </button>
          </div>
        </div>
      )}

      {/* ── RECEIPT TABLE / DAILY LOG ── */}
      {branchId && (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
            <h2 className="font-bold" style={{ color: textPrimary }}>
              {branchName} — Receipts {search ? `(filtered)` : ''}
            </h2>
            <button type="button" onClick={() => setViewAll((v) => !v)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: accent }}>
              {viewAll ? 'Daily view' : 'Table view'}
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center" style={{ color: textMuted }}>
              No receipts found. {!search && 'Add receipts manually or import from Excel.'}
            </div>
          ) : viewAll ? (
            // ── Table view ──
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr style={{ backgroundColor: `${accent}18` }}>
                    {['Date','Incurred By','Description','Company','Receipt No','Amount','Category','Source',''].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left font-bold" style={{ color: textMuted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={row.id} style={{ borderTop: `1px solid ${border}`, backgroundColor: i % 2 ? (isLight ? '#f8fafc' : '#0d1520') : undefined }}>
                      <td className="px-3 py-2" style={{ color: textPrimary }}>{row.date}</td>
                      <td className="px-3 py-2" style={{ color: textPrimary }}>{row.incurredBy}</td>
                      <td className="px-3 py-2" style={{ color: textPrimary }}>{row.description}</td>
                      <td className="px-3 py-2" style={{ color: textPrimary }}>{row.company}</td>
                      <td className="px-3 py-2" style={{ color: textMuted }}>{row.receiptNo || '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ color: textPrimary }}>₱{peso(row.amount)}</td>
                      <td className="px-3 py-2" style={{ color: textMuted }}>{row.expenseCategory}</td>
                      <td className="px-3 py-2" style={{ color: textMuted }}>{row.sourceOfFunds || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startEdit(row)}><Pencil size={13} style={{ color: accent }} /></button>
                          <button type="button" onClick={() => { if (window.confirm('Delete this receipt?')) { deleteAuditExpense(row.id); reload() } }}><Trash2 size={13} style={{ color: danger }} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${border}` }}>
                    <td colSpan={5} className="px-3 py-2 font-bold text-right" style={{ color: textMuted }}>TOTAL</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: accent }}>₱{peso(totalFiltered)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            // ── Daily grouped view ──
            <div className="flex flex-col divide-y" style={{ borderColor: border }}>
              {byDate.map(([date, rows]) => {
                const dayTotal = rows.reduce((s, e) => s + e.amount, 0)
                return (
                  <div key={date}>
                    <div className="flex items-center justify-between px-5 py-3"
                      style={{ backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                      <span className="font-bold text-sm" style={{ color: textPrimary }}>{date}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: textMuted }}>{rows.length} receipt{rows.length !== 1 ? 's' : ''}</span>
                        <span className="font-bold text-sm" style={{ color: accent }}>₱{peso(dayTotal)}</span>
                      </div>
                    </div>
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between px-5 py-3 text-sm"
                        style={{ borderTop: `1px solid ${border}` }}>
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold truncate" style={{ color: textPrimary }}>{row.description || row.company}</span>
                          <span className="text-xs truncate" style={{ color: textMuted }}>
                            {row.company}{row.receiptNo ? ` · OR#${row.receiptNo}` : ''} · {row.incurredBy} · {row.expenseCategory}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 ml-3 shrink-0">
                          <span className="font-bold" style={{ color: textPrimary }}>₱{peso(row.amount)}</span>
                          <button type="button" onClick={() => startEdit(row)}><Pencil size={14} style={{ color: accent }} /></button>
                          <button type="button" onClick={() => { if (window.confirm('Delete?')) { deleteAuditExpense(row.id); reload() } }}><Trash2 size={14} style={{ color: danger }} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Excel hint ── */}
      <div className="rounded-xl p-4 flex gap-3 items-start text-sm"
        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}>
        <FileSpreadsheet size={18} style={{ color: accent, flexShrink: 0 }} />
        <div>
          <strong style={{ color: textPrimary }}>Excel import</strong> — The importer automatically scans all sheet tabs and finds the one with <strong>DATE</strong> and <strong>AMOUNT</strong> columns. Headers can be on any row. All data from that sheet is imported.
        </div>
      </div>
    </div>
  )
}
