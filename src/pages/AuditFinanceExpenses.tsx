import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Receipt, Building2, Plus, Trash2, Pencil, Settings, FileSpreadsheet, Search, X, Loader2, ChevronUp, ChevronDown, ClipboardPaste, Download, AlertTriangle, ClipboardList, CalendarDays, ListFilter, LayoutList, Table2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import type { AuditExpense, AuditExpenseCategory } from '../types/auditExpense'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'
import { formatTodayReceiptDate } from '../utils/auditExpenseDates'
import { bulkImportAuditExpenses, createExpenseId, deleteAuditExpense, loadAuditExpenses, upsertAuditExpense, clearAuditExpensesByBranch } from '../utils/auditExpenseStorage'
import { loadAuditExpenseCategories, saveAuditExpenseCategory, deleteAuditExpenseCategory, reorderAuditExpenseCategories, type AuditExpenseCategoryDetail } from '../utils/auditExpenseCategoryStorage'
import { parseAuditExpenseExcelFile } from '../utils/parseAuditExpenseExcel'
import { parseSmartDate, dateToTime } from '../utils/smartDate'
import AutoSuggestInput from '../components/AutoSuggestInput'
import * as XLSX from 'xlsx'

interface BranchOption { id: string; name: string }
const peso = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const emptyForm = (defaultBranchId = '') => ({ date: formatTodayReceiptDate(), company: '', description: '', receiptNo: '', amount: '', expenseCategory: 'OTHER' as AuditExpenseCategory, sourceOfFunds: '', incurredBy: '', branchId: defaultBranchId })

