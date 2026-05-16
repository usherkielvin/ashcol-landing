import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Upload, Receipt, CalendarDays, Building2,
  Plus, Trash2, Pencil, ChevronDown, ChevronUp, FileSpreadsheet,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import type { AuditExpense, AuditExpenseCategory } from '../types/auditExpense'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'
import {
  formatMonthLabel, formatTodayReceiptDate, getCurrentMonthKey, shiftMonthKey,
} from '../utils/auditExpenseDates'
import {
  bulkImportAuditExpenses,
  createExpenseId,
  deleteAuditExpense,
  loadAuditExpenses,
  upsertAuditExpense,
} from '../utils/auditExpenseStorage'
import { buildMonthlyReconciliation } from '../utils/auditExpenseRollup'
import { parseAuditExpenseExcelFile } from '../utils/parseAuditExpenseExcel'
import {
  loadMonthlySalesRelease,
  saveMonthlySalesRelease,
} from '../utils/salesExpenseReleaseStorage'

interface BranchOption {
  id: string
  name: string
}

const peso = (v: number) =>
  v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type ViewMode = 'month' | 'daily' | 'all'

const emptyForm = () => ({
  date: formatTodayReceiptDate(),
  company: '',
  description: '',
  receiptNo: '',
  amount: '',
  expenseCategory: 'OTHER' as AuditExpenseCategory,
  sourceOfFunds: '',
})

