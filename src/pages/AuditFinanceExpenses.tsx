import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Receipt, Building2, Plus, Trash2, Pencil, FileSpreadsheet, Search, X, Camera, Loader2, ChevronUp, ChevronDown, ClipboardPaste, Download } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import type { AuditExpense, AuditExpenseCategory } from '../types/auditExpense'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'
import { formatTodayReceiptDate } from '../utils/auditExpenseDates'
import { bulkImportAuditExpenses, createExpenseId, deleteAuditExpense, loadAuditExpenses, upsertAuditExpense, clearAuditExpensesByBranch } from '../utils/auditExpenseStorage'
import { parseAuditExpenseExcelFile } from '../utils/parseAuditExpenseExcel'
import { parseSmartDate, dateToTime } from '../utils/smartDate'
import AutoSuggestInput from '../components/AutoSuggestInput'
import * as XLSX from 'xlsx'

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
  const [sortConfig, setSortConfig] = useState<{ key: keyof AuditExpense; direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' })
  const [viewAll, setViewAll] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set())
  const [scanError, setScanError] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)

  // Custom categories persisted to localStorage
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('auditExpenseCustomCategories') || '[]') } catch { return [] }
  })
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const newCategoryRef = useRef<HTMLInputElement>(null)

  const allCategories = useMemo(
    () => [...AUDIT_EXPENSE_CATEGORIES, ...customCategories.filter((c) => !AUDIT_EXPENSE_CATEGORIES.includes(c as AuditExpenseCategory))],
    [customCategories]
  )

  const saveCustomCategory = () => {
    const val = newCategoryInput.trim().toUpperCase()
    if (!val) { setAddingCategory(false); setNewCategoryInput(''); return }
    if (!allCategories.includes(val)) {
      const updated = [...customCategories, val]
      setCustomCategories(updated)
      localStorage.setItem('auditExpenseCustomCategories', JSON.stringify(updated))
    }
    setForm((f) => ({ ...f, expenseCategory: val as AuditExpenseCategory }))
    setAddingCategory(false)
    setNewCategoryInput('')
  }

  useEffect(() => {
    if (addingCategory) setTimeout(() => newCategoryRef.current?.focus(), 50)
  }, [addingCategory])

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

  const reload = useCallback(async () => {
    try {
      const data = await loadAuditExpenses()
      setExpenses(data)
    } catch (err) {
      console.error('[AuditFinanceExpenses] Reload error:', err)
    }
  }, [])

  useEffect(() => { if (canAccess) void loadBranches() }, [canAccess, loadBranches])
  useEffect(() => { void reload() }, [reload])

  const branchExpenses = useMemo(() =>
    expenses.filter((e) => e.branchId === branchId), [expenses, branchId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = [...branchExpenses]
    if (q) {
      rows = rows.filter((e) =>
        e.company.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.receiptNo.toLowerCase().includes(q) ||
        e.incurredBy.toLowerCase().includes(q) ||
        e.date.toLowerCase().includes(q)
      )
    }

    if (sortConfig) {
      rows.sort((a, b) => {
        if (sortConfig.key === 'date') {
          const timeA = dateToTime(a.date)
          const timeB = dateToTime(b.date)
          if (timeA < timeB) return sortConfig.direction === 'asc' ? -1 : 1
          if (timeA > timeB) return sortConfig.direction === 'asc' ? 1 : -1
          return 0
        }

        let valA = a[sortConfig.key]
        let valB = b[sortConfig.key]
        if (typeof valA === 'string') valA = valA.toLowerCase()
        if (typeof valB === 'string') valB = valB.toLowerCase()

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return rows
  }, [branchExpenses, search, sortConfig])

  // Group by date for daily view
  const byDate = useMemo(() => {
    const map: Record<string, AuditExpense[]> = {}
    for (const e of filtered) {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    return Object.entries(map).sort(([a], [b]) => dateToTime(b) - dateToTime(a))
  }, [filtered])

  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0)

  const handleDateBlur = (raw: string) => {
    const parsed = parseSmartDate(raw)
    if (parsed) { setDateRaw(parsed); setForm((f) => ({ ...f, date: parsed })); setDateError('') }
    else if (raw.trim()) setDateError('Cannot parse date. Try: May 16, 16-May-26, 2026-05-16')
  }

  const handleExportExcel = () => {
    if (filtered.length === 0) return
    const wsData = filtered.map(row => ({
      Date: row.date,
      'Incurred By': row.incurredBy,
      Description: row.description,
      Company: row.company,
      'Receipt No': row.receiptNo || '',
      Amount: row.amount,
      Category: row.expenseCategory,
      'Source of Funds': row.sourceOfFunds || ''
    }))
    const ws = XLSX.utils.json_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Receipts')
    XLSX.writeFile(wb, `Ashcol_Receipts_${branchName}_${new Date().toISOString().split('T')[0]}.xlsx`)
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
      await bulkImportAuditExpenses(result.imported)
      await reload()
      alert(`Imported ${result.imported.length} receipt(s).` + (result.skipped > 0 ? ` Skipped ${result.skipped}.` : ''))
    } catch { alert('Failed to read Excel file.') }
    finally { setImporting(false); e.target.value = '' }
  }

  const submitReceipt = async () => {
    if (!branchId) return
    const amount = parseFloat(form.amount.replace(/,/g, ''))
    if (!form.company.trim() && !form.description.trim()) { alert('Enter company or description.'); return }
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return }
    if (!form.date.trim()) { alert('Enter a valid date.'); return }
    const now = new Date().toISOString()
    const expense: AuditExpense = editing
      ? { ...editing, date: form.date.trim(), company: form.company.trim(), description: form.description.trim(), receiptNo: form.receiptNo.trim(), amount, expenseCategory: form.expenseCategory, sourceOfFunds: form.sourceOfFunds.trim(), updatedAt: now }
      : { id: createExpenseId(), branchId, branchName, date: form.date.trim(), incurredBy: (form.incurredBy.trim() || user?.name || 'STAFF').toUpperCase(), company: form.company.trim(), description: form.description.trim(), receiptNo: form.receiptNo.trim(), amount, expenseCategory: form.expenseCategory, sourceOfFunds: form.sourceOfFunds.trim(), createdAt: now, updatedAt: now }
    await upsertAuditExpense(expense)
    await reload()
    setShowForm(false); setEditing(null); setForm(emptyForm()); setDateRaw(formatTodayReceiptDate()); setDateError('')
  }

  const handleClearBranchReceipts = async () => {
    if (!branchId) return
    const count = branchExpenses.length
    if (count === 0) { alert('No receipts to clear for this branch.'); return }
    if (!window.confirm(`Are you sure you want to delete ALL ${count} receipt(s) for ${branchName}?\n\nThis action cannot be undone and is usually done before re-adding or re-importing.`)) { return }
    try {
      await clearAuditExpensesByBranch(branchId)
      await reload()
      alert(`Cleared all receipts for ${branchName}.`)
    } catch (err) {
      console.error(err)
      alert('Failed to clear receipts for this branch.')
    }
  }

  const startEdit = (row: AuditExpense) => {
    setEditing(row); setDateRaw(row.date); setDateError(''); setScanPreview(null)
    setForm({ date: row.date, company: row.company, description: row.description, receiptNo: row.receiptNo, amount: String(row.amount), expenseCategory: row.expenseCategory, sourceOfFunds: row.sourceOfFunds, incurredBy: row.incurredBy })
    setShowForm(true)
  }

  const processImage = async (file: File) => {
    const url = URL.createObjectURL(file)
    setScanPreview(url)
    setScanning(true)
    setScanError('')
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
      if (data.error) { setScanError(`Scan failed: ${data.error}`); return }

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
      setScanError('Could not scan receipt. Make sure the backend is running.')
    } finally {
      setScanning(false)
      if (scanRef.current) scanRef.current.value = ''
    }
  }

  const handleScanImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processImage(file)
  }

  const handlePasteClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (scanning) return
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageTypes = item.types.filter(type => type.startsWith('image/'))
        if (imageTypes.length > 0) {
          const blob = await item.getType(imageTypes[0])
          const file = new File([blob], "pasted-receipt.png", { type: imageTypes[0] })
          await processImage(file)
          return
        }
      }
      setScanError('No image found in clipboard. Please copy an image first.')
    } catch (err) {
      console.error('Paste error:', err)
      setScanError('Could not read clipboard. Please check permissions or select a file instead.')
    }
  }

  const handleScanClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (scanning) return
    setScanError('')
    scanRef.current?.click()
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
          {branchId && branchExpenses.length > 0 && (
            <button type="button" onClick={handleClearBranchReceipts}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow"
              style={{ backgroundColor: danger }}>
              <Trash2 size={16} /> Clear Branch
            </button>
          )}
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="rounded-2xl px-4 py-3 flex flex-col md:flex-row gap-2 items-center"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        {/* Branch selector */}
        <div style={{ position: 'relative' }} className="w-full md:w-52 shrink-0">
          <Building2 size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={isManager && !!user?.branchId}
            className="w-full rounded-lg pl-8 pr-7 py-2 text-sm appearance-none outline-none cursor-pointer"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: branchId ? textPrimary : textMuted, colorScheme: isLight ? 'light' : 'dark' }}
          >
            {branches.length === 0
              ? <option value="">Loading…</option>
              : <option value="" disabled>Select branch…</option>
            }
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <ChevronDown size={12} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
        </div>

        {/* Divider */}
        <div className="hidden md:block w-px self-stretch" style={{ backgroundColor: border }} />

        {/* Search */}
        <div style={{ position: 'relative' }} className="flex-1 w-full">
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, description, date, receipt no…"
            className="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: textMuted }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Summary — right magnet */}
        {branchId && (
          <>
            <div className="hidden md:block w-px self-stretch" style={{ backgroundColor: border }} />
            <div className="flex items-center gap-3 shrink-0 md:ml-auto">
              <div className="text-right">
                <div className="text-xs font-medium" style={{ color: textMuted }}>{filtered.length} receipts</div>
                <div className="text-sm font-bold" style={{ color: textPrimary }}>₱{peso(totalFiltered)}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── ENTRY FORM ── */}
      {showForm && (
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${accent}55`, boxShadow: `0 0 0 2px ${accent}22` }}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2" style={{ color: textPrimary }}>
              <div className="rounded-lg p-1.5" style={{ backgroundColor: `${accent}22` }}><Receipt size={16} style={{ color: accent }} /></div>
              {editing ? 'Edit Receipt' : 'New Receipt'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={scanning}
                onClick={handlePasteClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ backgroundColor: scanning ? `${accent}11` : `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
                title="Paste an image from your clipboard"
              >
                <ClipboardPaste size={13} /> Paste Image
              </button>
              <button
                type="button"
                disabled={scanning}
                onClick={handleScanClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ backgroundColor: scanning ? `${accent}11` : `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
                title="Upload a photo of the receipt to auto-fill fields"
              >
                {scanning
                  ? <><Loader2 size={13} className="animate-spin" /> Scanning…</>
                  : <><Camera size={13} /> Upload File</>
                }
              </button>
              <input ref={scanRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanImage} />
              <button onClick={() => { setShowForm(false); setEditing(null); setScanPreview(null) }} style={{ color: textMuted }}><X size={18} /></button>
            </div>
          </div>

          {/* ── Side-by-side: image reference + form fields ── */}
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Sticky receipt image reference */}
            {scanPreview && (
              <div className="flex-shrink-0 lg:w-44">
                <p className="text-xs font-semibold mb-1.5" style={{ color: scanBorder }}>📄 Receipt reference</p>
                <div style={{ position: 'relative' }}>
                  <img
                    src={scanPreview}
                    alt="Scanned receipt"
                    style={{ width: '100%', maxWidth: 180, borderRadius: 10, border: `2px solid ${scanBorder}44`, objectFit: 'contain', maxHeight: 320 }}
                  />
                  {scanning && (
                    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Loader2 size={28} className="animate-spin" style={{ color: accent }} />
                      <span style={{ color: '#fff', fontSize: 11 }}>Reading receipt…</span>
                    </div>
                  )}
                </div>
                {!scanning && scannedFields.size > 0 && !scanError && (
                  <p className="text-xs mt-2" style={{ color: scanBorder }}>⚠ Amber fields were auto-filled — review for accuracy.</p>
                )}
                {!scanning && scanError && (
                  <p className="text-xs mt-2" style={{ color: danger }}>❌ {scanError}</p>
                )}
                <button type="button" onClick={() => { setScanPreview(null); setScannedFields(new Set()); setScanError('') }} className="text-xs mt-2" style={{ color: textMuted }}>× Clear</button>
              </div>
            )}

            {/* Form grid */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none transition-all"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('date') }} />
                  {dateError
                    ? <p className="text-xs mt-0.5" style={{ color: danger }}>{dateError}</p>
                    : form.date ? <p className="text-xs mt-0.5" style={{ color: accent }}>✓ {form.date}</p> : null}
                </div>
              )}

              {/* Incurred By */}
              {field(
                <span className="flex items-center gap-1">Incurred By {scannedFields.has('incurredBy') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <AutoSuggestInput value={form.incurredBy}
                  onChange={(v) => { setForm((f) => ({ ...f, incurredBy: v })); clearScanned('incurredBy') }}
                  suggestions={suggestions.people} placeholder="Who incurred this?"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputStyle={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  inputBorder={scannedFields.has('incurredBy') ? scanBorder : inputBorder} />
              )}

              {/* Description */}
              {field(
                <span className="flex items-center gap-1">Description {scannedFields.has('description') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <AutoSuggestInput value={form.description}
                  onChange={(v) => { setForm((f) => ({ ...f, description: v })); clearScanned('description') }}
                  suggestions={suggestions.descs} placeholder="What was purchased?"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputStyle={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  inputBorder={scannedFields.has('description') ? scanBorder : inputBorder} />
              )}

              {/* Company */}
              {field(
                <span className="flex items-center gap-1">Company / Vendor {scannedFields.has('company') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <AutoSuggestInput value={form.company}
                  onChange={(v) => { setForm((f) => ({ ...f, company: v })); clearScanned('company') }}
                  suggestions={suggestions.companies} placeholder="Store or vendor name"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputStyle={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  inputBorder={scannedFields.has('company') ? scanBorder : inputBorder} />
              )}

              {/* Receipt No */}
              {field(
                <span className="flex items-center gap-1">Receipt No. {scannedFields.has('receiptNo') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <input value={form.receiptNo}
                  onChange={(e) => { setForm((f) => ({ ...f, receiptNo: e.target.value })); clearScanned('receiptNo') }}
                  placeholder="OR / SI number"
                  className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none transition-all"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('receiptNo') }} />
              )}

              {/* Amount */}
              {field(
                <span className="flex items-center gap-1">Amount (₱) {scannedFields.has('amount') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <input type="number" value={form.amount}
                  onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); clearScanned('amount') }}
                  placeholder="0.00"
                  className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none transition-all"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('amount') }} />
              )}

              {/* Source of Funds */}
              {field(
                <span className="flex items-center gap-1">Source of Funds {scannedFields.has('sourceOfFunds') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <AutoSuggestInput value={form.sourceOfFunds}
                  onChange={(v) => { setForm((f) => ({ ...f, sourceOfFunds: v })); clearScanned('sourceOfFunds') }}
                  suggestions={suggestions.sources} placeholder="Petty cash, reimbursement…"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputStyle={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  inputBorder={scannedFields.has('sourceOfFunds') ? scanBorder : inputBorder} />
              )}
            </div>
          </div>

          {/* Category chips */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: textMuted }}>Expense Category</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {allCategories.map((cat) => (
                <button key={cat} type="button" onClick={() => setForm((f) => ({ ...f, expenseCategory: cat as AuditExpenseCategory }))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ border: `1px solid ${form.expenseCategory === cat ? accent : inputBorder}`, backgroundColor: form.expenseCategory === cat ? `${accent}22` : inputBg, color: form.expenseCategory === cat ? accent : textMuted }}>
                  {cat}
                </button>
              ))}
              {/* Add custom category */}
              {addingCategory ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={newCategoryRef}
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveCustomCategory() } if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryInput('') } }}
                    placeholder="Category name"
                    className="px-2 py-1 rounded-lg text-xs font-semibold outline-none w-32"
                    style={{ border: `1px solid ${accent}`, backgroundColor: inputBg, color: textPrimary }}
                  />
                  <button type="button" onClick={saveCustomCategory} className="px-2 py-1 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: accent }}>Add</button>
                  <button type="button" onClick={() => { setAddingCategory(false); setNewCategoryInput('') }} className="px-2 py-1 rounded-lg text-xs font-semibold" style={{ color: textMuted, backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingCategory(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                  style={{ border: `1px dashed ${inputBorder}`, backgroundColor: inputBg, color: textMuted }}>
                  <Plus size={11} /> New
                </button>
              )}
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
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleExportExcel}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
                title="Export filtered receipts to Excel">
                <Download size={14} /> Export
              </button>
              <button type="button" onClick={() => setViewAll((v) => !v)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: accent }}>
                {viewAll ? 'Daily view' : 'Table view'}
              </button>
            </div>
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
                    {[
                      { key: 'date', label: 'Date' },
                      { key: 'incurredBy', label: 'Incurred By' },
                      { key: 'description', label: 'Description' },
                      { key: 'company', label: 'Company' },
                      { key: 'receiptNo', label: 'Receipt No' },
                      { key: 'amount', label: 'Amount' },
                      { key: 'expenseCategory', label: 'Category' },
                      { key: 'sourceOfFunds', label: 'Source' }
                    ].map(({ key, label }) => {
                      const isSorted = sortConfig?.key === key
                      return (
                        <th key={key}
                          className="px-3 py-3 text-left font-bold cursor-pointer select-none transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                          style={{ color: textMuted }}
                          onClick={() => {
                            setSortConfig(prev => {
                              if (prev?.key === key) {
                                return prev.direction === 'asc' ? { key: key as keyof AuditExpense, direction: 'desc' } : null
                              }
                              return { key: key as keyof AuditExpense, direction: 'asc' }
                            })
                          }}
                        >
                          <div className="flex items-center gap-1">
                            {label}
                            {isSorted && (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                          </div>
                        </th>
                      )
                    })}
                    <th className="px-3 py-3"></th>
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
                          <button type="button" onClick={async () => { if (window.confirm('Delete this receipt?')) { await deleteAuditExpense(row.id); await reload() } }}><Trash2 size={13} style={{ color: danger }} /></button>
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
                          <button type="button" onClick={async () => { if (window.confirm('Delete?')) { await deleteAuditExpense(row.id); await reload() } }}><Trash2 size={14} style={{ color: danger }} /></button>
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