export default function AuditFinanceExpenses() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const isLight = theme === 'light'
  const bg = isLight ? '#f0f4f8' : '#060D1A'
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const accent = '#10B981'
  const danger = '#EF4444'

  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isBranchScopedUser = !isAdmin && !!user?.branchId
  const canAccess = isAdmin || isManager || role === 'staff' || role === 'employee' || role === 'oic'

  const [branches, setBranches] = useState<BranchOption[]>([])
  const [branchId, setBranchId] = useState('')
  const [expenses, setExpenses] = useState<AuditExpense[]>([])
  const [importing, setImporting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AuditExpense | null>(null)
  const [duplicateModal, setDuplicateModal] = useState<{
    isOpen: boolean;
    existingExpense: AuditExpense;
    newExpense: AuditExpense;
  } | null>(null)
  const [detailRow, setDetailRow] = useState<AuditExpense | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [dateRaw, setDateRaw] = useState(formatTodayReceiptDate())
  const [dateError, setDateError] = useState('')
  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState('All')
  const [sortConfig, setSortConfig] = useState<{ key: keyof AuditExpense; direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' })
  const [viewAll, setViewAll] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set())
  const [scanError, setScanError] = useState('')
  const [savingReceipt, setSavingReceipt] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)

  // Dynamic categories state
  const [categories, setCategories] = useState<AuditExpenseCategoryDetail[]>([])
  const [isEditingCategories, setIsEditingCategories] = useState(false)
  const [editingCategoryDetail, setEditingCategoryDetail] = useState<AuditExpenseCategoryDetail | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const newCategoryRef = useRef<HTMLInputElement>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const reloadCategories = useCallback(async () => {
    try {
      const data = await loadAuditExpenseCategories()
      setCategories(data)
    } catch (err) {
      console.error(err)
    }
  }, [])

  const resolveFormBranchId = useCallback((id: string) => {
    if (!id) return ''
    const exists = branches.some(b => b.id === id)
    if (!exists) {
      const splitOption = branches.find(b => b.id.startsWith(`${id}-`))
      if (splitOption) {
        const salesOption = branches.find(b => b.id === `${id}-sales`)
        return salesOption ? salesOption.id : splitOption.id
      }
    }
    return id
  }, [branches])

  useEffect(() => {
    void reloadCategories()
  }, [reloadCategories])

  const allCategories = useMemo(() => {
    if (categories.length > 0) {
      return categories.map(c => c.name)
    }
    return AUDIT_EXPENSE_CATEGORIES
  }, [categories])

  const saveCustomCategory = async () => {
    const val = newCategoryInput.trim().toUpperCase()
    if (!val) { setAddingCategory(false); setNewCategoryInput(''); return }
    if (!allCategories.includes(val)) {
      try {
        await saveAuditExpenseCategory({ name: val })
        await reloadCategories()
      } catch (err) {
        console.error(err)
        alert('Failed to save category.')
      }
    }
    setForm((f) => ({ ...f, expenseCategory: val as AuditExpenseCategory }))
    setAddingCategory(false)
    setNewCategoryInput('')
  }

  const startEditingCategoryName = (cat: AuditExpenseCategoryDetail) => {
    setEditingCategoryDetail(cat)
    setEditingCategoryName(cat.name)
  }

  const handleSaveCategoryName = async (cat: AuditExpenseCategoryDetail) => {
    const val = editingCategoryName.trim().toUpperCase()
    if (!val) { setEditingCategoryDetail(null); return }
    try {
      await saveAuditExpenseCategory({ ...cat, name: val })
      setEditingCategoryDetail(null)
      await reloadCategories()
    } catch (err) {
      console.error(err)
      alert('Failed to update category name.')
    }
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const updated = [...categories]
    const draggedItem = updated[draggedIndex]
    updated.splice(draggedIndex, 1)
    updated.splice(index, 0, draggedItem)
    setDraggedIndex(index)
    setCategories(updated)
  }

  const handleDragEnd = async () => {
    setDraggedIndex(null)
    try {
      const ids = categories.map(c => c.id)
      await reorderAuditExpenseCategories(ids)
      await reloadCategories()
    } catch (err) {
      console.error('Failed to save category order:', err)
      alert('Failed to save category order.')
    }
  }

  useEffect(() => {
    if (addingCategory) setTimeout(() => newCategoryRef.current?.focus(), 50)
  }, [addingCategory])

  const branchName = branches.find((b) => b.id === branchId)?.name ?? ''

  const branchExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (e.branchId === branchId) return true
      if (branchId.endsWith('-sales')) {
        const baseId = branchId.slice(0, -6)
        if (e.branchId === baseId) return true
        if (e.branchName.toUpperCase() === 'ASHCOL TAGUIG' || e.branchName.toUpperCase() === 'TAGUIG') return true
      }
      return false
    })
  }, [expenses, branchId])

  // Suggestions derived from past expenses (limited to current branch)
  const suggestions = useMemo(() => {
    const companies = [...new Set(branchExpenses.map((e) => e.company).filter(Boolean))].sort()
    const descs = [...new Set(branchExpenses.map((e) => e.description).filter(Boolean))].sort()
    const people = [...new Set(branchExpenses.map((e) => e.incurredBy).filter(Boolean))].sort()
    const sources = [...new Set(branchExpenses.map((e) => e.sourceOfFunds).filter(Boolean))].sort()
    return { companies, descs, people, sources }
  }, [branchExpenses])

  const latestDateStr = useMemo(() => {
    let maxTime = 0
    let maxDateStr = ''
    for (const e of branchExpenses) {
      if (!e.date) continue
      const t = dateToTime(e.date)
      if (t > maxTime) {
        maxTime = t
        maxDateStr = e.date
      }
    }
    let targetDate = new Date()
    if (maxDateStr) {
      const parts = maxDateStr.split('-')
      if (parts.length === 3) {
        const d = parseInt(parts[0])
        const mStr = parts[1].toLowerCase()
        const y = parseInt(parts[2])
        const fullYear = y < 100 ? 2000 + y : y
        const monthNames: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        }
        const mIdx = monthNames[mStr]
        if (mIdx !== undefined) {
          targetDate = new Date(fullYear, mIdx, d)
        }
      }
    }
    return targetDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }, [branchExpenses])

  const loadBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list: BranchOption[] = (data?.data || data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))
      const hasExplicitTaguigSales = list.some(b => {
        const id = b.id.toUpperCase()
        const name = b.name.toUpperCase()
        return id === 'BR-TAGUIG-SALES' || name.includes('TAGUIG') && name.includes('SALES')
      })
      const hasExplicitTaguigServices = list.some(b => {
        const id = b.id.toUpperCase()
        const name = b.name.toUpperCase()
        return id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || name.includes('TAGUIG') && name.includes('SERVICE')
      })
      
      const newList: BranchOption[] = []
      for (const b of list) {
        const cleanName = b.name.replace(/^(ashcol\s+)/i, '')
        if (b.name.toUpperCase() === 'ASHCOL TAGUIG' || b.name.toUpperCase() === 'TAGUIG') {
          if (!hasExplicitTaguigSales) newList.push({ id: `${b.id}-sales`, name: 'TAGUIG SALES' })
          if (!hasExplicitTaguigServices) newList.push({ id: `${b.id}-services`, name: 'Taguig - Services' })
        } else {
          newList.push({ id: b.id, name: cleanName })
        }
      }

      newList.sort((a, b) => a.name.localeCompare(b.name))

      let finalList = newList
      if (isBranchScopedUser && user?.branchId) {
        finalList = newList.filter(b => b.id === user.branchId || b.id.startsWith(`${user.branchId}-`))
      }

      setBranches(finalList)

      if (finalList.length > 0) {
        if (isBranchScopedUser && user?.branchId) {
          const matched = finalList.find(b => b.id === user.branchId || b.id.startsWith(`${user.branchId}-`))
          if (matched) {
            setBranchId(matched.id)
          } else {
            setBranchId(finalList[0].id)
          }
        } else if (!branchId) {
          setBranchId(finalList[0].id)
        }
      }
    } catch (e) { console.error(e) }
  }, [isBranchScopedUser, user?.branchId, branchId])

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

  useEffect(() => {
    if (showForm) {
      setTimeout(() => {
        document.getElementById('receipt-date')?.focus()
      }, 50)
    }
  }, [showForm])

  useEffect(() => {
    if (!editing && branchId) {
      setForm((f) => ({ ...f, branchId: resolveFormBranchId(branchId) }))
    }
  }, [branchId, editing, resolveFormBranchId])



  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    // Always include current month
    const parts = formatTodayReceiptDate().split('-')
    if (parts.length === 3) months.add(`${parts[1]} 20${parts[2]}`)
    
    for (const e of branchExpenses) {
      if (!e.date) continue
      const p = e.date.split('-')
      if (p.length === 3) months.add(`${p[1]} 20${p[2]}`)
    }
    return Array.from(months).sort((a, b) => {
      const timeA = new Date(`01 ${a}`).getTime()
      const timeB = new Date(`01 ${b}`).getTime()
      return timeB - timeA
    })
  }, [branchExpenses])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = [...branchExpenses]

    if (filterMonth !== 'All') {
      rows = rows.filter(e => {
        const parts = e.date.split('-')
        if (parts.length === 3) {
          return `${parts[1]} 20${parts[2]}` === filterMonth
        }
        return false
      })
    }

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

        let valA = a[sortConfig.key] ?? ''
        let valB = b[sortConfig.key] ?? ''
        if (typeof valA === 'string') valA = valA.toLowerCase()
        if (typeof valB === 'string') valB = valB.toLowerCase()

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return rows
  }, [branchExpenses, search, sortConfig, filterMonth])

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
    XLSX.utils.book_append_sheet(wb, ws, 'Expense Records')
    XLSX.writeFile(wb, `ASHCOL_Expense_Records_${branchName}_${new Date().toISOString().split('T')[0]}.xlsx`)
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
      let msg = `Imported ${result.imported.length} expense record(s).`
      if (result.skipped > 0) {
        msg += ` Skipped ${result.skipped} row(s).`
        if (result.errors.length > 0) {
          msg += `\n\nReasons for skipped rows:\n` + result.errors.slice(0, 15).map(err => `• ${err}`).join('\n')
          if (result.errors.length > 15) {
            msg += `\n• ...and ${result.errors.length - 15} more rows.`
          }
        }
      }
      alert(msg)
    } catch { alert('Failed to read Excel file.') }
    finally { setImporting(false); e.target.value = '' }
  }

  const saveExpense = async (expense: AuditExpense) => {
    setSavingReceipt(true)
    try {
      await upsertAuditExpense(expense)
      await reload()
    } finally {
      setSavingReceipt(false)
    }
    if (editing) {
      // Updating an existing receipt — close the form
      setShowForm(false); setEditing(null); setForm(emptyForm(branchId)); setDateRaw(formatTodayReceiptDate()); setDateError('')
      setScanPreview(null); setScannedFields(new Set()); setScanError('')
    } else {
      // New receipt saved — keep form open, clear fields (including date) for next entry
      setForm({ ...emptyForm(branchId), date: '' }); setDateRaw(''); setDateError('')
      setScanPreview(null); setScannedFields(new Set()); setScanError('')
      // Focus the first field for quick next entry
      setTimeout(() => { document.getElementById('receipt-date')?.focus() }, 50)
    }
  }

  const confirmUpdateDuplicate = async () => {
    if (!duplicateModal) return
    const { existingExpense, newExpense } = duplicateModal
    const updatedExpense: AuditExpense = {
      ...newExpense,
      id: existingExpense.id,
      createdAt: existingExpense.createdAt || newExpense.createdAt
    }
    setDuplicateModal(null)
    await saveExpense(updatedExpense)
  }

  const submitReceipt = async () => {
    if (!branchId) return
    const amount = parseFloat(form.amount.replace(/,/g, ''))
    if (!form.company.trim() && !form.description.trim()) { alert('Enter company or description.'); return }
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return }
    if (!form.date.trim()) { alert('Enter a valid date.'); return }

    // Check future date
    const parsedDate = parseSmartDate(form.date.trim())
    if (parsedDate) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const inputDate = new Date(parsedDate)
      if (inputDate > today) {
        if (!window.confirm(`Warning: The date entered (${form.date.trim()}) is in the future. Are you sure you want to save this receipt?`)) {
          return
        }
      }
    }

    const now = new Date().toISOString()
    const targetBranchId = form.branchId || branchId
    const targetBranchName = branches.find(b => b.id === targetBranchId)?.name || branchName

    const expense: AuditExpense = editing
      ? { ...editing, branchId: targetBranchId, branchName: targetBranchName, date: form.date.trim(), company: form.company.trim().toUpperCase(), incurredBy: (form.incurredBy.trim() || user?.name || 'STAFF').toUpperCase(), description: form.description.trim(), receiptNo: form.receiptNo.trim(), amount, expenseCategory: form.expenseCategory, sourceOfFunds: form.sourceOfFunds.trim(), updatedAt: now }
      : { id: createExpenseId(), branchId: targetBranchId, branchName: targetBranchName, date: form.date.trim(), incurredBy: (form.incurredBy.trim() || user?.name || 'STAFF').toUpperCase(), company: form.company.trim().toUpperCase(), description: form.description.trim(), receiptNo: form.receiptNo.trim(), amount, expenseCategory: form.expenseCategory, sourceOfFunds: form.sourceOfFunds.trim(), inputBy: user?.jobTitle ? `${user?.name || user?.email} - ${user.jobTitle}` : `${user?.name || user?.email || 'STAFF'} - ${(user?.role || 'USER').toUpperCase()}`, createdAt: now, updatedAt: now }

    const normalizedReceiptNo = form.receiptNo.trim().toUpperCase()
    if (normalizedReceiptNo) {
      const duplicate = expenses.find(
        (e) => e.receiptNo.trim().toUpperCase() === normalizedReceiptNo && e.id !== (editing?.id || '')
      )
      if (duplicate) {
        setDuplicateModal({
          isOpen: true,
          existingExpense: duplicate,
          newExpense: expense
        })
        return
      }
    }

    await saveExpense(expense)
  }

  const handleClearBranchReceipts = async () => {
    if (!branchId) return
    const count = branchExpenses.length
    if (count === 0) { alert('No expense records to clear for this branch.'); return }
    if (!window.confirm(`Are you sure you want to delete ALL ${count} expense record(s) for ${branchName}?\n\nThis action cannot be undone and is usually done before re-adding or re-importing.`)) { return }
    try {
      await clearAuditExpensesByBranch(branchId)
      await reload()
      alert(`Cleared all expense records for ${branchName}.`)
    } catch (err) {
      console.error(err)
      alert('Failed to clear expense records for this branch.')
    }
  }

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return
    const activeEl = document.activeElement as HTMLInputElement
    if (!activeEl) return

    const fields = [
      'receipt-branch',
      'receipt-date',
      'receipt-incurredBy',
      'receipt-description',
      'receipt-company',
      'receipt-receiptNo',
      'receipt-amount',
      'receipt-sourceOfFunds'
    ]

    const index = fields.indexOf(activeEl.id)
    if (index === -1) return

    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (index + 1) % fields.length
      const nextEl = document.getElementById(fields[nextIndex]) as HTMLInputElement
      nextEl?.focus()
      nextEl?.select?.()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (index - 1 + fields.length) % fields.length
      const prevEl = document.getElementById(fields[prevIndex]) as HTMLInputElement
      prevEl?.focus()
      prevEl?.select?.()
    }
  }

  const startEdit = (row: AuditExpense) => {
    setDetailRow(null)
    setEditing(row); setDateRaw(row.date); setDateError(''); setScanPreview(null)
    const resolvedBranchId = resolveFormBranchId(row.branchId)
    setForm({ date: row.date, company: row.company, description: row.description, receiptNo: row.receiptNo, amount: String(row.amount), expenseCategory: row.expenseCategory, sourceOfFunds: row.sourceOfFunds, incurredBy: row.incurredBy, branchId: resolvedBranchId })
    setShowForm(true)
  }

  const openDetails = (row: AuditExpense, e?: React.MouseEvent) => {
    e?.preventDefault()
    setDetailRow(row)
  }

  const handleDeleteRecord = async (row: AuditExpense) => {
    if (!window.confirm('Delete this expense record?')) return
    await deleteAuditExpense(row.id)
    setDetailRow(null)
    await reload()
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
      if (!res.ok) {
        let errorMsg = `Server error ${res.status}`
        try {
          const errData = await res.json() as Record<string, any>
          if (errData && errData.error) {
            errorMsg = String(errData.error)
          } else if (errData && errData.message) {
            errorMsg = String(errData.message)
          }
        } catch (_) {
          // ignore
        }
        throw new Error(errorMsg)
      }
      const data = await res.json() as Record<string, unknown>
      if (data.error) { setScanError(`Scan failed: ${data.error}`); return }

      const scannedDate = data.date ? String(data.date) : ''
      const parsed = scannedDate ? (parseSmartDate(scannedDate) ?? scannedDate) : ''
      const filled = new Set<string>()

      setForm((f) => {
        const next = { ...f }
        if (parsed)                          { next.date = parsed;                              filled.add('date') }
        if (data.company)                    { next.company = String(data.company).toUpperCase();             filled.add('company') }
        
        let desc = data.description ? String(data.description) : ''
        let cat = data.expenseCategory ? String(data.expenseCategory).toUpperCase() : ''
        
        if (cat) { next.expenseCategory = cat as AuditExpenseCategory; filled.add('expenseCategory') }
        
        if (desc) {
          if (cat === 'INSTALLATION MATERIALS' || cat === 'SERVICE MATERIALS') {
             if (!desc.toUpperCase().startsWith('MATERIALS:')) desc = `MATERIALS: ${desc}`
          } else if (cat === 'INCENTIVES') {
             if (!desc.toUpperCase().startsWith('INCENTIVES:')) desc = `INCENTIVES: ${desc}`
          } else if (cat === 'MOBILIZATION') {
             const dUpper = desc.toUpperCase()
             if (dUpper.includes('GAS') || dUpper.includes('FUEL') || dUpper.includes('DIESEL') || dUpper.includes('PETRON') || dUpper.includes('SHELL') || dUpper.includes('CALTEX')) {
                if (!dUpper.startsWith('GAS:')) desc = `GAS: ${desc}`
             } else if (dUpper.includes('TOLL') || dUpper.includes('NLEX') || dUpper.includes('SLEX') || dUpper.includes('SCTEX') || dUpper.includes('CAVITEX') || dUpper.includes('SKYWAY') || dUpper.includes('AUTOSWEEP') || dUpper.includes('EASYTRIP')) {
                if (!dUpper.startsWith('TOLL:')) desc = `TOLL: ${desc}`
             } else if (dUpper.includes('PASSWAY') || dUpper.includes('PARKING')) {
                if (!dUpper.startsWith('PASSWAY:')) desc = `PASSWAY: ${desc}`
             } else {
                if (!dUpper.startsWith('MOBILIZATION:')) desc = `MOBILIZATION: ${desc}`
             }
          }
          next.description = desc
          filled.add('description')
        }

        if (data.receiptNo)                  { next.receiptNo = String(data.receiptNo);         filled.add('receiptNo') }
        
        if (data.amount != null && data.amount !== '') { 
          const numeric = parseFloat(String(data.amount).replace(/,/g, ''))
          if (!isNaN(numeric)) {
             next.amount = numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          } else {
             next.amount = String(data.amount)
          }
          filled.add('amount') 
        }

        let sof = data.sourceOfFunds ? String(data.sourceOfFunds) : ''
        if (!sof && cat) {
           const sourcesForCat = branchExpenses.filter(e => e.expenseCategory === cat && e.sourceOfFunds).map(e => e.sourceOfFunds)
           if (sourcesForCat.length > 0) {
             const counts = sourcesForCat.reduce((acc, curr) => {
               acc[curr] = (acc[curr] || 0) + 1
               return acc
             }, {} as Record<string, number>)
             sof = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
           }
        }
        if (sof) {
           next.sourceOfFunds = sof
           filled.add('sourceOfFunds')
        }

        if (data.incurredBy)                 { next.incurredBy = String(data.incurredBy).toUpperCase();       filled.add('incurredBy') }
        return next
      })
      if (parsed) { setDateRaw(parsed); setDateError('') }
      setScannedFields(filled)
    } catch (err: any) {
      console.error('[ReceiptScan]', err)
      setScanError(err?.message || 'Could not scan receipt. Make sure the backend is running.')
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

  const processImageRef = useRef(processImage)
  useEffect(() => {
    processImageRef.current = processImage
  })

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (scanning) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) {
            const file = new File([blob], 'pasted-receipt.png', { type: item.type })
            void processImageRef.current(file)
            return
          }
        }
      }
    }
    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [scanning])

  const handlePasteClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (scanning) return

    if (!navigator.clipboard || !navigator.clipboard.read) {
      setScanError('Clipboard button is disabled on HTTP. Please press Ctrl+V (or Cmd+V) anywhere on the page to paste the image.')
      return
    }

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



  if (!canAccess) return <div className="p-8 text-center" style={{ color: textMuted }}>Expense records are available for branch employees, managers, and admins only.</div>

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg }} className="flex flex-col gap-4 p-4 md:p-6 pb-12">

      {/* ── HEADER ── */}
      <div className="rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, boxShadow: isLight ? '0 8px 24px rgba(15,23,42,0.06)' : '0 12px 32px rgba(0,0,0,0.24)' }}>
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-lg p-2.5 shrink-0" style={{ backgroundColor: `${accent}14`, border: `1px solid ${accent}2f` }}>
            <ClipboardList size={22} style={{ color: accent }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-black leading-tight" style={{ color: textPrimary }}>Expense Records</h1>
            <p className="text-sm mt-1" style={{ color: textMuted }}>Encode and track daily branch expense records.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (showForm) {
                setShowForm(false); setEditing(null)
              } else {
                setEditing(null); setForm({ ...emptyForm(branchId), date: '' }); setDateRaw(''); setDateError(''); setShowForm(true)
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow transition-all duration-200"
            style={{ backgroundColor: showForm ? '#EF4444' : accent, minWidth: 140, justifyContent: 'center' }}
          >
            {showForm
              ? <><X size={16} /> Close Form</>
              : <><Plus size={16} /> Add Record</>
            }
          </button>
          <button type="button" disabled={!branchId || importing} onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
            <Upload size={16} />{importing ? 'Importing…' : 'Import Excel'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="rounded-xl px-4 py-3 flex flex-col md:flex-row gap-2 items-center"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="hidden md:flex items-center gap-2 shrink-0 pr-1">
          <ListFilter size={16} style={{ color: accent }} />
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: textMuted }}>Filters</span>
        </div>
        {/* Branch selector */}
        <div style={{ position: 'relative' }} className="w-full md:w-72 shrink-0">
          <Building2 size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={isBranchScopedUser && !!user?.branchId}
            className="w-full rounded-lg pl-8 pr-7 py-2.5 text-sm appearance-none outline-none cursor-pointer"
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

        {/* Month selector */}
        {branchId && (
          <div style={{ position: 'relative' }} className="w-full md:w-40 shrink-0">
            <CalendarDays size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full rounded-lg pl-8 pr-7 py-2.5 text-sm appearance-none outline-none cursor-pointer font-semibold"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, colorScheme: isLight ? 'light' : 'dark' }}
            >
              <option value="All">All Months</option>
              {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
          </div>
        )}

        {/* Divider */}
        <div className="hidden md:block w-px self-stretch" style={{ backgroundColor: border }} />

        {/* Search */}
        <div style={{ position: 'relative' }} className="flex-1 w-full">
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, description, date, receipt no…"
            className="w-full rounded-lg pl-8 pr-3 py-2.5 text-sm outline-none"
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
              <div className="rounded-lg px-3 py-2 text-right" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                <div className="text-[11px] font-semibold" style={{ color: textMuted }}>{filtered.length} records</div>
                <div className="text-sm font-black" style={{ color: textPrimary }}>₱{peso(totalFiltered)}</div>
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
              {editing ? 'Edit Expense Record' : 'New Expense Record'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={scanning}
                onClick={handlePasteClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                style={{ backgroundColor: scanning ? `${accent}11` : `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
                title="Paste an image from your clipboard"
              >
                <ClipboardPaste size={13} /> Paste Image
              </button>
              <button
                type="button"
                disabled={scanning}
                onClick={() => scanRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                style={{ backgroundColor: '#3B82F6', color: 'white' }}
                title="Upload or scan a receipt image"
              >
                <Upload size={13} /> Upload Receipt
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
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2" onKeyDown={handleFormKeyDown}>
              {/* Branch */}
              {field(
                'Branch',
                <div style={{ position: 'relative' }}>
                  <Building2 size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
                  <select
                    id="receipt-branch"
                    value={form.branchId}
                    onChange={(e) => {
                      const selectedId = e.target.value
                      setForm((f) => ({ ...f, branchId: selectedId }))
                    }}
                    className="w-full rounded-lg pl-7 pr-7 py-1.5 text-xs appearance-none outline-none cursor-pointer font-medium"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, colorScheme: isLight ? 'light' : 'dark' }}
                  >
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={12} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
                </div>
              )}

              {/* Date */}
              {field(
                <span className="flex items-center gap-1">
                  Date {scannedFields.has('date') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}
                </span> as unknown as string,
                <div>
                  <input value={dateRaw}
                    id="receipt-date"
                    onChange={(e) => { setDateRaw(e.target.value); setDateError(''); clearScanned('date') }}
                    onBlur={(e) => handleDateBlur(e.target.value)}
                    placeholder={latestDateStr}
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
                  id="receipt-incurredBy"
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
                  id="receipt-description"
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
                  id="receipt-company"
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
                  id="receipt-receiptNo"
                  onChange={(e) => { setForm((f) => ({ ...f, receiptNo: e.target.value })); clearScanned('receiptNo') }}
                  placeholder="OR / SI number"
                  className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none transition-all"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('receiptNo') }} />
              )}

              {/* Amount */}
              {field(
                <span className="flex items-center gap-1">Amount (₱) {scannedFields.has('amount') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <input type="text" value={form.amount}
                  id="receipt-amount"
                  onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); clearScanned('amount') }}
                  onBlur={(e) => {
                    const numeric = parseFloat(e.target.value.replace(/,/g, ''))
                    if (!isNaN(numeric)) {
                       setForm((f) => ({ ...f, amount: numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }))
                    }
                  }}
                  placeholder="0.00"
                  className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none transition-all"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('amount') }} />
              )}

              {/* Source of Funds */}
              {field(
                <span className="flex items-center gap-1">Source of Funds {scannedFields.has('sourceOfFunds') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <AutoSuggestInput value={form.sourceOfFunds}
                  id="receipt-sourceOfFunds"
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
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: textMuted }}>Expense Category</label>
              <button
                type="button"
                onClick={() => setIsEditingCategories(!isEditingCategories)}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all hover:scale-105"
                style={{
                  border: `1.5px solid ${isEditingCategories ? accent : inputBorder}`,
                  backgroundColor: isEditingCategories ? `${accent}18` : inputBg,
                  color: isEditingCategories ? accent : textMuted
                }}
              >
                <Settings size={12} />
                {isEditingCategories ? 'Done Managing' : 'Manage Categories'}
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2 mt-3">
              {isEditingCategories ? (
                // --- Edit Mode / Reorder Mode ---
                categories.map((cat, idx) => {
                  const isEditingThis = editingCategoryDetail?.id === cat.id
                  return (
                    <div
                      key={cat.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-move select-none shadow-sm"
                      style={{
                        border: `1.5px dashed ${draggedIndex === idx ? accent : inputBorder}`,
                        backgroundColor: inputBg,
                        color: textPrimary,
                        opacity: draggedIndex === idx ? 0.4 : 1,
                      }}
                    >
                      {isEditingThis ? (
                        <input
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              await handleSaveCategoryName(cat)
                            }
                            if (e.key === 'Escape') {
                              setEditingCategoryDetail(null)
                            }
                          }}
                          className="px-1 py-0.5 rounded border text-xs outline-none bg-transparent"
                          style={{ borderColor: accent, color: textPrimary, width: 90 }}
                          autoFocus
                        />
                      ) : (
                        <span onDoubleClick={() => startEditingCategoryName(cat)} className="truncate max-w-[120px]" title="Double click to edit">{cat.name}</span>
                      )}
                      
                      <div className="flex items-center gap-1 border-l pl-2" style={{ borderColor: inputBorder }}>
                        {isEditingThis ? (
                          <button type="button" onClick={() => handleSaveCategoryName(cat)} style={{ color: accent }} className="font-bold">✓</button>
                        ) : (
                          <button type="button" onClick={() => startEditingCategoryName(cat)} style={{ color: textMuted }} className="hover:text-emerald-500"><Pencil size={11} /></button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`Delete category "${cat.name}"?`)) {
                              try {
                                await deleteAuditExpenseCategory(cat.id)
                                await reloadCategories()
                              } catch {
                                alert('Failed to delete category.')
                              }
                            }
                          }}
                          style={{ color: danger }}
                          className="hover:opacity-80"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                // --- Normal Mode ---
                allCategories.map((cat) => (
                  <button key={cat} type="button" onClick={() => setForm((f) => ({ ...f, expenseCategory: cat as AuditExpenseCategory }))}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-102"
                    style={{ border: `1px solid ${form.expenseCategory === cat ? accent : inputBorder}`, backgroundColor: form.expenseCategory === cat ? `${accent}22` : inputBg, color: form.expenseCategory === cat ? accent : textMuted }}>
                    {cat}
                  </button>
                ))
              )}

              {/* Add custom category */}
              {addingCategory ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={newCategoryRef}
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveCustomCategory() } if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryInput('') } }}
                    placeholder="Category name"
                    className="px-2 py-1 rounded-lg text-xs font-semibold outline-none w-32"
                    style={{ border: `1px solid ${accent}`, backgroundColor: inputBg, color: textPrimary }}
                  />
                  <button type="button" onClick={() => void saveCustomCategory()} className="px-2 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-90" style={{ backgroundColor: accent }}>Add</button>
                  <button type="button" onClick={() => { setAddingCategory(false); setNewCategoryInput('') }} className="px-2 py-1 rounded-lg text-xs font-semibold" style={{ color: textMuted, backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingCategory(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 hover:scale-102"
                  style={{ border: `1px dashed ${inputBorder}`, backgroundColor: inputBg, color: textMuted }}>
                  <Plus size={11} /> New
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 text-sm rounded-lg" style={{ color: textMuted, backgroundColor: inputBg, border: `1px solid ${inputBorder}` }} disabled={savingReceipt}>Cancel</button>
            <button type="button" onClick={submitReceipt} className="px-5 py-2 rounded-xl text-sm font-semibold text-white shadow flex items-center gap-2 justify-center" style={{ backgroundColor: accent }} disabled={savingReceipt}>
              {savingReceipt ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : (editing ? 'Update Record' : 'Save Record')}
            </button>
          </div>
        </div>
      )}

      {/* ── RECEIPT TABLE / DAILY LOG ── */}
      {branchId && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="min-w-0">
              <h2 className="text-sm font-black truncate" style={{ color: textPrimary }}>
                {branchName}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: textMuted }}>
                {filterMonth === 'All' ? 'All months' : filterMonth}{search ? ' · Filtered' : ''} · ₱{peso(totalFiltered)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg p-1" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                <button type="button" onClick={() => setViewAll(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                  style={{ backgroundColor: !viewAll ? cardBg : 'transparent', color: !viewAll ? accent : textMuted }}>
                  <LayoutList size={14} /> Daily
                </button>
                <button type="button" onClick={() => setViewAll(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                  style={{ backgroundColor: viewAll ? cardBg : 'transparent', color: viewAll ? accent : textMuted }}>
                  <Table2 size={14} /> Table
                </button>
              </div>
              <button type="button" onClick={handleExportExcel}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
                title="Export filtered expense records to Excel">
                <Download size={14} /> Export
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center" style={{ color: textMuted }}>
              No expense records found. {!search && 'Add records manually or import from Excel.'}
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
                    <tr key={row.id}
                      onContextMenu={(e) => openDetails(row, e)}
                      onDoubleClick={() => openDetails(row)}
                      title="Right-click to view details"
                      style={{ borderTop: `1px solid ${border}`, backgroundColor: i % 2 ? (isLight ? '#f8fafc' : '#0d1520') : undefined, cursor: 'context-menu' }}>
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
                          <button type="button" onClick={() => openDetails(row)}><Receipt size={13} style={{ color: textMuted }} /></button>
                          <button type="button" onClick={() => startEdit(row)}><Pencil size={13} style={{ color: accent }} /></button>
                          <button type="button" onClick={() => void handleDeleteRecord(row)}><Trash2 size={13} style={{ color: danger }} /></button>
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
                      <span className="font-black text-sm" style={{ color: textPrimary }}>{date}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: textMuted }}>{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
                        <span className="font-bold text-sm" style={{ color: accent }}>₱{peso(dayTotal)}</span>
                      </div>
                    </div>
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between px-5 py-3 text-sm transition-colors"
                        onContextMenu={(e) => openDetails(row, e)}
                        onDoubleClick={() => openDetails(row)}
                        title="Right-click to view details"
                        style={{ borderTop: `1px solid ${border}`, cursor: 'context-menu' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = rowHover }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}>
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold truncate" style={{ color: textPrimary }}>{row.description || row.company}</span>
                          <span className="text-xs truncate" style={{ color: textMuted }}>
                            {row.company}{row.receiptNo ? ` · OR#${row.receiptNo}` : ''} · {row.incurredBy} · {row.expenseCategory}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 ml-3 shrink-0">
                          <span className="font-bold" style={{ color: textPrimary }}>₱{peso(row.amount)}</span>
                          <button type="button" onClick={() => openDetails(row)}><Receipt size={14} style={{ color: textMuted }} /></button>
                          <button type="button" onClick={() => startEdit(row)}><Pencil size={14} style={{ color: accent }} /></button>
                          <button type="button" onClick={() => void handleDeleteRecord(row)}><Trash2 size={14} style={{ color: danger }} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Danger zone footer ── */}
          {branchExpenses.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 mt-0"
              style={{ borderTop: `1px solid ${danger}33`, backgroundColor: `${danger}08` }}>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: danger }}>Danger Zone</span>
                <span className="text-xs" style={{ color: textMuted }}>Permanently deletes all {branchExpenses.length} expense record{branchExpenses.length !== 1 ? 's' : ''} for <strong style={{ color: textPrimary }}>{branchName}</strong>. This cannot be undone.</span>
              </div>
              <button type="button" onClick={handleClearBranchReceipts}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 shrink-0 ml-4"
                style={{ backgroundColor: 'transparent', border: `1.5px solid ${danger}`, color: danger }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = danger; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = danger }}>
                <Trash2 size={14} /> Clear All Records
              </button>
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

      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          onClick={() => setDetailRow(null)}>
          <div className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex items-center gap-2">
                <Receipt size={18} style={{ color: accent }} />
                <div>
                  <h3 className="font-bold" style={{ color: textPrimary }}>Expense Record Details</h3>
                  <p className="text-xs" style={{ color: textMuted }}>{detailRow.branchName} - {detailRow.date}</p>
                </div>
              </div>
              <button type="button" onClick={() => setDetailRow(null)} className="p-2 rounded-lg" style={{ color: textMuted }}>
                <X size={18} />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[
                ['Input by', detailRow.inputBy || 'Unknown'],
                ['Incurred by', detailRow.incurredBy || '-'],
                ['Company', detailRow.company || '-'],
                ['Receipt No.', detailRow.receiptNo || '-'],
                ['Category', detailRow.expenseCategory || '-'],
                ['Source', detailRow.sourceOfFunds || '-'],
                ['Created', detailRow.createdAt ? new Date(detailRow.createdAt).toLocaleString('en-PH') : '-'],
                ['Updated', detailRow.updatedAt ? new Date(detailRow.updatedAt).toLocaleString('en-PH') : '-'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl p-3" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                  <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>{label}</div>
                  <div className="mt-1 font-semibold break-words" style={{ color: textPrimary }}>{value}</div>
                </div>
              ))}
              <div className="sm:col-span-2 rounded-xl p-3" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>Description</div>
                <div className="mt-1 font-semibold whitespace-pre-wrap" style={{ color: textPrimary }}>{detailRow.description || '-'}</div>
              </div>
              <div className="sm:col-span-2 rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: `${accent}12`, border: `1px solid ${accent}33` }}>
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: textMuted }}>Amount</span>
                <span className="text-xl font-black" style={{ color: accent }}>₱{peso(detailRow.amount)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: `1px solid ${border}` }}>
              <button type="button" onClick={() => startEdit(detailRow)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: accent }}>
                <Pencil size={14} /> Edit
              </button>
              <button type="button" onClick={() => void handleDeleteRecord(detailRow)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ color: danger, border: `1px solid ${danger}` }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: cardBg,
            border: `1px solid ${border}`,
            borderRadius: '1rem',
            width: '100%',
            maxWidth: '680px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: `1px solid ${border}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{
                backgroundColor: `${danger}22`,
                padding: '0.5rem',
                borderRadius: '0.75rem'
              }}>
                <AlertTriangle size={20} style={{ color: danger }} />
              </div>
              <div>
                <h3 style={{ color: textPrimary, fontWeight: 'bold', fontSize: '1.125rem', margin: 0 }}>
                  Duplicate Expense Record Detected
                </h3>
                <p style={{ color: textMuted, fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                  Receipt number <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: textPrimary }}>{duplicateModal.newExpense.receiptNo}</span> already exists.
                </p>
              </div>
            </div>

            {/* Modal Body - Side-by-Side Comparison */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                
                {/* Existing Record */}
                <div style={{
                  border: `1px solid ${border}`,
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  backgroundColor: isLight ? '#f8fafc' : '#0F1A2E'
                }}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: textMuted,
                    textTransform: 'uppercase',
                    marginBottom: '0.75rem',
                    borderBottom: `1px solid ${border}`,
                    paddingBottom: '0.25rem'
                  }}>
                    Existing Record
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <div>
                      <strong style={{ color: textMuted }}>Branch:</strong> <span style={{ color: textPrimary }}>{duplicateModal.existingExpense.branchName}</span>
                    </div>
                    <div>
                      <strong style={{ color: textMuted }}>Date:</strong> <span style={{
                        color: duplicateModal.existingExpense.date === duplicateModal.newExpense.date ? textPrimary : '#EF4444',
                        fontWeight: duplicateModal.existingExpense.date === duplicateModal.newExpense.date ? 'normal' : 'bold'
                      }}>{duplicateModal.existingExpense.date}</span>
                    </div>
                    <div>
                      <strong style={{ color: textMuted }}>Company:</strong> <span style={{ color: textPrimary }}>{duplicateModal.existingExpense.company}</span>
                    </div>
                    <div>
                      <strong style={{ color: textMuted }}>Amount:</strong> <span style={{ color: textPrimary, fontWeight: 'bold' }}>₱{peso(duplicateModal.existingExpense.amount)}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: textMuted, marginTop: '0.5rem', fontStyle: 'italic' }}>
                      Incurred By: {duplicateModal.existingExpense.incurredBy}
                    </div>
                  </div>
                </div>

                {/* New Record */}
                <div style={{
                  border: `1px solid ${accent}44`,
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  backgroundColor: `${accent}05`
                }}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: accent,
                    textTransform: 'uppercase',
                    marginBottom: '0.75rem',
                    borderBottom: `1px solid ${accent}22`,
                    paddingBottom: '0.25rem'
                  }}>
                    New Record Details
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <div>
                      <strong style={{ color: textMuted }}>Branch:</strong> <span style={{ color: textPrimary }}>{duplicateModal.newExpense.branchName}</span>
                    </div>
                    <div>
                      <strong style={{ color: textMuted }}>Date:</strong> <span style={{
                        color: duplicateModal.existingExpense.date === duplicateModal.newExpense.date ? textPrimary : '#EF4444',
                        fontWeight: duplicateModal.existingExpense.date === duplicateModal.newExpense.date ? 'normal' : 'bold'
                      }}>{duplicateModal.newExpense.date}</span>
                    </div>
                    <div>
                      <strong style={{ color: textMuted }}>Company:</strong> <span style={{ color: textPrimary }}>{duplicateModal.newExpense.company}</span>
                    </div>
                    <div>
                      <strong style={{ color: textMuted }}>Amount:</strong> <span style={{ color: textPrimary, fontWeight: 'bold' }}>₱{peso(duplicateModal.newExpense.amount)}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: textMuted, marginTop: '0.5rem', fontStyle: 'italic' }}>
                      Incurred By: {duplicateModal.newExpense.incurredBy}
                    </div>
                  </div>
                </div>

              </div>

              {duplicateModal.existingExpense.date !== duplicateModal.newExpense.date && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: isLight ? '#FFFBEB' : '#3C2204',
                  border: `1px solid ${isLight ? '#F59E0B' : '#B45309'}`,
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  color: isLight ? '#B45309' : '#FBBF24',
                  fontSize: '0.825rem'
                }}>
                  <AlertTriangle size={16} />
                  <span>Notice: The dates of these two receipts differ. Please double check before updating.</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              backgroundColor: isLight ? '#f8fafc' : '#0B132B',
              borderTop: `1px solid ${border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem'
            }}>
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${border}`,
                  color: textPrimary,
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  fontWeight: 'semibold'
                }}
              >
                Cancel / Edit
              </button>
              <button
                type="button"
                onClick={confirmUpdateDuplicate}
                style={{
                  backgroundColor: danger,
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                Update Existing Record
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