export default function AuditFinanceExpenses() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const isLight = theme === 'light'
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const accent = '#10B981'

  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const canAccess = isAdmin || isManager

  const [branches, setBranches] = useState<BranchOption[]>([])
  const [branchId, setBranchId] = useState('')
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey)
  const [expenses, setExpenses] = useState<AuditExpense[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [importing, setImporting] = useState(false)
  const [replaceOnImport, setReplaceOnImport] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AuditExpense | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [releaseEdit, setReleaseEdit] = useState(false)
  const [categoryRelease, setCategoryRelease] = useState<Record<string, string>>({})
  const [releaseNotes, setReleaseNotes] = useState('')
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  const branchName = branches.find((b) => b.id === branchId)?.name ?? ''

  const loadBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list: BranchOption[] = (data?.data || data || []).map((b: { id: string; name: string }) => ({
        id: b.id,
        name: b.name,
      }))
      setBranches(list)
      if (isManager && user?.branchId) {
        setBranchId(user.branchId)
      } else if (list.length > 0 && !branchId) {
        setBranchId(list[0].id)
      }
    } catch (e) {
      console.error(e)
    }
  }, [branchId, isManager, user?.branchId])

  const reloadExpenses = useCallback(() => {
    setExpenses(loadAuditExpenses())
  }, [])

  useEffect(() => {
    if (canAccess) void loadBranches()
  }, [canAccess, loadBranches])

  useEffect(() => {
    reloadExpenses()
  }, [reloadExpenses])

  const salesRelease = useMemo(() => {
    if (!branchId) return null
    return loadMonthlySalesRelease(branchId, monthKey)
  }, [branchId, monthKey, expenses])

  useEffect(() => {
    const rel = branchId ? loadMonthlySalesRelease(branchId, monthKey) : null
    const next: Record<string, string> = {}
    for (const cat of AUDIT_EXPENSE_CATEGORIES) {
      next[cat] = rel?.byCategory?.[cat] ? String(rel.byCategory[cat]) : ''
    }
    setCategoryRelease(next)
    setReleaseNotes(rel?.notes ?? '')
  }, [branchId, monthKey, expenses, releaseEdit])

  const reconciliation = useMemo(() => {
    if (!branchId) return null
    return buildMonthlyReconciliation(expenses, branchId, monthKey, salesRelease)
  }, [expenses, branchId, monthKey, salesRelease])

  const filteredRows = useMemo(() => {
    if (!reconciliation) return []
    const q = search.trim().toLowerCase()
    const rows = reconciliation.dailyGroups.flatMap((d) => d.expenses)
    if (!q) return rows
    return rows.filter(
      (e) =>
        e.company.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.receiptNo.toLowerCase().includes(q) ||
        e.incurredBy.toLowerCase().includes(q)
    )
  }, [reconciliation, search])

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !branchId) {
      e.target.value = ''
      return
    }

    const msg =
      `Import "${file.name}" for ${branchName}?\n\n` +
      (replaceOnImport
        ? `Existing receipts for this branch in ${formatMonthLabel(monthKey)} will be REPLACED. Rows from other months will be ADDED.`
        : 'New rows will be ADDED to existing receipts for this branch.')

    if (!window.confirm(msg)) {
      e.target.value = ''
      return
    }

    setImporting(true)
    try {
      const result = await parseAuditExpenseExcelFile(file, {
        branchId,
        branchName,
        monthKey,
        filterToMonth: false,
      })
      if (result.imported.length === 0) {
        alert(
          result.errors.length > 0
            ? `No rows imported.\n${result.errors.slice(0, 5).join('\n')}`
            : `No rows imported (${result.skipped} skipped — check dates match ${formatMonthLabel(monthKey)}).`
        )
        return
      }
      bulkImportAuditExpenses(result.imported, { branchId, monthKey, replaceExisting: replaceOnImport })
      reloadExpenses()
      alert(
        `Imported ${result.imported.length} receipt(s).` +
          (result.skipped > 0 ? ` Skipped ${result.skipped}.` : '') +
          (result.errors.length > 0 ? `\nWarnings:\n${result.errors.slice(0, 3).join('\n')}` : '')
      )
    } catch (err) {
      console.error(err)
      alert('Failed to read Excel file.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const saveRelease = () => {
    if (!branchId) return
    const byCategory: Partial<Record<AuditExpenseCategory, number>> = {}
    for (const cat of AUDIT_EXPENSE_CATEGORIES) {
      const v = parseFloat((categoryRelease[cat] || '').replace(/,/g, ''))
      if (!Number.isNaN(v) && v > 0) byCategory[cat] = v
    }
    saveMonthlySalesRelease(branchId, branchName, monthKey, { byCategory, notes: releaseNotes })
    setReleaseEdit(false)
    reloadExpenses()
  }

  const submitReceipt = () => {
    if (!branchId) return
    const amount = parseFloat(form.amount.replace(/,/g, ''))
    if (!form.company.trim() && !form.description.trim()) {
      alert('Enter company or description.')
      return
    }
    if (!amount || amount <= 0) {
      alert('Enter a valid amount.')
      return
    }
    const now = new Date().toISOString()
    const expense: AuditExpense = editing
      ? {
          ...editing,
          date: form.date.trim(),
          company: form.company.trim(),
          description: form.description.trim(),
          receiptNo: form.receiptNo.trim(),
          amount,
          expenseCategory: form.expenseCategory,
          sourceOfFunds: form.sourceOfFunds.trim(),
          updatedAt: now,
        }
      : {
          id: createExpenseId(),
          branchId,
          branchName,
          date: form.date.trim(),
          incurredBy: (user?.name || 'STAFF').toUpperCase(),
          company: form.company.trim(),
          description: form.description.trim(),
          receiptNo: form.receiptNo.trim(),
          amount,
          expenseCategory: form.expenseCategory,
          sourceOfFunds: form.sourceOfFunds.trim(),
          createdAt: now,
          updatedAt: now,
        }
    upsertAuditExpense(expense)
    reloadExpenses()
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm())
  }

  const startEdit = (row: AuditExpense) => {
    setEditing(row)
    setForm({
      date: row.date,
      company: row.company,
      description: row.description,
      receiptNo: row.receiptNo,
      amount: String(row.amount),
      expenseCategory: row.expenseCategory,
      sourceOfFunds: row.sourceOfFunds,
    })
    setShowForm(true)
  }

  if (!canAccess) {
    return (
      <div className="p-8 text-center" style={{ color: textMuted }}>
        Audit finance expenses are available for managers and admins only.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Header */}
      <div
        className="rounded-2xl p-5 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Receipt size={22} style={{ color: accent }} />
            <h1 className="text-xl md:text-2xl font-bold" style={{ color: textPrimary }}>
              Audit finance expenses
            </h1>
          </div>
          <p className="text-sm max-w-xl" style={{ color: textMuted }}>
            Record receipts daily per branch, import Excel, compound monthly totals, and match sales report released expenses.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setEditing(null); setForm(emptyForm()); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            <Plus size={16} /> Add receipt
          </button>
          <button
            type="button"
            disabled={!branchId || importing}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
          >
            <Upload size={16} />
            {importing ? 'Importing…' : 'Import Excel'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImportExcel}
          />
        </div>
      </div>

      {/* Filters: branch + month */}
      <div
        className="rounded-2xl p-4 flex flex-col md:flex-row flex-wrap gap-4 items-stretch md:items-end"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <label className="text-xs font-semibold flex items-center gap-1" style={{ color: textMuted }}>
            <Building2 size={14} /> Branch
          </label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={isManager && !!user?.branchId}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
          >
            {branches.length === 0 ? <option value="">Loading…</option> : null}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold flex items-center gap-1" style={{ color: textMuted }}>
            <CalendarDays size={14} /> Month
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))} className="p-2 rounded-lg" style={{ border: `1px solid ${inputBorder}` }}>
              <ChevronLeft size={18} style={{ color: accent }} />
            </button>
            <span className="text-sm font-bold min-w-[140px] text-center" style={{ color: textPrimary }}>
              {formatMonthLabel(monthKey)}
            </span>
            <button 
              type="button" 
              onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))} 
              disabled={monthKey >= getCurrentMonthKey()}
              className="p-2 rounded-lg disabled:opacity-30" 
              style={{ border: `1px solid ${inputBorder}` }}>
              <ChevronRight size={18} style={{ color: monthKey >= getCurrentMonthKey() ? textMuted : accent }} />
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: textMuted }}>
          <input type="checkbox" checked={replaceOnImport} onChange={(e) => setReplaceOnImport(e.target.checked)} />
          Replace existing rows on import
        </label>
      </div>

      {/* View tabs */}
      <div className="flex flex-wrap gap-2">
        {(['month', 'daily', 'all'] as ViewMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setViewMode(m)}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{
              backgroundColor: viewMode === m ? `${accent}22` : cardBg,
              border: `1px solid ${viewMode === m ? accent : border}`,
              color: viewMode === m ? accent : textMuted,
            }}
          >
            {m === 'month' ? 'Month match' : m === 'daily' ? 'Daily log' : 'All receipts'}
          </button>
        ))}
      </div>

      {/* Manual entry form */}
      {showForm && (
        <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <h2 className="font-bold" style={{ color: textPrimary }}>{editing ? 'Edit receipt' : 'New daily receipt'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              ['date', 'Date', form.date, (v: string) => setForm((f) => ({ ...f, date: v }))],
              ['company', 'Company', form.company, (v: string) => setForm((f) => ({ ...f, company: v }))],
              ['description', 'Description', form.description, (v: string) => setForm((f) => ({ ...f, description: v }))],
              ['receiptNo', 'Receipt no.', form.receiptNo, (v: string) => setForm((f) => ({ ...f, receiptNo: v }))],
              ['amount', 'Amount', form.amount, (v: string) => setForm((f) => ({ ...f, amount: v }))],
              ['sourceOfFunds', 'Source of funds', form.sourceOfFunds, (v: string) => setForm((f) => ({ ...f, sourceOfFunds: v }))],
            ].map(([key, label, val, set]) => (
              <div key={key as string}>
                <label className="text-xs font-semibold" style={{ color: textMuted }}>{label as string}</label>
                <input
                  className="w-full mt-1 rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  value={val as string}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: textMuted }}>Expense category</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {AUDIT_EXPENSE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, expenseCategory: cat }))}
                  className="px-3 py-1 rounded-lg text-xs font-semibold"
                  style={{
                    border: `1px solid ${form.expenseCategory === cat ? accent : inputBorder}`,
                    backgroundColor: form.expenseCategory === cat ? `${accent}22` : inputBg,
                    color: form.expenseCategory === cat ? accent : textMuted,
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 text-sm" style={{ color: textMuted }}>Cancel</button>
            <button type="button" onClick={submitReceipt} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: accent }}>
              {editing ? 'Update' : 'Save receipt'}
            </button>
          </div>
        </div>
      )}

      {!branchId || !reconciliation ? (
        <p style={{ color: textMuted }}>Select a branch to view expenses.</p>
      ) : null}

      {branchId && reconciliation && viewMode === 'month' && (
        <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div className="flex flex-wrap justify-between gap-3 items-start">
            <div>
              <h2 className="font-bold" style={{ color: textPrimary }}>
                {branchName} — {formatMonthLabel(monthKey)}
              </h2>
              <p className="text-sm" style={{ color: textMuted }}>
                Compare audit receipts (actual) vs sales report released expenses
              </p>
            </div>
            <button
              type="button"
              onClick={() => (releaseEdit ? saveRelease() : setReleaseEdit(true))}
              className="px-3 py-2 rounded-lg text-sm font-semibold"
              style={{ border: `1px solid ${inputBorder}`, color: accent }}
            >
              {releaseEdit ? 'Save release amounts' : 'Set sales release'}
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Days w/ receipts', String(reconciliation.dayCount)],
              ['Receipts', String(reconciliation.receiptCount)],
              ['Audit total', peso(reconciliation.auditTotal)],
              ['Released', peso(reconciliation.releasedTotal)],
            ].map(([label, val]) => (
              <div key={label} className="rounded-xl p-3" style={{ border: `1px solid ${border}` }}>
                <div className="text-xs font-semibold" style={{ color: textMuted }}>{label}</div>
                <div className="text-lg font-bold" style={{ color: textPrimary }}>{val}</div>
              </div>
            ))}
          </div>

          <div
            className="rounded-xl p-4 flex items-center justify-between"
            style={{
              border: `1px solid ${reconciliation.matched ? accent : '#F59E0B'}`,
              backgroundColor: reconciliation.matched ? `${accent}11` : 'rgba(245,158,11,0.08)',
            }}
          >
            <span className="font-semibold" style={{ color: textPrimary }}>Variance (released − actual)</span>
            <span className="text-xl font-bold" style={{ color: reconciliation.matched ? accent : reconciliation.variance < 0 ? '#EF4444' : '#F59E0B' }}>
              {peso(reconciliation.variance)}
              {reconciliation.matched ? ' · Matched' : reconciliation.variance < 0 ? ' · Over budget' : ' · Under release'}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${border}` }}>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ backgroundColor: `${accent}22` }}>
                  {['Category', 'Audit (receipts)', 'Released', 'Variance'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-bold" style={{ color: textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reconciliation.byCategory.map((row) => (
                  <tr key={row.category} style={{ borderTop: `1px solid ${border}` }}>
                    <td className="px-3 py-2" style={{ color: textPrimary }}>{row.category}</td>
                    <td className="px-3 py-2 text-right" style={{ color: textPrimary }}>{peso(row.auditAmount)}</td>
                    <td className="px-3 py-2 text-right">
                      {releaseEdit ? (
                        <input
                          className="w-24 rounded px-2 py-1 text-right text-sm"
                          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                          value={categoryRelease[row.category] ?? ''}
                          onChange={(e) => setCategoryRelease((p) => ({ ...p, [row.category]: e.target.value }))}
                        />
                      ) : (
                        <span style={{ color: textPrimary }}>{peso(row.releasedAmount)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: row.variance < 0 ? '#EF4444' : accent }}>
                      {peso(row.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {branchId && reconciliation && viewMode === 'daily' && (
        <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <h2 className="font-bold" style={{ color: textPrimary }}>Daily receipt log</h2>
          {reconciliation.dailyGroups.length === 0 ? (
            <p style={{ color: textMuted }}>No receipts this month. Import Excel or add receipts daily.</p>
          ) : (
            reconciliation.dailyGroups.map((day) => {
              const open = expandedDays[day.dateKey] ?? false
              return (
                <div key={day.dateKey} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => setExpandedDays((p) => ({ ...p, [day.dateKey]: !open }))}
                  >
                    <span className="flex items-center gap-2 font-semibold" style={{ color: textPrimary }}>
                      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {day.displayDate}
                      <span className="text-xs font-normal" style={{ color: textMuted }}>
                        ({day.receiptCount} receipt{day.receiptCount === 1 ? '' : 's'})
                      </span>
                    </span>
                    <span className="font-bold" style={{ color: accent }}>{peso(day.total)}</span>
                  </button>
                  {open && (
                    <div style={{ borderTop: `1px solid ${border}` }}>
                      {day.expenses.map((e) => (
                        <div key={e.id} className="flex items-center justify-between px-4 py-2 text-sm" style={{ borderTop: `1px solid ${border}` }}>
                          <div>
                            <div style={{ color: textPrimary }}>{e.description || e.company}</div>
                            <div className="text-xs" style={{ color: textMuted }}>{e.company} · {e.expenseCategory}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold" style={{ color: textPrimary }}>{peso(e.amount)}</span>
                            <button type="button" onClick={() => startEdit(e)}><Pencil size={14} style={{ color: accent }} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {branchId && reconciliation && viewMode === 'all' && (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div className="p-4 flex flex-col sm:flex-row gap-3 justify-between">
            <input
              placeholder="Search receipts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm flex-1 max-w-md"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            />
            <div className="text-sm font-bold self-center" style={{ color: accent }}>
              Total: {peso(filteredRows.reduce((s, e) => s + e.amount, 0))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr style={{ backgroundColor: accent, color: '#fff' }}>
                  {['DATE', 'INCURRED BY', 'DESCRIPTION', 'COMPANY', 'RECEIPT NO', 'AMOUNT', 'CATEGORY', 'SOURCE', ''].map((h) => (
                    <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center" style={{ color: textMuted }}>No receipts</td></tr>
                ) : (
                  filteredRows.map((row, i) => (
                    <tr key={row.id} style={{ borderTop: `1px solid ${border}`, backgroundColor: i % 2 ? (isLight ? '#f8fafc' : '#0d1520') : undefined }}>
                      <td className="px-2 py-2" style={{ color: textPrimary }}>{row.date}</td>
                      <td className="px-2 py-2" style={{ color: textPrimary }}>{row.incurredBy}</td>
                      <td className="px-2 py-2" style={{ color: textPrimary }}>{row.description}</td>
                      <td className="px-2 py-2" style={{ color: textPrimary }}>{row.company}</td>
                      <td className="px-2 py-2" style={{ color: textMuted }}>{row.receiptNo || '—'}</td>
                      <td className="px-2 py-2 text-right font-semibold" style={{ color: textPrimary }}>{peso(row.amount)}</td>
                      <td className="px-2 py-2" style={{ color: textPrimary }}>{row.expenseCategory}</td>
                      <td className="px-2 py-2" style={{ color: textMuted }}>{row.sourceOfFunds || '—'}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <button type="button" onClick={() => startEdit(row)}><Pencil size={14} style={{ color: accent }} /></button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Delete this receipt?')) {
                                deleteAuditExpense(row.id)
                                reloadExpenses()
                              }
                            }}
                          >
                            <Trash2 size={14} style={{ color: '#EF4444' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div
        className="rounded-xl p-4 flex gap-3 items-start text-sm"
        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
      >
        <FileSpreadsheet size={18} style={{ color: accent, flexShrink: 0 }} />
        <div>
          <strong style={{ color: textPrimary }}>Excel import</strong> — Use columns: DATE, INCURRED BY, DESCRIPTION, COMPANY,
          RECEIPT NO, AMOUNT, EXPENSE CATEGORY, SOURCE OF FUNDS. Rows are imported for the selected <strong>branch</strong> and{' '}
          <strong>month</strong> only (by date column).
        </div>
      </div>
    </div>
  )
}
