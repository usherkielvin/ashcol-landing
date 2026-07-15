import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Upload, Receipt, ReceiptText, Building2, Plus, Trash2, Pencil, Settings, FileSpreadsheet, Search, X, Loader2, ChevronDown, ClipboardPaste, Download, AlertTriangle, ClipboardList, CalendarDays, Camera } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatRole, formatDisplayUserLabel, isSameBaseBranch, isPortalAdmin, resolveArchivesBranchFilter } from '../utils/api'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
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
const historyDateTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const time = date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${time} · ${dateStr}`
}
const expenseRecordHistory = (row: AuditExpense) => {
  const stored = row.updateHistory || []
  const fallback = []
  if (!stored.some((entry) => entry.action === 'created') && row.createdAt) {
    fallback.push({ action: 'created' as const, by: row.createdBy || row.inputBy || 'Unknown', at: row.createdAt })
  }
  if (!stored.some((entry) => entry.action === 'updated') && row.updatedAt && row.updatedAt !== row.createdAt) {
    fallback.push({ action: 'updated' as const, by: row.updatedBy || 'Unknown', at: row.updatedAt })
  }
  return [...fallback, ...stored].sort((a, b) => (a.at || '').localeCompare(b.at || ''))
}
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
  const editAccent = '#6366F1'
  const editAlertBg = isLight ? '#EEF2FF' : 'rgba(99, 102, 241, 0.08)'
  const editAlertBorder = isLight ? '#C7D2FE' : 'rgba(99, 102, 241, 0.2)'
  const editAlertText = isLight ? '#4F46E5' : '#818CF8'

  const role = (user?.role || '').toLowerCase()
  const currentUserLabel = user?.jobTitle
    ? `${user?.name || user?.email} - ${user.jobTitle}`
    : `${user?.name || user?.email || 'STAFF'} - ${formatRole(user?.role || 'USER')}`
  const isAdmin = isPortalAdmin(role)
  const isManager = role === 'manager'
  const isBranchScopedUser = !isAdmin && !!user?.branchId
  const canAccess = isAdmin || isManager || role === 'staff' || role === 'employee' || role === 'oic'

  const [branches, setBranches] = useState<BranchOption[]>([])
  const [allBranches, setAllBranches] = useState<BranchOption[]>([])
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
  const [actionMenuRow, setActionMenuRow] = useState<AuditExpense | null>(null)
  const [isEditingInModal, setIsEditingInModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const activeAccent = editing ? editAccent : accent
  const [dateRaw, setDateRaw] = useState(formatTodayReceiptDate())
  const [dateError, setDateError] = useState('')
  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState('All')
  const [sortConfig] = useState<{ key: keyof AuditExpense; direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' })
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set())
  const [scanError, setScanError] = useState('')
  const [savingReceipt, setSavingReceipt] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [branchEmployees, setBranchEmployees] = useState<string[]>([])

  // --- Tab state ---
  const activeTab = 'expenses'

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
    const list = allBranches.length > 0 ? allBranches : branches
    const exists = list.some(b => b.id === id)
    if (!exists) {
      const splitOption = list.find(b => b.id.startsWith(`${id}-`))
      if (splitOption) {
        const salesOption = list.find(b => b.id === `${id}-sales`)
        return salesOption ? salesOption.id : splitOption.id
      }
    }
    return id
  }, [branches, allBranches])

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
      if (!e.branchId) return false
      
      const eBidLower = e.branchId.toLowerCase().trim()
      const selBidLower = branchId.toLowerCase().trim()
      
      // Exact match
      if (eBidLower === selBidLower) return true
      
      // If we are filtering for a "-sales" branch
      if (selBidLower.endsWith('-sales')) {
        const baseSel = selBidLower.replace(/-sales$/, '')
        const baseE = eBidLower.replace(/-(sales|services|service)$/, '')
        
        const isExpenseService = eBidLower.endsWith('-services') || eBidLower.endsWith('-service') || 
                                 (e.branchName && (e.branchName.toLowerCase().includes('service') || e.branchName.toLowerCase().includes('services')))
                                 
        if ((baseE === baseSel || (baseSel.includes('taguig') && baseE.includes('taguig'))) && !isExpenseService) return true
        
        // Legacy Taguig Sales IDs
        if (baseSel.includes('taguig')) {
          if (eBidLower === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-sales' || eBidLower === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') return true
          const nameUpper = (e.branchName || '').toUpperCase()
          if ((nameUpper === 'ASHCOL TAGUIG' || nameUpper === 'TAGUIG' || nameUpper.includes('TAGUIG SALES') || nameUpper.includes('TAGUIG - SALES')) && !isExpenseService) return true
        }
      }
      
      // If we are filtering for a "-services" branch
      if (selBidLower.endsWith('-services') || selBidLower.endsWith('-service')) {
        const baseSel = selBidLower.replace(/-(services|service)$/, '')
        const baseE = eBidLower.replace(/-(sales|services|service)$/, '')
        
        const isExpenseService = eBidLower.endsWith('-services') || eBidLower.endsWith('-service') || 
                                 (e.branchName && (e.branchName.toLowerCase().includes('service') || e.branchName.toLowerCase().includes('services')))
                                 
        if ((baseE === baseSel || (baseSel.includes('taguig') && baseE.includes('taguig'))) && isExpenseService) return true
        
        // Legacy Taguig Services IDs
        if (baseSel.includes('taguig')) {
          if (eBidLower === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-services') return true
          const nameUpper = (e.branchName || '').toUpperCase()
          if (nameUpper.includes('TAGUIG') && (nameUpper.includes('SERVICE') || nameUpper.includes('SERVICES'))) return true
        }
      }
      
      return false
    }).map(e => ({
      ...e,
      date: parseSmartDate(e.date) || e.date
    }))
  }, [expenses, branchId])

  // Suggestions derived from past expenses (limited to current branch)
  const suggestions = useMemo(() => {
    const companies = [...new Set(branchExpenses.map((e) => e.company).filter(Boolean))].sort()
    const descs = [...new Set(branchExpenses.map((e) => e.description).filter(Boolean))].sort()
    
    const peopleSet = new Set<string>()
    branchExpenses.map((e) => e.incurredBy).filter(Boolean).forEach(p => peopleSet.add(p.toUpperCase().trim()))
    branchEmployees.forEach(name => peopleSet.add(name))
    const people = Array.from(peopleSet).sort()
    
    const sources = [...new Set(branchExpenses.map((e) => e.sourceOfFunds).filter(Boolean))].sort()
    return { companies, descs, people, sources }
  }, [branchExpenses, branchEmployees])

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
      const parsed = new Date(maxDateStr)
      if (!isNaN(parsed.getTime())) targetDate = parsed
    }
    return targetDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).toUpperCase()
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
        return id === 'BR-TAGUIG-SALES-EXPLICIT' || (name.includes('TAGUIG') && name.includes('SALES') && id !== 'BR-TAGUIG-SALES')
      })
      const hasExplicitTaguigServices = list.some(b => {
        const id = b.id.toUpperCase()
        const name = b.name.toUpperCase()
        return id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || name.includes('TAGUIG') && name.includes('SERVICE')
      })
      
      const newList: BranchOption[] = []
      for (const b of list) {
        const cleanName = b.name.replace(/^(ashcol\s+)/i, '')
        const cleanNameUpper = cleanName.toUpperCase()
        if (cleanNameUpper === 'TAGUIG' || cleanNameUpper === 'ASHCOL TAGUIG') {
          if (!hasExplicitTaguigSales) newList.push({ id: `${b.id}-sales`, name: 'TAGUIG - SALES' })
          if (!hasExplicitTaguigServices) newList.push({ id: `${b.id}-services`, name: 'TAGUIG - SERVICES' })
        } else if (cleanNameUpper.includes('TAGUIG')) {
          const isServ = cleanNameUpper.includes('SERVICE')
          newList.push({
            id: isServ ? `${b.id}-services` : `${b.id}-sales`,
            name: isServ ? 'TAGUIG - SERVICES' : 'TAGUIG - SALES'
          })
        } else {
          newList.push({ id: b.id, name: cleanName })
        }
      }

      newList.sort((a, b) => a.name.localeCompare(b.name))

      let finalList = newList
      if (isBranchScopedUser && user?.branchId) {
        const userBranchLower = user.branchId.toLowerCase()
        const isUserTaguig = userBranchLower.includes('taguig') || userBranchLower.startsWith('2880c29e-581c-11f1-bf8c-74d4dd6dfc0b')
        finalList = newList.filter(b => {
          if (isUserTaguig) {
            const emailLower = (user?.email || '').toLowerCase()
            const isServicesUser = userBranchLower.includes('service') || emailLower.includes('service')
            const bNameUpper = b.name.toUpperCase()
            if (isServicesUser) {
              return bNameUpper.includes('SERVICE') || bNameUpper.includes('SERVICES')
            } else {
              return bNameUpper.includes('SALES')
            }
          } else {
            const userBranchIdUpper = user.branchId!.toUpperCase()
            const bIdUpper = b.id.toUpperCase()
            return bIdUpper === userBranchIdUpper || 
                   bIdUpper.startsWith(userBranchIdUpper + '-') || 
                   userBranchIdUpper.startsWith(bIdUpper + '-')
          }
        })
      }

      setBranches(finalList)
      setAllBranches(newList)

      if (finalList.length > 0) {
        if (isBranchScopedUser && user?.branchId) {
          const userBranchLower = user.branchId.toLowerCase()
          const isUserTaguig = userBranchLower.includes('taguig') || userBranchLower.startsWith('2880c29e-581c-11f1-bf8c-74d4dd6dfc0b')
          if (isUserTaguig) {
            const emailLower = (user?.email || '').toLowerCase()
            const isServicesUser = userBranchLower.includes('service') || emailLower.includes('service')
            const matched = finalList.find(b => {
              const bNameUpper = b.name.toUpperCase()
              return isServicesUser ? bNameUpper.includes('SERVICE') : bNameUpper.includes('SALES')
            })
            setBranchId(matched ? matched.id : (finalList[0]?.id ?? ''))
          } else {
            const userBranchIdUpper = user.branchId.toUpperCase()
            const exactMatch = finalList.find(b => b.id.toUpperCase() === userBranchIdUpper)
            setBranchId(exactMatch ? exactMatch.id : (finalList[0]?.id ?? ''))
          }
        } else {
          const storedGlobal = localStorage.getItem('ashcol-global-branch-id')
          const resolved = resolveArchivesBranchFilter(storedGlobal, finalList, user)
          const nextId = resolved || finalList[0]?.id || ''
          setBranchId(nextId)
          if (isAdmin && !storedGlobal && nextId) {
            localStorage.setItem('ashcol-global-branch-id', nextId)
            window.dispatchEvent(new Event('ashcol-global-branch-change'))
          }
        }
      }
    } catch (e) { console.error(e) }
  }, [isBranchScopedUser, user, user?.branchId, user?.email, isAdmin])

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
    if (!isAdmin || branches.length === 0) return
    const syncFromGlobal = () => {
      const gId = localStorage.getItem('ashcol-global-branch-id')
      const resolved = resolveArchivesBranchFilter(gId, branches, user)
      if (resolved) {
        setBranchId((prev) => (prev !== resolved ? resolved : prev))
      }
    }
    syncFromGlobal()
    window.addEventListener('ashcol-global-branch-change', syncFromGlobal)
    return () => window.removeEventListener('ashcol-global-branch-change', syncFromGlobal)
  }, [isAdmin, branches, user])

  useEffect(() => {
    if (!branchId) return
    const fetchEmployees = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          const list = data?.data || []
          const names = list
            .filter((emp: any) => {
              return isSameBaseBranch(emp.branchId, branchId) && emp.isActive !== false && emp.name?.trim()
            })
            .map((emp: any) => emp.name.toUpperCase().trim())
          setBranchEmployees(names)
        }
      } catch (err) {
        console.error('Error fetching employees for suggestions:', err)
      }
    }
    void fetchEmployees()
  }, [branchId])

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
    const now = new Date()
    months.add(now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase())
    
    for (const e of branchExpenses) {
      if (!e.date) continue
      const d = new Date(e.date)
      if (!isNaN(d.getTime())) {
        months.add(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase())
      }
    }
    return Array.from(months).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  }, [branchExpenses])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = [...branchExpenses]

    if (filterMonth !== 'All') {
      rows = rows.filter(e => {
        if (!e.date) return false
        const d = new Date(e.date)
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() === filterMonth
        }
        return false
      })
    }

    if (q) {
      rows = rows.filter((e) =>
        (e.company || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.receiptNo || '').toLowerCase().includes(q) ||
        (e.incurredBy || '').toLowerCase().includes(q) ||
        (e.date || '').toLowerCase().includes(q)
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
      if (isEditingInModal) {
        setIsEditingInModal(false)
        setDetailRow(expense)
        setEditing(null)
        setForm(emptyForm(resolveFormBranchId(branchId)))
        setDateRaw(formatTodayReceiptDate())
        setDateError('')
      } else {
        // Updating an existing receipt — close the form
        setShowForm(false); setEditing(null); setForm(emptyForm(resolveFormBranchId(branchId))); setDateRaw(formatTodayReceiptDate()); setDateError('')
        setScanPreview(null); setScannedFields(new Set()); setScanError('')
      }
    } else {
      // New receipt saved — keep form open, clear fields (including date) for next entry
      setForm({ ...emptyForm(resolveFormBranchId(branchId)), date: '' }); setDateRaw(''); setDateError('')
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
      inputBy: existingExpense.inputBy || existingExpense.createdBy || newExpense.inputBy,
      createdBy: existingExpense.createdBy || existingExpense.inputBy || newExpense.createdBy,
      createdAt: existingExpense.createdAt || newExpense.createdAt,
      updatedBy: currentUserLabel,
      updateHistory: [
        ...(existingExpense.updateHistory || []),
        { action: 'updated', by: currentUserLabel, at: newExpense.updatedAt }
      ]
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
    const targetBranchName = (allBranches.length > 0 ? allBranches : branches).find(b => b.id === targetBranchId)?.name || branchName

    const expense: AuditExpense = editing
      ? {
        ...editing,
        branchId: targetBranchId,
        branchName: targetBranchName,
        date: form.date.trim(),
        company: form.company.trim().toUpperCase(),
        incurredBy: (form.incurredBy.trim() || user?.name || 'STAFF').toUpperCase(),
        description: form.description.trim(),
        receiptNo: form.receiptNo.trim(),
        amount,
        expenseCategory: form.expenseCategory,
        sourceOfFunds: form.sourceOfFunds.trim(),
        updatedBy: currentUserLabel,
        updatedAt: now,
        updateHistory: [
          ...(editing.updateHistory || []),
          { action: 'updated', by: currentUserLabel, at: now }
        ]
      }
      : {
        id: createExpenseId(),
        branchId: targetBranchId,
        branchName: targetBranchName,
        date: form.date.trim(),
        incurredBy: (form.incurredBy.trim() || user?.name || 'STAFF').toUpperCase(),
        company: form.company.trim().toUpperCase(),
        description: form.description.trim(),
        receiptNo: form.receiptNo.trim(),
        amount,
        expenseCategory: form.expenseCategory,
        sourceOfFunds: form.sourceOfFunds.trim(),
        inputBy: currentUserLabel,
        createdBy: currentUserLabel,
        updatedBy: currentUserLabel,
        createdAt: now,
        updatedAt: now,
        updateHistory: [{ action: 'created', by: currentUserLabel, at: now }]
      }

    const normalizedReceiptNo = (form.receiptNo || '').trim().toUpperCase()
    if (normalizedReceiptNo) {
      const duplicate = expenses.find(
        (e) => (e.receiptNo || '').trim().toUpperCase() === normalizedReceiptNo && e.id !== (editing?.id || '')
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

  const startEditInModal = (row: AuditExpense) => {
    setEditing(row)
    setDateRaw(row.date)
    setDateError('')
    setScanPreview(null)
    const resolvedBranchId = resolveFormBranchId(row.branchId)
    setForm({ date: row.date, company: row.company, description: row.description, receiptNo: row.receiptNo, amount: String(row.amount), expenseCategory: row.expenseCategory, sourceOfFunds: row.sourceOfFunds, incurredBy: row.incurredBy, branchId: resolvedBranchId })
    setIsEditingInModal(true)
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

  const handleCameraClick = () => {
    if (!showForm) {
      setEditing(null)
      setForm({ ...emptyForm(resolveFormBranchId(branchId)), date: '' })
      setDateRaw('')
      setDateError('')
      setShowForm(true)
      setTimeout(() => cameraRef.current?.click(), 150)
    } else {
      cameraRef.current?.click()
    }
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
    <div style={{ minHeight: '100vh', backgroundColor: bg }} className="flex flex-col gap-3 px-2 py-3 md:p-6 pb-12">

      {/* ── HEADER & FILTERS COMBINED ── */}
      <div className="rounded-xl px-4 py-3 flex flex-col gap-3"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.05)' : '0 1px 2px rgba(0,0,0,0.2)' }}>
        
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList size={18} style={{ color: accent }} className="shrink-0" />
            <h1 className="text-sm md:text-base font-black tracking-tight" style={{ color: textPrimary }}>Expense Records</h1>
          </div>
          {activeTab === 'expenses' && (
            <>
              {/* ── Mobile: 3-column action grid ── */}
              <div className="grid grid-cols-3 gap-2 sm:hidden w-full">
                <button
                  type="button"
                  onClick={() => {
                    if (showForm) {
                      setShowForm(false); setEditing(null)
                    } else {
                      setEditing(null); setForm({ ...emptyForm(resolveFormBranchId(branchId)), date: '' }); setDateRaw(''); setDateError(''); setShowForm(true)
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-xl text-xs font-bold text-white transition-all active:scale-95 shadow-sm"
                  style={{ backgroundColor: showForm ? '#EF4444' : accent }}
                >
                  {showForm ? <X size={20} /> : <Plus size={20} />}
                  <span>{showForm ? 'Close' : 'Add Record'}</span>
                </button>
                <button
                  type="button"
                  disabled={scanning}
                  onClick={handleCameraClick}
                  className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-xl text-xs font-bold text-white transition-all active:scale-95 shadow-sm"
                  style={{ backgroundColor: '#6366F1', opacity: scanning ? 0.6 : 1 }}
                  title="Open camera to scan receipt"
                >
                  <Camera size={20} />
                  <span>Scan</span>
                </button>
                <button
                  type="button"
                  disabled={!branchId || importing}
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                >
                  <Upload size={20} />
                  <span>{importing ? 'Importing…' : 'Import'}</span>
                </button>
              </div>

              {/* ── Desktop: original inline buttons ── */}
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (showForm) {
                      setShowForm(false); setEditing(null)
                    } else {
                      setEditing(null); setForm({ ...emptyForm(resolveFormBranchId(branchId)), date: '' }); setDateRaw(''); setDateError(''); setShowForm(true)
                    }
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-all duration-200"
                  style={{ backgroundColor: showForm ? '#EF4444' : accent }}
                >
                  {showForm
                    ? <><X size={13} /> Close</>
                    : <><Plus size={13} /> Add Record</>
                  }
                </button>
                <button type="button" disabled={!branchId || importing} onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                  <Upload size={13} />{importing ? 'Importing…' : 'Import'}
                </button>
              </div>

              {/* Hidden inputs */}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanImage} />
            </>
          )}
        </div>

        {/* Divider line */}
        <div style={{ height: '1px', backgroundColor: border }} className="w-full opacity-60" />

        {/* Filters Row */}
        <div className="flex flex-nowrap items-center gap-2">
          {/* Branch selector — hidden on mobile */}
          <div style={{ position: 'relative' }} className="hidden sm:block w-64 shrink-0">
            <Building2 size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
            <select
              value={branchId}
              onChange={(e) => {
                const val = e.target.value
                setBranchId(val)
                if (isAdmin) {
                  localStorage.setItem('ashcol-global-branch-id', val)
                  window.dispatchEvent(new Event('ashcol-global-branch-change'))
                }
              }}
              disabled={true}
              className="w-full rounded-lg pl-7 pr-7 py-2 text-xs appearance-none outline-none cursor-not-allowed font-medium"
              style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', border: `1px solid ${inputBorder}`, color: textMuted, colorScheme: isLight ? 'light' : 'dark' }}
            >
              {branches.length === 0
                ? <option value="">Loading…</option>
                : <option value="" disabled>Select branch…</option>
              }
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <ChevronDown size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
          </div>

          {/* Month picker — compact on mobile */}
          {activeTab === 'expenses' && branchId && (
            <div style={{ position: 'relative' }} className="shrink-0">
              <CalendarDays size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="rounded-lg pl-6 pr-5 py-2 text-xs appearance-none outline-none cursor-pointer font-bold"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, colorScheme: isLight ? 'light' : 'dark', maxWidth: 130 }}
              >
                <option value="All">All Months</option>
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown size={10} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
            </div>
          )}

          {/* Search — compact */}
          <div style={{ position: 'relative' }} className="flex-1 min-w-0">
            <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg pl-7 pr-7 py-2 text-sm sm:text-xs outline-none"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: textMuted }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── ENTRY FORM (PORTALED) ── */}
      {showForm && typeof document !== 'undefined' && createPortal(
        <>
          <div className="sm:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => { setShowForm(false); setEditing(null); setScanPreview(null) }} />
          
          <div
          className="fixed sm:static inset-0 sm:inset-auto z-[100] sm:z-auto rounded-none sm:rounded-2xl flex flex-col gap-4 p-5 pb-8 sm:p-4 overflow-y-auto overscroll-contain h-[100dvh] sm:h-auto sm:max-h-none"
          style={{ backgroundColor: cardBg, boxShadow: `0 -8px 30px rgba(0,0,0,0.2)` }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full pt-2 sm:pt-0">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: textPrimary }}>
                <div className="rounded-lg p-2" style={{ backgroundColor: `${activeAccent}22` }}><ReceiptText size={18} style={{ color: activeAccent }} /></div>
                {editing ? (
                  <span className="flex items-center gap-2 tracking-wide uppercase">
                    EDIT RECEIPT
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: editAccent }}>
                      EDITING
                    </span>
                  </span>
                ) : (
                  <span className="tracking-wide uppercase">ADD NEW RECEIPT</span>
                )}
              </h2>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); setScanPreview(null) }} className="sm:hidden p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-red-500 transition-colors"><X size={20} /></button>
            </div>
            
            <div className="grid grid-cols-3 sm:flex items-center gap-2 sm:gap-2 w-full sm:w-auto">
              <button
                type="button"
                disabled={scanning}
                onClick={handlePasteClick}
                className="flex items-center justify-center gap-1 px-2.5 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-semibold transition-all hover:scale-105"
                style={{ backgroundColor: scanning ? `${accent}11` : `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
                title="Paste an image from your clipboard"
              >
                <ClipboardPaste size={15} />
                <span className="hidden sm:inline">Paste Image</span>
                <span className="sm:hidden">Paste</span>
              </button>
              <button
                type="button"
                disabled={scanning}
                onClick={() => scanRef.current?.click()}
                className="flex items-center justify-center gap-1 px-2.5 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-semibold transition-all hover:scale-105 text-white"
                style={{ backgroundColor: accent }}
                title="Upload receipt image"
              >
                <Upload size={15} />
                <span className="hidden sm:inline">Upload Receipt</span>
                <span className="sm:hidden">Upload</span>
              </button>
              <button
                type="button"
                disabled={scanning}
                onClick={() => cameraRef.current?.click()}
                className="flex items-center justify-center gap-1 px-2.5 py-2.5 sm:hidden rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                style={{ backgroundColor: '#6366F1', opacity: scanning ? 0.6 : 1 }}
                title="Open camera"
              >
                <Camera size={15} />
                <span>Camera</span>
              </button>
              <input ref={scanRef} type="file" accept="image/*" className="hidden" onChange={handleScanImage} />
            </div>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); setScanPreview(null) }} className="hidden sm:block text-slate-400 hover:text-red-500 transition-colors" style={{ color: textMuted }}><X size={18} /></button>
          </div>

          {editing && (
            <div className="rounded-xl p-3 flex items-start gap-2.5 text-xs border animate-fade-in"
              style={{ backgroundColor: editAlertBg, borderColor: editAlertBorder, color: editAlertText }}>
              <Pencil size={15} className="mt-0.5 shrink-0" style={{ color: editAlertText }} />
              <div>
                <span className="font-bold block mb-0.5" style={{ color: textPrimary }}>Editing Persisted Record</span>
                <span style={{ color: textMuted }}>You are modifying an existing receipt. Saving changes will update the record and append to its history log.</span>
              </div>
            </div>
          )}

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
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-2" onKeyDown={handleFormKeyDown}>
              {/* Branch */}
              {field(
                'Branch',
                <div style={{ position: 'relative' }}>
                  <Building2 size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
                  <select
                    id="receipt-branch"
                    value={form.branchId}
                    onChange={(e) => {
                      const selectedId = e.target.value
                      setForm((f) => ({ ...f, branchId: selectedId }))
                    }}
                    disabled={true}
                    className="w-full rounded-xl sm:rounded-lg pl-9 pr-9 py-2.5 sm:py-1.5 text-base sm:text-xs appearance-none outline-none cursor-not-allowed font-medium bg-slate-100 dark:bg-slate-900/50"
                    style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', border: `1px solid ${inputBorder}`, color: textMuted, colorScheme: isLight ? 'light' : 'dark' }}
                  >
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
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
                    className="w-full rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 text-base sm:text-xs outline-none transition-all"
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
                  inputClassName="text-base sm:text-xs rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5"
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
                  inputClassName="text-base sm:text-xs rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5"
                  inputBorder={scannedFields.has('description') ? scanBorder : inputBorder} />
              )}

              {/* Company */}
              {field(
                <span className="flex items-center gap-1">Company / Vendor {scannedFields.has('company') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <AutoSuggestInput value={form.company}
                  id="receipt-company"
                  onChange={(v) => { setForm((f) => ({ ...f, company: v.toUpperCase() })); clearScanned('company') }}
                  suggestions={suggestions.companies} placeholder="STORE OR VENDOR NAME"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputClassName="text-base sm:text-xs rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 uppercase"
                  inputBorder={scannedFields.has('company') ? scanBorder : inputBorder} />
              )}

              {/* Receipt No */}
              {field(
                <span className="flex items-center gap-1">Receipt No. {scannedFields.has('receiptNo') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}</span> as unknown as string,
                <input value={form.receiptNo}
                  id="receipt-receiptNo"
                  onChange={(e) => { setForm((f) => ({ ...f, receiptNo: e.target.value })); clearScanned('receiptNo') }}
                  placeholder="OR / SI number"
                  className="w-full rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 text-base sm:text-xs outline-none transition-all"
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
                  className="w-full rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 text-base sm:text-xs font-semibold outline-none transition-all"
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
                  inputClassName="text-base sm:text-xs rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5"
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

          <div className="flex flex-col sm:flex-row gap-3 justify-end pt-6 sm:pt-4 mt-2 border-t"
            style={{ borderColor: inputBorder }}>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null) }}
              className="flex-1 sm:flex-none px-4 py-3 sm:py-2 text-sm rounded-xl sm:rounded-lg font-semibold"
              style={{ color: textMuted, backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
              disabled={savingReceipt}>Cancel</button>
            <button type="button" onClick={submitReceipt}
              className="flex-1 sm:flex-none px-5 py-3 sm:py-2 rounded-xl text-sm font-bold text-white shadow flex items-center gap-2 justify-center transition-all active:scale-95"
              style={{ backgroundColor: activeAccent }} disabled={savingReceipt}>
              {savingReceipt ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : (editing ? 'Apply Updates' : 'Save Record')}
            </button>
          </div>
        </div>
        </>, document.body
      )}

      {/* ── RECEIPT TABLE / DAILY LOG / PURCHASES ── */}
      {activeTab === 'expenses' && branchId && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div className="hidden sm:flex flex-row items-center justify-between gap-3 px-4 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="min-w-0">
              <h2 className="text-xs font-black truncate" style={{ color: textPrimary }}>
                {branchName} — Expenses
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={handleExportExcel}
                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
                title="Export filtered expense records to Excel">
                <Download size={12} /> Export
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center" style={{ color: textMuted }}>
              No expense records found. {!search && 'Add records manually or import from Excel.'}
            </div>
          ) : (
            <>
              {/* ── Mobile Card View ── */}
              <div className="block sm:hidden">
                {filtered.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-2 px-3 py-3 cursor-pointer transition-colors active:bg-black/[0.03] dark:active:bg-white/[0.04]"
                    style={{ borderTop: `1px solid ${border}` }}
                  >
                    {/* Main content — tappable */}
                    <div className="flex-1 min-w-0" onClick={() => setActionMenuRow(row)}>
                      {/* Row 1: Company + Amount */}
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-bold leading-tight truncate" style={{ color: textPrimary }}>
                          {row.company || '—'}
                        </span>
                        <span className="text-sm font-bold shrink-0 tabular-nums" style={{ color: textPrimary }}>
                          ₱{peso(row.amount)}
                        </span>
                      </div>
                      {/* Row 2: Description */}
                      {row.description && (
                        <div className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>{row.description}</div>
                      )}
                      {/* Row 3: Meta — date · by · txn no */}
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className="text-[11px]" style={{ color: textMuted }}>{row.date}</span>
                        <span className="text-[11px]" style={{ color: isLight ? '#cbd5e1' : '#334155' }}>·</span>
                        <span className="text-[11px]" style={{ color: textMuted }}>
                          <EmployeeNameLink nameOrId={row.incurredBy} />
                        </span>
                        {row.receiptNo && (
                          <>
                            <span className="text-[11px]" style={{ color: isLight ? '#cbd5e1' : '#334155' }}>·</span>
                            <span className="text-[11px] font-medium" style={{ color: textMuted }}>
                              Txn #{row.receiptNo}
                            </span>
                          </>
                        )}
                      </div>
                      {/* Row 4: Category */}
                      <div className="mt-1">
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e2d48', color: textMuted }}
                        >
                          {row.expenseCategory}
                        </span>
                      </div>
                    </div>

                  </div>
                ))}
                {/* Total row */}
                <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-semibold" style={{ color: textMuted }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: textPrimary }}>₱{peso(totalFiltered)}</span>
                </div>
              </div>

              {/* ── Desktop Table View ── */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs min-w-[850px]">
                  <thead>
                    <tr style={{ backgroundColor: `${accent}18` }}>
                      <th className="px-3 py-3 text-left font-bold" style={{ color: textMuted }}>Date &amp; Incurred By</th>
                      <th className="px-3 py-3 text-left font-bold" style={{ color: textMuted }}>Company / Vendor</th>
                      <th className="px-3 py-3 text-left font-bold" style={{ color: textMuted }}>Description</th>
                      <th className="px-3 py-3 text-left font-bold" style={{ color: textMuted }}>Category &amp; Source</th>
                      <th className="px-3 py-3 text-right font-bold" style={{ color: textMuted }}>Amount</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => (
                      <tr key={row.id}
                        onClick={() => openDetails(row)}
                        onContextMenu={(e) => openDetails(row, e)}
                        title="Click to view details"
                        className="transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                        style={{ borderTop: `1px solid ${border}`, backgroundColor: i % 2 ? (isLight ? '#f8fafc' : '#0d1520') : undefined, cursor: 'pointer' }}>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold" style={{ color: textPrimary }}>{row.date}</div>
                          <div className="text-[10px]" style={{ color: textMuted }}>By: <EmployeeNameLink nameOrId={row.incurredBy} /></div>
                        </td>
                        <td className="px-3 py-2.5 font-medium" style={{ color: textPrimary }}>
                          {row.company || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium truncate max-w-xs md:max-w-sm" style={{ color: textPrimary }} title={row.description}>{row.description}</div>
                          {row.receiptNo && (
                            <div className="text-[10px]" style={{ color: textMuted }}>Receipt: {row.receiptNo}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="uppercase font-semibold" style={{ color: textPrimary }}>
                            {row.expenseCategory}
                          </span>
                          {row.sourceOfFunds && (
                            <div className="text-[10px] mt-0.5" style={{ color: textMuted }}>Source: {row.sourceOfFunds}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold" style={{ color: textPrimary }}>
                          ₱{peso(row.amount)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-2 justify-end" onClick={e => e.stopPropagation()}>
                            <button type="button" onClick={() => startEdit(row)} className="p-1 rounded hover:bg-slate-500/10"><Pencil size={13} style={{ color: textMuted }} /></button>
                            <button type="button" onClick={() => void handleDeleteRecord(row)} className="p-1 rounded hover:bg-rose-500/10"><Trash2 size={13} style={{ color: danger }} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${border}` }}>
                      <td colSpan={4} className="px-3 py-2.5 font-bold text-right" style={{ color: textMuted }}>TOTAL</td>
                      <td className="px-3 py-2.5 text-right font-bold" style={{ color: accent }}>₱{peso(totalFiltered)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
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
          style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={() => { if (!isEditingInModal) setDetailRow(null) }}>
          <div className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[100dvh] sm:max-h-[92vh]"
            style={{ backgroundColor: cardBg, border: `1px solid ${isLight ? '#e2e8f0' : '#1e2d48'}`, boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}
            onClick={(e) => e.stopPropagation()}>

            {/* ── Premium Header ── */}
            <div className="relative px-6 pt-6 pb-5 shrink-0 overflow-hidden"
              style={{ background: isLight
                ? 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)'
                : 'linear-gradient(135deg, #0a1628 0%, #0e2144 100%)' }}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #10B981 0%, transparent 60%)' }} />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <Receipt size={18} style={{ color: '#10B981' }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-base font-black tracking-tight" style={{ color: '#fff' }}>
                        {isEditingInModal ? 'Edit Expense Record' : 'Expense Record'}
                      </h3>
                      {!isEditingInModal && detailRow.expenseCategory && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(16,185,129,0.18)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)' }}>
                          {detailRow.expenseCategory}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {detailRow.branchName} &nbsp;·&nbsp; {detailRow.date}
                    </p>
                  </div>
                </div>
                <button type="button"
                  onClick={() => { if (!isEditingInModal || window.confirm('Discard unsaved changes?')) { setIsEditingInModal(false); setDetailRow(null) } }}
                  className="p-1.5 rounded-lg transition-colors shrink-0"
                  style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.07)' }}
                  aria-label="Close details modal">
                  <X size={18} />
                </button>
              </div>
            </div>

            {isEditingInModal ? (
              <div className="p-5 flex flex-col gap-4 overflow-y-auto">
                <div className="rounded-xl p-3 flex items-start gap-2.5 text-xs border"
                  style={{ backgroundColor: editAlertBg, borderColor: editAlertBorder, color: editAlertText }}>
                  <Pencil size={15} className="mt-0.5 shrink-0" style={{ color: editAlertText }} />
                  <div>
                    <span className="font-bold block mb-0.5" style={{ color: textPrimary }}>Editing Persisted Record</span>
                    <span style={{ color: textMuted }}>You are modifying an existing receipt. Saving changes will update the record and append to its history log.</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {/* Date */}
                  {field(
                    'Date',
                    <div>
                      <input value={dateRaw}
                        id="modal-receipt-date"
                        onChange={(e) => { setDateRaw(e.target.value); setDateError('') }}
                        onBlur={(e) => handleDateBlur(e.target.value)}
                        placeholder={latestDateStr}
                        className="w-full rounded-lg px-2.5 py-1.5 text-base sm:text-xs outline-none transition-all animate-fade-in"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                      {dateError
                        ? <p className="text-xs mt-0.5" style={{ color: danger }}>{dateError}</p>
                        : form.date ? <p className="text-xs mt-0.5" style={{ color: accent }}>✓ {form.date}</p> : null}
                    </div>
                  )}

                  {/* Branch */}
                  {field(
                    'Branch',
                    <div>
                      <select
                        value={form.branchId}
                        id="modal-receipt-branch"
                        onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                        className="w-full rounded-lg px-2.5 py-1.5 text-base sm:text-xs outline-none transition-all"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, colorScheme: isLight ? 'light' : 'dark' }}
                      >
                        {(allBranches.length > 0 ? allBranches : branches).map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Incurred By */}
                  {field(
                    'Incurred By',
                    <AutoSuggestInput value={form.incurredBy}
                      id="modal-receipt-incurredBy"
                      onChange={(v) => setForm((f) => ({ ...f, incurredBy: v }))}
                      suggestions={suggestions.people} placeholder="Who incurred this?"
                      {...{ inputBg, textPrimary, textMuted, accent }}
                      inputClassName="text-base sm:text-xs"
                      inputStyle={{ padding: '6px 10px' }}
                      inputBorder={inputBorder} />
                  )}

                  {/* Company */}
                  {field(
                    'Company / Vendor',
                    <AutoSuggestInput value={form.company}
                      id="modal-receipt-company"
                      onChange={(v) => setForm((f) => ({ ...f, company: v }))}
                      suggestions={suggestions.companies} placeholder="Store or vendor name"
                      {...{ inputBg, textPrimary, textMuted, accent }}
                      inputClassName="text-base sm:text-xs"
                      inputStyle={{ padding: '6px 10px' }}
                      inputBorder={inputBorder} />
                  )}

                  {/* Receipt No */}
                  {field(
                    'Receipt No.',
                    <input value={form.receiptNo}
                      id="modal-receipt-receiptNo"
                      onChange={(e) => setForm((f) => ({ ...f, receiptNo: e.target.value }))}
                      placeholder="OR / SI number"
                      className="w-full rounded-lg px-2.5 py-1.5 text-base sm:text-xs outline-none transition-all"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  )}

                  {/* Amount */}
                  {field(
                    'Amount (₱)',
                    <input type="text" value={form.amount}
                      id="modal-receipt-amount"
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      onBlur={(e) => {
                        const numeric = parseFloat(e.target.value.replace(/,/g, ''))
                        if (!isNaN(numeric)) {
                           setForm((f) => ({ ...f, amount: numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }))
                        }
                      }}
                      placeholder="0.00"
                      className="w-full rounded-lg px-2.5 py-1.5 text-base sm:text-xs outline-none transition-all"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  )}

                  {/* Source of Funds */}
                  {field(
                    'Source of Funds',
                    <AutoSuggestInput value={form.sourceOfFunds}
                      id="modal-receipt-sourceOfFunds"
                      onChange={(v) => setForm((f) => ({ ...f, sourceOfFunds: v }))}
                      suggestions={suggestions.sources} placeholder="Petty cash, reimbursement…"
                      {...{ inputBg, textPrimary, textMuted, accent }}
                      inputClassName="text-base sm:text-xs"
                      inputStyle={{ padding: '6px 10px' }}
                      inputBorder={inputBorder} />
                  )}

                  {/* Description */}
                  <div className="sm:col-span-2">
                    {field(
                      'Description',
                      <AutoSuggestInput value={form.description}
                        id="modal-receipt-description"
                        onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                        suggestions={suggestions.descs} placeholder="What was purchased?"
                        {...{ inputBg, textPrimary, textMuted, accent }}
                        inputClassName="text-base sm:text-xs"
                        inputStyle={{ padding: '6px 10px' }}
                        inputBorder={inputBorder} />
                    )}
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide block mb-2" style={{ color: textMuted }}>Expense Category</label>
                  <div className="flex flex-wrap gap-1.5">
                    {allCategories.map((cat) => (
                      <button key={cat} type="button" onClick={() => setForm((f) => ({ ...f, expenseCategory: cat as AuditExpenseCategory }))}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all hover:scale-102"
                        style={{ border: `1px solid ${form.expenseCategory === cat ? editAccent : inputBorder}`, backgroundColor: form.expenseCategory === cat ? `${editAccent}22` : inputBg, color: form.expenseCategory === cat ? editAccent : textMuted }}>
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto">

                {/* ── Info Grid ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                  {[
                    { label: 'Submitted By', value: formatDisplayUserLabel(detailRow.inputBy), isPerson: true },
                    { label: 'Incurred By', value: detailRow.incurredBy || '—', isPerson: true },
                    { label: 'Company / Vendor', value: detailRow.company || '—', isPerson: false },
                    { label: 'Receipt No.', value: detailRow.receiptNo || '—', isPerson: false },
                    { label: 'Source of Funds', value: detailRow.sourceOfFunds || '—', isPerson: false },
                  ].map(({ label, value, isPerson }) => (
                    <div key={label}
                      className="rounded-xl px-3.5 py-3 flex flex-col gap-0.5"
                      style={{ backgroundColor: isLight ? '#f8fafc' : '#0c1829', border: `1px solid ${isLight ? '#e2e8f0' : '#1a2d47'}` }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>{label}</span>
                      <span className="text-sm font-semibold leading-snug break-words" style={{ color: textPrimary }}>
                        {isPerson ? <EmployeeNameLink nameOrId={value} /> : value}
                      </span>
                    </div>
                  ))}

                  {/* Description spans full width */}
                  <div className="col-span-1 sm:col-span-2 rounded-xl px-3.5 py-3"
                    style={{ backgroundColor: isLight ? '#f8fafc' : '#0c1829', border: `1px solid ${isLight ? '#e2e8f0' : '#1a2d47'}` }}>
                    <span className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: textMuted }}>Description</span>
                    <span className="text-sm font-semibold whitespace-pre-wrap" style={{ color: textPrimary }}>{detailRow.description || '—'}</span>
                  </div>
                </div>

                {/* ── Amount Highlight ── */}
                <div className="rounded-xl px-5 py-4 flex items-center justify-between"
                  style={{ background: isLight
                    ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)'
                    : 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))',
                    border: `1px solid ${isLight ? '#bbf7d0' : 'rgba(16,185,129,0.2)'}` }}>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest block" style={{ color: isLight ? '#059669' : '#34d399' }}>Total Amount</span>
                    <span className="text-[11px] font-medium" style={{ color: isLight ? '#6ee7b7' : 'rgba(52,211,153,0.6)' }}>Philippine Peso</span>
                  </div>
                  <span className="text-3xl font-black" style={{ color: isLight ? '#059669' : '#10B981' }}>
                    ₱{peso(detailRow.amount)}
                  </span>
                </div>

                {/* ── Timeline History ── */}
                <div className="rounded-xl px-4 py-4"
                  style={{ backgroundColor: isLight ? '#f8fafc' : '#0c1829', border: `1px solid ${isLight ? '#e2e8f0' : '#1a2d47'}` }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest block mb-3" style={{ color: textMuted }}>Activity History</span>
                  <div className="relative flex flex-col gap-0">
                    {expenseRecordHistory(detailRow).map((entry, idx, arr) => (
                      <div key={`${entry.action}-${entry.at}-${idx}`} className="flex gap-3 relative">
                        {/* timeline spine */}
                        {idx < arr.length - 1 && (
                          <div className="absolute left-[9px] top-5 bottom-0 w-px" style={{ backgroundColor: isLight ? '#e2e8f0' : '#1e2d48' }} />
                        )}
                        {/* dot */}
                        <div className="mt-1 flex-shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                          style={{
                            backgroundColor: entry.action === 'created'
                              ? (isLight ? '#dcfce7' : 'rgba(16,185,129,0.12)')
                              : (isLight ? '#ede9fe' : 'rgba(99,102,241,0.12)'),
                            border: `2px solid ${entry.action === 'created' ? '#10B981' : '#6366F1'}`
                          }}>
                          <div className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: entry.action === 'created' ? '#10B981' : '#6366F1' }} />
                        </div>
                        <div className="pb-4 flex-1 min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="text-xs font-bold" style={{ color: textPrimary }}>
                              {entry.action === 'created' ? 'Created' : 'Updated'}
                            </span>
                            <span className="text-xs" style={{ color: textMuted }}>by</span>
                            <span className="text-xs font-semibold" style={{ color: entry.action === 'created' ? '#10B981' : '#6366F1' }}>
                              <EmployeeNameLink nameOrId={formatDisplayUserLabel(entry.by)} />
                            </span>
                          </div>
                          <span className="text-[11px] font-medium" style={{ color: textMuted }}>
                            {historyDateTime(entry.at)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {expenseRecordHistory(detailRow).length === 0 && (
                      <span className="text-xs" style={{ color: textMuted }}>No history available.</span>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* ── Footer ── */}
            <div className="flex items-center justify-between gap-2 px-6 py-4 shrink-0"
              style={{ borderTop: `1px solid ${isLight ? '#e2e8f0' : '#1a2d47'}` }}>
              {isEditingInModal ? (
                <>
                  <button type="button"
                    onClick={() => { if (window.confirm('Discard unsaved changes?')) { setIsEditingInModal(false); setEditing(null) } }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-150 active:scale-95"
                    style={{ color: textPrimary, borderColor: isLight ? '#e2e8f0' : '#1e2d48', backgroundColor: isLight ? '#f8fafc' : '#0c1829' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={submitReceipt} disabled={savingReceipt}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-150 active:scale-95"
                    style={{ backgroundColor: editAccent, boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>
                    {savingReceipt ? <Loader2 size={14} className="animate-spin" /> : null}
                    Apply Changes
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setDetailRow(null)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95"
                    style={{ color: textMuted, backgroundColor: isLight ? '#f1f5f9' : '#0f1c30', border: `1px solid ${isLight ? '#e2e8f0' : '#1a2d47'}` }}>
                    Close
                  </button>
                  {/* Edit / Delete — desktop only; hidden on mobile to prevent misclicks */}
                  <div className="hidden sm:flex items-center gap-2">
                    <button type="button" onClick={() => startEditInModal(detailRow)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all duration-150 active:scale-95"
                      style={{ backgroundColor: '#334155', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button type="button" onClick={() => void handleDeleteRecord(detailRow)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95"
                      style={{ color: '#fff', backgroundColor: danger, boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {duplicateModal && typeof document !== 'undefined' && createPortal(
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
        </div>,
        document.body
      )}

      {actionMenuRow && typeof document !== 'undefined' && createPortal(
        <>
          <div className="sm:hidden fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={() => setActionMenuRow(null)} />
          <div className="sm:hidden fixed inset-x-0 bottom-0 z-[100] p-4 flex flex-col gap-2 pb-8" style={{ animation: 'slideUp 0.2s ease-out' }}>
            <div className="rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ backgroundColor: cardBg }}>
              <button type="button" onClick={() => { openDetails(actionMenuRow); setActionMenuRow(null) }} className="w-full px-5 py-4 text-center text-sm font-bold border-b transition-colors active:bg-black/5" style={{ color: textPrimary, borderColor: border }}>View Details</button>
              <button type="button" onClick={() => { startEdit(actionMenuRow); setActionMenuRow(null) }} className="w-full px-5 py-4 text-center text-sm font-bold border-b transition-colors active:bg-black/5" style={{ color: textPrimary, borderColor: border }}>Edit Record</button>
              <button type="button" onClick={() => { void handleDeleteRecord(actionMenuRow); setActionMenuRow(null) }} className="w-full px-5 py-4 text-center text-sm font-bold transition-colors active:bg-black/5" style={{ color: danger }}>Delete Record</button>
            </div>
            <button type="button" onClick={() => setActionMenuRow(null)} className="w-full px-5 py-4 text-center text-sm font-bold rounded-2xl shadow-2xl transition-colors active:bg-black/5 mt-1" style={{ backgroundColor: cardBg, color: textMuted }}>Cancel</button>
          </div>
        </>, document.body
      )}

    </div>
  )
}
