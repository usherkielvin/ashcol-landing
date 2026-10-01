import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Upload, Building2, Plus, Trash2, Pencil, Settings, Search, X, Loader2, ChevronDown, ClipboardPaste, Download, AlertTriangle, ClipboardList, CalendarDays, Camera } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatRole, isSameBaseBranch, branchAliasKey, isPortalAdmin, resolveArchivesBranchFilter } from '../utils/api'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import type { AuditExpense, AuditExpenseCategory } from '../types/auditExpense'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'
import { formatTodayReceiptDate } from '../utils/auditExpenseDates'
import { createExpenseId, deleteAuditExpense, loadAuditExpenses, upsertAuditExpense } from '../utils/auditExpenseStorage'
import { loadAuditExpenseCategories, saveAuditExpenseCategory, deleteAuditExpenseCategory, reorderAuditExpenseCategories, type AuditExpenseCategoryDetail } from '../utils/auditExpenseCategoryStorage'
import { parseSmartDate, dateToTime } from '../utils/smartDate'
import { fetchCachedBranches } from '../utils/portalDirectoryCache'
import AutoSuggestInput from '../components/AutoSuggestInput'
import AshcolLoader from '../components/AshcolLoader'
import * as XLSX from 'xlsx'
import { uploadReceiptImage } from '../services/supabaseStorage'
import ReceiptScanDialog, { type ReceiptDialogResult, NO_RECEIPT_NO, NO_RECEIPT_SEP } from '../components/ReceiptScanDialog'

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
const formatDetailsName = (raw?: string | null): string => {
  if (!raw || !raw.trim() || raw === '-' || raw === '—') return '—'
  const withoutRole = raw.split(/\s*[-–—]\s*/)[0]?.trim() || raw.trim()
  return withoutRole.toUpperCase()
}
/** A record that moves cash to Head Office / the company bank rather than being a real expense —
 *  category DEPOSIT or FUND TRANSFER, or a description like "DEPOSIT TO HO". */
// Records created from a DTR row (ids `dtr-<branch>-<date>-...`) are edited on the DTR, not here.
const isDtrLinked = (e: { id: string }) => e.id.startsWith('dtr-')
// Expenses saved from the DTR without a receipt carry this receipt no. (their reason is in the description).
const isNoReceipt = (e: { receiptNo?: string }) => (e.receiptNo || '').trim().toUpperCase() === 'NO RECEIPT'
// A DTR-created record belongs to the day of the DTR it was entered on (its id embeds that date), whatever receipt
// date was typed. Older records kept the receipt date, so the id is the reliable source.
const dtrDateFromId = (id: string): string => /^dtr-.*-(\d{4}-\d{2}-\d{2})-(?:exp|dep|ca)-/.exec(id)?.[1] || ''

const isDepositRecord = (e: { expenseCategory?: string; description?: string }) => {
  const cat = (e.expenseCategory || '').trim().toUpperCase()
  return cat === 'DEPOSIT' || cat === 'FUND TRANSFER' || /deposit(ed)?\s*(to|for)?\s*(ho|head\s*office|company\s*bank)/i.test(e.description || '')
}
const emptyForm = (defaultBranchId = '') => ({ date: formatTodayReceiptDate(), company: '', description: '', receiptNo: '', amount: '', expenseCategory: 'OTHER' as AuditExpenseCategory, sourceOfFunds: '', incurredBy: '', branchId: defaultBranchId })

export default function ExpenseRecords() {
  const { theme } = useTheme()
  const { user } = useAuth()
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
  // Branch members enter expenses on the DTR (which creates the record), so Expense Records and the
  // DTR always match. Only admins/management/managers add records here directly.
  const canAddRecord = isAdmin || role === 'manager'
  // DTR-linked records stay in sync with their DTR, so only admins may change them here.
  const canModifyRecord = (row: { id: string }) => isAdmin || !isDtrLinked(row)
  const dtrLinkedHint = (row: { date?: string }) => `Edit this on the DTR for ${row.date || 'that date'}`
  const isManager = role === 'manager'
  const isBranchScopedUser = !isAdmin && !!user?.branchId
  const canAccess = isAdmin || isManager || role === 'staff' || role === 'employee' || role === 'oic'

  const [branches, setBranches] = useState<BranchOption[]>([])
  const [allBranches, setAllBranches] = useState<BranchOption[]>([])
  const [branchId, setBranchId] = useState('')
  const [expenses, setExpenses] = useState<AuditExpense[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  // The ASHCOL splash stays up until the records AND the default month's summary data (DTR totals, purchases) are in, so
  // the page opens complete instead of filling in piece by piece. Shown once per visit; a timeout stops it hanging.
  const [revealed, setRevealed] = useState(false)
  const [dtrSettledKey, setDtrSettledKey] = useState('')
  const [purchasesSettledFor, setPurchasesSettledFor] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AuditExpense | null>(null)
  const [showAddAnotherPrompt, setShowAddAnotherPrompt] = useState(false)
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
  const [filterMonth, setFilterMonth] = useState(() => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase())
  const [sortConfig] = useState<{ key: keyof AuditExpense; direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' })
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set())
  const [scanError, setScanError] = useState('')
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState<string | null>(null)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  // Attach a missing receipt photo to an existing record without opening the edit form.
  const photoInputRef = useRef<HTMLInputElement>(null)
  const photoTargetRef = useRef<AuditExpense | null>(null)
  const [attachingPhotoId, setAttachingPhotoId] = useState<string | null>(null)
  const [pendingOpen, setPendingOpen] = useState(false)
  // "No receipt available" option of the record form (same convention as the DTR: receipt no. NO RECEIPT + reason in the description)
  const [noReceiptForm, setNoReceiptForm] = useState(false)
  const [noReceiptReasonForm, setNoReceiptReasonForm] = useState('')
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setDataVersion(v => v + 1) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  // "Why the difference?" stays folded until asked for.
  const [whyOpen, setWhyOpen] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const modalFileInputRef = useRef<HTMLInputElement>(null)
  const modalCameraInputRef = useRef<HTMLInputElement>(null)
  const [branchEmployees, setBranchEmployees] = useState<string[]>([])

  useEffect(() => {
    if (!previewImage && !detailRow) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null)
        } else if (detailRow && !isEditingInModal) {
          setDetailRow(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewImage, detailRow, isEditingInModal])

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

  // Always alphabetical, so a category is easy to find.
  const allCategories = useMemo(() => {
    const names = categories.length > 0 ? categories.map(c => c.name) : AUDIT_EXPENSE_CATEGORIES
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [categories])
  const sortedCategoryDetails = useMemo(() => [...categories].sort((a, b) => a.name.localeCompare(b.name)), [categories])
  const [categoryQuery, setCategoryQuery] = useState('')
  const visibleCategories = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase()
    return q ? allCategories.filter(c => c.toLowerCase().includes(q)) : allCategories
  }, [allCategories, categoryQuery])

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

      // Taguig is split into Sales and Services. A record whose id says Sales can still carry a Services
      // branch name (older DTR pushes were stored as Sales), so the name decides the line, not just the id.
      const selIsSales = selBidLower.endsWith('-sales')
      const selIsServices = selBidLower.endsWith('-services') || selBidLower.endsWith('-service')
      if (selIsSales || selIsServices) {
        const recIsServices = /-services?$/.test(eBidLower) || /service/i.test(e.branchName || '')
        if (selIsSales && recIsServices) return false
        if (selIsServices && !recIsServices) return false
      }

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
      
      // Base branch match (e.g. BR-DASMA vs UUID or alias)
      if (isSameBaseBranch(e.branchId, branchId) || isSameBaseBranch(e.branchId, branchName)) return true

      // Cleaned branch name match (e.g. "DASMA" === "DASMA")
      if (e.branchName && branchName) {
        const cleanE = e.branchName.replace(/^(ashcol\s+)/i, '').trim().toUpperCase()
        const cleanB = branchName.replace(/^(ashcol\s+)/i, '').trim().toUpperCase()
        if (cleanE && cleanB && cleanE === cleanB) return true
      }

      // Alias keyword match (e.g. "dasma" in branchId or branchName)
      const aliasE = branchAliasKey(e.branchId) || branchAliasKey(e.branchName)
      const aliasSel = branchAliasKey(branchId) || branchAliasKey(branchName)
      if (aliasE && aliasSel && aliasE === aliasSel) return true

      return false
    }).map(e => {
      const dtrDate = dtrDateFromId(e.id)
      return { ...e, date: (dtrDate && (parseSmartDate(dtrDate) || dtrDate)) || parseSmartDate(e.date) || e.date }
    })
  }, [expenses, branchId, branchName])

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
      const data = await fetchCachedBranches(token)
      const list: BranchOption[] = data.map((b: any) => ({ id: b.id, name: b.name }))
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
      console.error('[ExpenseRecords] Reload error:', err)
    }
  }, [])

  useEffect(() => {
    let active = true
    const startTime = Date.now()

    const preloadTabDetails = async () => {
      try {
        const promises: Promise<any>[] = [loadAuditExpenses()]
        if (canAccess) promises.push(loadBranches())
        const [data] = await Promise.all(promises)
        if (active && data) {
          setExpenses(data)
        }
      } catch (err) {
        console.error('[ExpenseRecords] Preload error:', err)
      } finally {
        const elapsed = Date.now() - startTime
        const remaining = Math.max(0, 2000 - elapsed)
        setTimeout(() => {
          if (active) setInitialLoading(false)
        }, remaining)
      }
    }

    preloadTabDetails()
    return () => { active = false }
  }, [canAccess, loadBranches])



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



  // Real calendar months, January 2026 up to the current month (newest first). Not derived from record dates, so a
  // mistyped receipt date can never add a bogus month such as "SEPTEMBER 2024".
  const availableMonths = useMemo(() => {
    const now = new Date()
    const months: string[] = []
    for (let y = now.getFullYear(), m = now.getMonth(); y > 2026 || (y === 2026 && m >= 0); m--) {
      if (m < 0) { y--; m = 11 }
      months.push(new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase())
    }
    return months
  }, [])

  // Possible duplicates: same receipt no. + amount, or (no receipt no.) same date + amount + description.
  const duplicateInfo = useMemo(() => {
    const groups = new Map<string, AuditExpense[]>()
    for (const e of branchExpenses) {
      const amt = Number(e.amount || 0).toFixed(2)
      const receipt = isNoReceipt(e) ? '' : (e.receiptNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      const key = receipt
        ? `R|${receipt}|${amt}`
        : `D|${dateToTime(e.date)}|${amt}|${(e.description || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`
      const list = groups.get(key)
      if (list) list.push(e)
      else groups.set(key, [e])
    }
    const ids = new Set<string>()
    for (const list of groups.values()) {
      if (list.length > 1) list.forEach(e => ids.add(e.id))
    }
    return { ids, groups }
  }, [branchExpenses])
  const [showDupesOnly, setShowDupesOnly] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = [...branchExpenses]
    if (showDupesOnly) rows = rows.filter(e => duplicateInfo.ids.has(e.id))

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
  }, [branchExpenses, search, sortConfig, filterMonth, showDupesOnly, duplicateInfo])

  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0)

  // ── Expense Records vs. DTR summary reconciliation ──
  // Period = selected month, or the span of this branch's records when "All Months".
  // DEPOSIT records are excluded: the DTR tracks deposits separately from Total Expenses.
  const dtrPeriod = useMemo(() => {
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (filterMonth !== 'All') {
      const start = new Date(`1 ${filterMonth}`)
      if (isNaN(start.getTime())) return null
      return { from: iso(start), to: iso(new Date(start.getFullYear(), start.getMonth() + 1, 0)) }
    }
    const times = branchExpenses.map(e => dateToTime(e.date)).filter(t => t > 0)
    if (times.length === 0) return null
    return { from: iso(new Date(Math.min(...times))), to: iso(new Date(Math.max(...times))) }
  }, [filterMonth, branchExpenses])

  type DtrSummary = { loading: boolean; total: number | null; payroll: number; purchases: number; deposits: number; matched: boolean }
  const [dtrExpenses, setDtrExpenses] = useState<DtrSummary>({ loading: false, total: null, payroll: 0, purchases: 0, deposits: 0, matched: false })
  // Results are kept per branch + month: going back to a month shows it instantly and refreshes quietly behind it.
  const dtrExpensesCache = useRef(new Map<string, DtrSummary>())
  const dtrFrom = dtrPeriod?.from ?? ''
  const dtrTo = dtrPeriod?.to ?? ''
  useEffect(() => {
    const empty = { loading: false, total: null, payroll: 0, purchases: 0, deposits: 0, matched: false }
    if (!branchId || !dtrFrom) { setDtrExpenses(empty); return }
    let cancelled = false
    const cacheKey = `${branchId}|${branchName}|${dtrFrom}|${dtrTo}`
    const cached = dtrExpensesCache.current.get(cacheKey)
    setDtrExpenses(cached ? { ...cached, loading: false } : { ...empty, loading: true })
    if (cached) setDtrSettledKey(cacheKey)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    // Range summary rows carry no branchId, only display names ("CANDELARIA", "TAGUIG - SALES"), so match on names.
    const norm = (n?: string | null) => (n || '').replace(/^ashcol\s+/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim()
    const target = norm(branchName)
    fetch(`${API_BASE_URL}/v1/reports/audit-summary-range?from=${dtrFrom}&to=${dtrTo}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rows: Array<{ branchName?: string; logicalBranchName?: string; totalExpenses?: number; payrollExpenses?: number; totalForPurchase?: number; totalDeposits?: number }>) => {
        if (cancelled) return
        const matched = rows.filter(r => norm(r.branchName) === target)
        const next: DtrSummary = {
          loading: false,
          matched: matched.length > 0,
          total: matched.reduce((sum, r) => sum + (r.totalExpenses || 0), 0),
          payroll: matched.reduce((sum, r) => sum + (r.payrollExpenses || 0), 0),
          purchases: matched.reduce((sum, r) => sum + (r.totalForPurchase || 0), 0),
          deposits: matched.reduce((sum, r) => sum + (r.totalDeposits || 0), 0),
        }
        dtrExpensesCache.current.set(cacheKey, next)
        setDtrExpenses(next)
        setDtrSettledKey(cacheKey)
      })
      .catch(err => {
        console.error('[Expense Records] DTR summary fetch failed:', err)
        if (!cancelled && !cached) setDtrExpenses(empty)
        if (!cancelled) setDtrSettledKey(cacheKey)
      })
    return () => { cancelled = true }
  }, [branchId, branchName, dtrFrom, dtrTo])

  const periodRecords = useMemo(() => {
    if (!dtrPeriod) return []
    const from = new Date(`${dtrPeriod.from}T00:00:00`).getTime()
    const to = new Date(`${dtrPeriod.to}T23:59:59`).getTime()
    return branchExpenses.filter(e => {
      const t = dateToTime(e.date)
      return t >= from && t <= to
    })
  }, [branchExpenses, dtrPeriod])
  const recordsForDtr = useMemo(() => periodRecords.filter(e => !isDepositRecord(e)), [periodRecords])
  const recordsTotalForDtr = recordsForDtr.reduce((sum, e) => sum + e.amount, 0)
  const depositsForDtr = periodRecords.filter(isDepositRecord).reduce((sum, e) => sum + e.amount, 0)
  // DTR expense + purchase lines for the period, used to explain Records vs DTR line by line.
  // Bumped after a purchase receipt is added so the DTR lines and the pending list reload.
  const [dataVersion, setDataVersion] = useState(0)
  type DtrLine = { id: string; type?: string; description: string; amount: number; actualAmount?: number; receiptReturned?: boolean; resolvedExpenseId?: string; reportDate?: string; refundDue?: number; cashReturnFound?: boolean; cashReturnDate?: string; reimburseDue?: number; reimburseFound?: boolean }
  // One feed of this branch's purchases (every date), loaded once per branch and kept in a cache so switching months or
  // coming back is instant. The month's DTR lines and the all-dates pending list are both derived from it, so they cannot
  // disagree and the page makes one request instead of two.
  const purchasesCache = useRef(new Map<string, any[]>())
  const [purchasesFeed, setPurchasesFeed] = useState<{ loading: boolean; rows: any[]; failed: boolean }>({ loading: false, rows: [], failed: false })
  useEffect(() => {
    if (!branchId) { setPurchasesFeed({ loading: false, rows: [], failed: false }); return }
    let cancelled = false
    const cached = purchasesCache.current.get(branchId)
    setPurchasesFeed({ loading: !cached, rows: cached || [], failed: false })
    if (cached) setPurchasesSettledFor(branchId)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const params = new URLSearchParams({ branchId: branchId.replace(/-(sales|services?)$/i, '') })
    if (/-services?$/i.test(branchId)) params.set('auditLine', 'TAGUIG_SERVICE')
    else if (/-sales$/i.test(branchId)) params.set('auditLine', 'TAGUIG_SALES')
    fetch(`${API_BASE_URL}/v1/reports/purchases?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rows: any[]) => {
        if (cancelled) return
        purchasesCache.current.set(branchId, rows || [])
        setPurchasesFeed({ loading: false, rows: rows || [], failed: false })
        setPurchasesSettledFor(branchId)
      })
      .catch(err => {
        console.error('[Expense Records] Purchases fetch failed:', err)
        if (!cancelled) setPurchasesFeed(prev => ({ loading: false, rows: cached ? prev.rows : [], failed: !cached }))
        if (!cancelled) setPurchasesSettledFor(branchId)
      })
    return () => { cancelled = true }
  }, [branchId, dataVersion])

  // DTR expense + purchase lines for the selected period.
  const dtrLines = useMemo(() => {
    const rows = !dtrFrom ? [] : purchasesFeed.rows
      .filter(r => r.reportDate && r.reportDate >= dtrFrom && r.reportDate <= dtrTo)
      // ORDER| purchases are customer orders, not counted in the DTR's Purchases total.
      .filter(r => !String(r.description || '').startsWith('ORDER|'))
      .map(r => ({ ...r, amount: Number(r.amount) || 0, actualAmount: Number(r.actualAmount) || 0 })) as DtrLine[]
    return { loading: purchasesFeed.loading, failed: purchasesFeed.failed, rows }
  }, [purchasesFeed, dtrFrom, dtrTo])

  const dtrKey = branchId && dtrFrom ? `${branchId}|${branchName}|${dtrFrom}|${dtrTo}` : ''
  const firstDataReady = !branchId || ((!dtrKey || dtrSettledKey === dtrKey) && purchasesSettledFor === branchId)
  useEffect(() => {
    if (!revealed && !initialLoading && firstDataReady) setRevealed(true)
  }, [revealed, initialLoading, firstDataReady])
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 15000)
    return () => clearTimeout(t)
  }, [])

  // Every purchase still waiting for its receipt (all dates, not just the period) with its age in days —
  // these are the main reason the DTR and Expense Records drift apart.
  // amount = still to be receipted (a purchase can be receipted in parts); given = cash handed out; received = receipted so far
  type PendingPurchase = { id: string; date: string; label: string; worker: string; detail: string; amount: number; given: number; received: number; ageDays: number }
  // Purchases dated before the receipt rules started are a backlog nobody can act on; keep them apart.
  const PENDING_LEGACY_BEFORE = '2026-10-01'
  const [receiptTarget, setReceiptTarget] = useState<PendingPurchase | null>(null)
  const agingPurchases = useMemo<PendingPurchase[]>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return purchasesFeed.rows
      // ORDER| purchases are customer orders, not DTR purchases; finished purchases are not pending.
      .filter(r => (!r.type || r.type === 'PURCHASE') && !r.receiptReturned && r.reportDate && !String(r.description || '').startsWith('ORDER|'))
      .map(r => {
        const d = new Date(`${r.reportDate}T00:00:00`)
        const desc = String(r.description || '')
        return {
          id: String(r.id),
          date: String(r.reportDate),
          label: desc.split('|').map((x: string) => x.trim()).filter(Boolean).join(' · ') || 'Purchase',
          worker: desc.includes('|') ? desc.split('|')[0].trim() : '',
          detail: desc.includes('|') ? desc.split('|').slice(1).join(' ').trim() : desc.trim(),
          amount: r.remaining != null ? Number(r.remaining) || 0 : Math.max(0, (Number(r.amount) || 0) - (Number(r.actualAmount) || 0)),
          given: Number(r.amount) || 0,
          received: Number(r.actualAmount) || 0,
          ageDays: Math.max(0, Math.round((today.getTime() - d.getTime()) / 86400000)),
        }
      })
      .sort((x, y) => y.ageDays - x.ageDays)
  }, [purchasesFeed])

  const reconciliation = useMemo(() => {
    if (!dtrPeriod) return null
    const byId = new Map(branchExpenses.map(e => [e.id, e]))
    const from = new Date(`${dtrPeriod.from}T00:00:00`).getTime()
    const to = new Date(`${dtrPeriod.to}T23:59:59`).getTime()
    type Item = { key: string; date: string; label: string; amount: number; note?: string }
    const buckets = {
      depositAsExpense: [] as Item[],
      pendingPurchase: [] as Item[],
      neverPushed: [] as Item[],
      deleted: [] as Item[],
      otherMonth: [] as Item[],
      amountDiff: [] as Item[],
      manual: [] as Item[],
    }
    const linked = new Set<string>()
    const lineLabel = (d: string) => d.split('|').filter(Boolean).join(' — ') || 'DTR entry'
    let expenseLinesTotal = 0
    for (const l of dtrLines.rows) {
      if (l.type === 'EXPENSE') expenseLinesTotal += l.amount
      const label = `${l.type === 'PURCHASE' ? 'Purchase' : l.type === 'EXPENSE' ? 'Expense' : 'DTR'}: ${lineLabel(l.description)}`
      const item: Item = { key: l.id, date: l.reportDate || '', label, amount: l.amount }
      const rid = l.resolvedExpenseId || ''
      // Before the DTR had a COH Deposit section, deposits to HO were logged as expense rows. They count in
      // DTR Expenses, while the matching record is a DEPOSIT (left out of the records total).
      const linkedRec = rid ? byId.get(rid) : undefined
      const looksLikeDeposit = /deposit|\bcoh\b|\bho\b|head\s*office|fund\s*transfer/i.test(l.description) || (!!linkedRec && isDepositRecord(linkedRec))
      if (l.type !== 'PURCHASE' && looksLikeDeposit) {
        if (rid) linked.add(rid)
        buckets.depositAsExpense.push({ ...item, note: linkedRec ? `record: ${linkedRec.expenseCategory}` : 'no record' })
        continue
      }
      if (!rid) {
        if (l.type === 'PURCHASE' && !l.receiptReturned) buckets.pendingPurchase.push(item)
        else buckets.neverPushed.push(item)
        continue
      }
      // A purchase receipted in parts (gas + toll…) links several records: ids are comma-joined.
      const recIds = rid.split(',').map(x => x.trim()).filter(Boolean)
      recIds.forEach(x => linked.add(x))
      const recs = recIds.map(x => byId.get(x)).filter((x): x is AuditExpense => !!x)
      if (recs.length === 0) { buckets.deleted.push(item); continue }
      const rec = recs[0]
      const recTotal = recs.reduce((acc, x) => acc + x.amount, 0)
      const t = dateToTime(rec.date)
      if (t && (t < from || t > to)) { buckets.otherMonth.push({ ...item, note: `recorded as ${rec.date}` }); continue }
      // Receipts above the cash given are not booked on the purchase: they are reimbursed through a DTR expense row.
      const expected = l.type === 'PURCHASE' && l.actualAmount ? Math.min(l.actualAmount, l.amount) : l.amount
      if (Math.abs(recTotal - expected) >= 0.01) {
        buckets.amountDiff.push({ ...item, amount: expected - recTotal, note: `DTR ${expected.toFixed(2)} · record${recs.length > 1 ? 's' : ''} ${recTotal.toFixed(2)}` })
      }
      if (l.type === 'PURCHASE' && !l.receiptReturned && l.amount - (l.actualAmount || 0) > 0.005) {
        buckets.pendingPurchase.push({ ...item, amount: l.amount - (l.actualAmount || 0), note: `${(l.actualAmount || 0).toFixed(2)} of ${l.amount.toFixed(2)} receipted` })
      }
    }
    for (const e of recordsForDtr) {
      if (/^CASH ADVANCE/i.test(e.expenseCategory || '') && e.id.includes('-ca-')) continue
      if (!linked.has(e.id)) buckets.manual.push({ key: e.id, date: e.date, label: `${e.expenseCategory}: ${e.description || e.company || 'Record'}`, amount: e.amount })
    }
    const hasTypes = dtrLines.rows.some(l => !!l.type)
    const recordedAdvances = recordsForDtr.filter(e => /^CASH ADVANCE/i.test(e.expenseCategory || '')).reduce((acc, e) => acc + e.amount, 0)
    const cashAdvance = hasTypes && dtrExpenses.total != null ? Math.max(0, dtrExpenses.total - expenseLinesTotal - recordedAdvances) : 0
    const sum = (list: Item[]) => list.reduce((acc, i) => acc + i.amount, 0)
    return { buckets, cashAdvance, sum }
  }, [dtrPeriod, branchExpenses, dtrLines.rows, recordsForDtr, dtrExpenses.total])
  const [openBucket, setOpenBucket] = useState<string | null>(null)

  // Duplicates inside the period: every copy after the first is the amount possibly counted twice.
  const periodDupes = useMemo(() => {
    const inPeriod = new Set(periodRecords.map(e => e.id))
    let rows = 0
    let extra = 0
    for (const list of duplicateInfo.groups.values()) {
      const hits = list.filter(e => inPeriod.has(e.id))
      if (hits.length > 1) {
        rows += hits.length
        extra += hits.slice(1).reduce((sum, e) => sum + e.amount, 0)
      }
    }
    return { rows, extra }
  }, [periodRecords, duplicateInfo])

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

  // Month-end branch report: Summary + Differences ("Why the difference?") + the period's records.
  const handleExportMonthReport = () => {
    if (!dtrPeriod || !reconciliation) return
    const hasDtr = dtrExpenses.matched && !dtrExpenses.loading && dtrExpenses.total != null
    const r2 = (n: number) => Math.round(n * 100) / 100
    const purchaseLines = dtrLines.rows.filter(l => l.type === 'PURCHASE')
    const linesTyped = dtrLines.rows.some(l => !!l.type)
    // A purchase receipted in parts counts for what has been receipted so far; only the remainder is pending.
    const resolvedPurchases = purchaseLines.reduce((acc, l) => acc + (l.receiptReturned ? Math.min(l.actualAmount || l.amount, l.amount) : (l.actualAmount || 0)), 0)
    const pendingTotal = purchaseLines.filter(l => !l.receiptReturned).reduce((acc, l) => acc + Math.max(0, l.amount - (l.actualAmount || 0)), 0)
    const dtrSpend = (dtrExpenses.total || 0) + (linesTyped ? resolvedPurchases : dtrExpenses.purchases)
    const diff = hasDtr ? recordsTotalForDtr - dtrSpend : null
    const noPhotoCount = periodRecords.filter(e => !e.receiptImageUri && !isNoReceipt(e) && !/^CASH ADVANCE/i.test(e.expenseCategory || '')).length
    const noReceiptRecords = periodRecords.filter(isNoReceipt)
    const na = 'N/A (no DTR found)'
    const agingInPeriod = filterMonth === 'All' ? agingPurchases : agingPurchases.filter(p => p.date >= dtrPeriod.from && p.date <= dtrPeriod.to)
    const periodLabel = filterMonth === 'All' ? `${dtrPeriod.from} to ${dtrPeriod.to}` : filterMonth

    const summaryRows: (string | number)[][] = [
      ['Branch', branchName],
      ['Period', periodLabel],
      ['Generated', `${new Date().toLocaleString('en-PH')} by ${user?.name || user?.email || 'user'}`],
      [],
      ['Expense Records total (excl. deposits)', r2(recordsTotalForDtr)],
      ['Expense Records count', recordsForDtr.length],
      ['DTR Expenses', hasDtr ? r2(dtrExpenses.total || 0) : na],
      ['DTR purchases with receipt', hasDtr ? r2(linesTyped ? resolvedPurchases : dtrExpenses.purchases) : na],
      ['DTR Expenses + purchases with receipt', hasDtr ? r2(dtrSpend) : na],
      ['Purchases awaiting receipt (this period, not counted)', r2(pendingTotal)],
      ['Difference (Records - DTR)', diff == null ? na : r2(diff)],
      ['Status', diff == null ? na : Math.abs(diff) < 0.005 ? 'Balanced' : diff > 0 ? 'Records exceed DTR' : 'DTR exceeds records'],
      [],
      ['Deposit to HO - per DTR', hasDtr ? r2(dtrExpenses.deposits) : na],
      ['Deposit to HO - in records', r2(depositsForDtr)],
      ['Deposit to HO - difference (records - DTR)', hasDtr ? r2(depositsForDtr - dtrExpenses.deposits) : na],
      [],
      ['Possible duplicate rows', periodDupes.rows],
      ['Possible duplicate amount (extra copies)', r2(periodDupes.extra)],
      ['Records without receipt photo', noPhotoCount],
      ['Records saved with NO RECEIPT (count)', noReceiptRecords.length],
      ['Records saved with NO RECEIPT (amount)', r2(noReceiptRecords.reduce((acc, e) => acc + e.amount, 0))],
      ['Purchases awaiting receipt - this period (count)', agingInPeriod.length],
      ['Purchases awaiting receipt - this period (amount)', r2(agingInPeriod.reduce((acc, p) => acc + p.amount, 0))],
      ['Purchases awaiting receipt - this period, 8+ days old (count)', agingInPeriod.filter(p => p.ageDays >= 8).length],
      ['Reimbursements not found on the DTR (count)', dtrLines.rows.filter(l => l.type === 'PURCHASE' && (l.reimburseDue || 0) > 0.005 && !l.reimburseFound).length],
      ['Reimbursements not found on the DTR (amount)', r2(dtrLines.rows.filter(l => l.type === 'PURCHASE' && (l.reimburseDue || 0) > 0.005 && !l.reimburseFound).reduce((acc, l) => acc + (l.reimburseDue || 0), 0))],
      ['Cash returns not found on the DTR (count)', dtrLines.rows.filter(l => l.type === 'PURCHASE' && (l.refundDue || 0) > 0.005 && !l.cashReturnFound).length],
      ['Cash returns not found on the DTR (amount)', r2(dtrLines.rows.filter(l => l.type === 'PURCHASE' && (l.refundDue || 0) > 0.005 && !l.cashReturnFound).reduce((acc, l) => acc + (l.refundDue || 0), 0))],
    ]

    const bucketMeta: { id: keyof typeof reconciliation.buckets; title: string; side: string }[] = [
      { id: 'depositAsExpense', title: 'Deposits to HO entered as expenses', side: 'DTR' },
      { id: 'pendingPurchase', title: 'Purchases waiting for receipt', side: 'DTR' },
      { id: 'neverPushed', title: 'DTR entries with no record', side: 'DTR' },
      { id: 'deleted', title: 'Records deleted', side: 'DTR' },
      { id: 'otherMonth', title: 'Recorded in a different month', side: 'DTR' },
      { id: 'amountDiff', title: 'Amount differs', side: 'DTR' },
      { id: 'manual', title: 'Records not on any DTR', side: 'Records' },
    ]
    const differenceRows: Record<string, string | number>[] = []
    for (const b of bucketMeta) {
      for (const i of reconciliation.buckets[b.id]) {
        differenceRows.push({ Bucket: b.title, Affects: b.side, Date: i.date, Description: i.label, Amount: r2(i.amount), Note: i.note || '' })
      }
    }
    if (reconciliation.cashAdvance > 0.005) {
      differenceRows.push({ Bucket: 'Cash advances on the DTR', Affects: 'DTR', Date: '', Description: 'Counted in DTR Expenses, not kept in Expense Records', Amount: r2(reconciliation.cashAdvance), Note: '' })
    }
    if (differenceRows.length === 0) {
      differenceRows.push({ Bucket: hasDtr ? 'Every DTR entry matches a record' : 'No DTR found for comparison', Affects: '', Date: '', Description: '', Amount: 0, Note: '' })
    }

    const recordRows = [...periodRecords]
      .sort((a, b) => dateToTime(a.date) - dateToTime(b.date))
      .map(e => ({
        Date: e.date,
        'Incurred By': e.incurredBy,
        Company: e.company,
        Description: e.description,
        'Receipt No': e.receiptNo || '',
        Category: e.expenseCategory,
        'Source of Funds': e.sourceOfFunds || '',
        Amount: r2(e.amount),
        'Has Photo': e.receiptImageUri ? 'Y' : 'N',
        'No Receipt': isNoReceipt(e) ? 'Y' : 'N',
        'From DTR': e.id.startsWith('dtr-') ? 'Y' : 'N',
      }))

    const wb = XLSX.utils.book_new()
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [{ wch: 52 }, { wch: 34 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
    const wsDiff = XLSX.utils.json_to_sheet(differenceRows)
    wsDiff['!cols'] = [{ wch: 36 }, { wch: 9 }, { wch: 12 }, { wch: 60 }, { wch: 14 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(wb, wsDiff, 'Differences')
    const wsRecords = recordRows.length > 0 ? XLSX.utils.json_to_sheet(recordRows) : XLSX.utils.aoa_to_sheet([['No records in this period']])
    wsRecords['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 50 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, wsRecords, 'Records')

    const safeBranch = (branchName || 'BRANCH').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    const periodKey = filterMonth === 'All' ? `${dtrPeriod.from}_to_${dtrPeriod.to}` : dtrPeriod.from.slice(0, 7)
    XLSX.writeFile(wb, `${safeBranch}_${periodKey}_expense_reconciliation.xlsx`)
  }

  useEffect(() => {
    if (editing && isNoReceipt(editing)) {
      const at = (editing.description || '').indexOf(NO_RECEIPT_SEP)
      setNoReceiptForm(true)
      setNoReceiptReasonForm(at >= 0 ? editing.description.slice(at + NO_RECEIPT_SEP.length) : '')
      // show the plain description and an empty receipt no. in the form; the marker is added back on save
      setForm(f => ({ ...f, description: at >= 0 ? editing.description.slice(0, at) : editing.description, receiptNo: '' }))
    } else {
      setNoReceiptForm(false)
      setNoReceiptReasonForm('')
    }
  }, [editing])

  const pickPhotoFor = (row: AuditExpense) => {
    photoTargetRef.current = row
    photoInputRef.current?.click()
  }

  const handleAttachPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const row = photoTargetRef.current
    e.target.value = ''
    photoTargetRef.current = null
    if (!file || !row) return
    setAttachingPhotoId(row.id)
    try {
      const result = await uploadReceiptImage(file, { folder: 'finance', branch: row.branchName || branchName, description: row.description || row.company, filename: 'expense' })
      const now = new Date().toISOString()
      await upsertAuditExpense({
        ...row,
        receiptImageUri: result.url,
        updatedBy: currentUserLabel,
        updatedAt: now,
        updateHistory: [...(row.updateHistory || []), { action: 'updated', by: currentUserLabel, at: now }],
      })
      await reload()
    } catch (err) {
      console.error('[Expense Records] Attach receipt photo failed:', err)
      alert('Could not attach the photo. Please try again.')
    } finally {
      setAttachingPhotoId(null)
    }
  }

  // Adds the receipt to a purchase: creates the Expense Record and marks the DTR purchase line as received
  // (receipt no., actual amount, date, photo) in one call.
  const resolvePendingPurchase = async (target: PendingPurchase, r: ReceiptDialogResult) => {
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const res = await fetch(`${API_BASE_URL}/v1/reports/purchases/${encodeURIComponent(target.id)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        receiptNo: r.receiptNo,
        actualAmount: parseFloat(r.amount),
        receiptDate: r.receiptDate,
        company: r.company,
        description: r.description,
        expenseCategory: r.expenseCategory,
        sourceOfFunds: r.sourceOfFunds,
        incurredBy: r.incurredBy,
        receiptImage: r.receiptImage,
        closeRemaining: r.closeRemaining,
      }),
    })
    if (!res.ok) {
      let msg = `Could not save the receipt (HTTP ${res.status})`
      try { const j = await res.json(); msg = j.error || j.message || msg } catch { /* keep default */ }
      alert(msg)
      return
    }
    const out = await res.json() as { refundDue?: number; cashReturnFound?: boolean; complete?: boolean; remaining?: number }
    setReceiptTarget(null)
    setDataVersion(v => v + 1)
    await reload()
    const over = Math.round((parseFloat(r.amount) - target.amount) * 100) / 100
    if (out.complete === false && (out.remaining || 0) > 0.005) {
      alert(`Receipt saved to the DTR and Expense Records.\n\n₱${(out.remaining || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} of this purchase is still pending. Add the next receipt when you have it — it stays in Pending receipts until the receipts cover the cash given.`)
    } else if (over > 0.005) {
      alert(`Receipt saved to the DTR and Expense Records (₱${target.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}, the cash given).\n\nThe receipt is ₱${over.toLocaleString('en-PH', { minimumFractionDigits: 2 })} higher than that. ${target.worker || 'The member'} paid the extra, so add a REIMBURSE row for ₱${over.toLocaleString('en-PH', { minimumFractionDigits: 2 })} under Expenses with Receipts on the DTR — it is offered there ready-filled.`)
    } else if ((out.refundDue || 0) > 0.005 && !out.cashReturnFound) {
      alert(`Receipt saved to the DTR and Expense Records.\n\nThe receipt is ₱${(out.refundDue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} lower than the cash given. Make sure that cash return is entered under Cash Returns on the DTR (pick the REFUND entry for this purchase).`)
    }
  }

  // A part-receipted purchase whose rest was handed back as cash: close it; the Cash Return is then added on the DTR.
  const returnPendingAsCash = async (p: PendingPurchase) => {
    const amt = p.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })
    if (!window.confirm(`Close this purchase and treat the remaining ₱${amt} as cash returned by ${p.worker || 'the member'}?\n\nIt is then added as a Cash Return (e.g. “MATERIAL CHANGE”) on the DTR — it is offered ready-filled under Cash Returns on the DTR of the day the cash comes back.`)) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const res = await fetch(`${API_BASE_URL}/v1/reports/purchases/${encodeURIComponent(p.id)}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      let msg = `Could not close the purchase (HTTP ${res.status})`
      try { const j = await res.json(); msg = j.error || j.message || msg } catch { /* keep default */ }
      alert(msg)
      return
    }
    setDataVersion(v => v + 1)
    await reload()
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
        setScanPreview(null)
        setUploadedReceiptUrl(null)
      } else {
        // Updating an existing receipt — close the form
        setShowForm(false); setEditing(null); setForm(emptyForm(resolveFormBranchId(branchId))); setDateRaw(formatTodayReceiptDate()); setDateError('')
        setScanPreview(null); setScannedFields(new Set()); setScanError(''); setUploadedReceiptUrl(null)
      }
    } else {
      // New receipt saved — ask whether to add another before deciding what happens to the form
      setShowAddAnotherPrompt(true)
    }
  }

  const handleAddAnother = () => {
    setShowAddAnotherPrompt(false)
    // Keep form open, clear fields (including date) for next entry
    setForm({ ...emptyForm(resolveFormBranchId(branchId)), date: '' }); setDateRaw(''); setDateError('')
    setScanPreview(null); setScannedFields(new Set()); setScanError(''); setUploadedReceiptUrl(null)
    // Focus the first field for quick next entry
    setTimeout(() => { document.getElementById('receipt-date')?.focus() }, 50)
  }

  const handleDoneAdding = () => {
    setShowAddAnotherPrompt(false)
    setShowForm(false); setEditing(null); setForm(emptyForm(resolveFormBranchId(branchId))); setDateRaw(formatTodayReceiptDate()); setDateError('')
    setScanPreview(null); setScannedFields(new Set()); setScanError(''); setUploadedReceiptUrl(null)
  }

  const confirmUpdateDuplicate = async () => {
    if (!duplicateModal) return
    const { existingExpense, newExpense } = duplicateModal
    if (!canModifyRecord(existingExpense)) { alert(`That record comes from a DTR. ${dtrLinkedHint(existingExpense)}.`); return }
    if (isDtrLinked(existingExpense) && !window.confirm('This record comes from a DTR. Changing it here will not update the DTR. Continue?')) return
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
    if (!editing && !canAddRecord) { alert('Add branch expenses through the DTR — it creates the Expense Record for you.'); return }
    const amount = parseFloat(form.amount.replace(/,/g, ''))
    if (!form.company.trim() && !form.description.trim()) { alert('Enter company or description.'); return }
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return }
    if (!form.date.trim()) { alert('Enter a valid date.'); return }
    // No receipt: allowed (with a reason) instead of the photo; a photo, if one is attached, wins.
    const noReceipt = noReceiptForm && !uploadedReceiptUrl
    if (noReceipt && noReceiptReasonForm.trim().length < 5) { alert('Say why there is no receipt (at least 5 characters).'); return }
    const baseDescription = form.description.split(NO_RECEIPT_SEP)[0].trim()
    const finalDescription = noReceipt ? `${baseDescription}${NO_RECEIPT_SEP}${noReceiptReasonForm.trim()}` : baseDescription
    const finalReceiptNo = noReceipt ? NO_RECEIPT_NO : form.receiptNo.trim()
    if (form.expenseCategory === 'OTHER' && form.description.trim().length < 10) { alert('Category "Other" needs a clear description (what and why) — at least 10 characters.'); return }
    {
      const d = new Date(parseSmartDate(form.date.trim()) || form.date.trim())
      const needsPhoto = !isNaN(d.getTime()) && d >= new Date('2026-10-01T00:00:00')
      if (needsPhoto && !noReceipt && !uploadedReceiptUrl && !editing?.receiptImageUri) {
        alert('Attach a photo of the receipt. From October 2026 every expense record needs its receipt.')
        return
      }
    }

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

    if (editing && isDtrLinked(editing) && !window.confirm('This record comes from a DTR. Changing it here will not update the DTR. Continue?')) return

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
        description: finalDescription,
        receiptNo: finalReceiptNo,
        amount,
        expenseCategory: form.expenseCategory,
        sourceOfFunds: form.sourceOfFunds.trim(),
        receiptImageUri: uploadedReceiptUrl || undefined,
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
        description: finalDescription,
        receiptNo: finalReceiptNo,
        amount,
        expenseCategory: form.expenseCategory,
        sourceOfFunds: form.sourceOfFunds.trim(),
        receiptImageUri: uploadedReceiptUrl || undefined,
        inputBy: currentUserLabel,
        createdBy: currentUserLabel,
        updatedBy: currentUserLabel,
        createdAt: now,
        updatedAt: now,
        updateHistory: [{ action: 'created', by: currentUserLabel, at: now }]
      }

    const normalizedReceiptNo = noReceipt ? '' : (form.receiptNo || '').trim().toUpperCase()
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
    if (!canModifyRecord(row)) return
    setDetailRow(null)
    setEditing(row); setDateRaw(row.date); setDateError(''); setScanPreview(row.receiptImageUri || null)
    setUploadedReceiptUrl(row.receiptImageUri || null)
    const resolvedBranchId = resolveFormBranchId(row.branchId)
    setForm({ date: row.date, company: row.company, description: row.description, receiptNo: row.receiptNo, amount: String(row.amount), expenseCategory: row.expenseCategory, sourceOfFunds: row.sourceOfFunds, incurredBy: row.incurredBy, branchId: resolvedBranchId })
    setShowForm(true)
  }

  const startEditInModal = (row: AuditExpense) => {
    if (!canModifyRecord(row)) return
    setEditing(row)
    setDateRaw(row.date)
    setDateError('')
    setScanPreview(row.receiptImageUri || null)
    setUploadedReceiptUrl(row.receiptImageUri || null)
    const resolvedBranchId = resolveFormBranchId(row.branchId)
    setForm({ date: row.date, company: row.company, description: row.description, receiptNo: row.receiptNo, amount: String(row.amount), expenseCategory: row.expenseCategory, sourceOfFunds: row.sourceOfFunds, incurredBy: row.incurredBy, branchId: resolvedBranchId })
    setIsEditingInModal(true)
  }

  const openDetails = (row: AuditExpense, e?: React.MouseEvent) => {
    e?.preventDefault()
    setDetailRow(row)
  }

  const handleDeleteRecord = async (row: AuditExpense) => {
    if (!canModifyRecord(row)) return
    if (isDtrLinked(row) && !window.confirm('This record comes from a DTR. Deleting it here will not remove the DTR line. Continue?')) return
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

    // Persist the receipt image to Supabase Storage (runs alongside the OCR scan below)
    setUploadedReceiptUrl(null)
    setUploadingReceipt(true)
    const resolvedBranchId = form.branchId || branchId
    const resolvedBranchName = (allBranches.length > 0 ? allBranches : branches).find(b => b.id === resolvedBranchId)?.name || branchName
    uploadReceiptImage(file, {
      folder: 'finance',
      branch: resolvedBranchName,
      description: form.description || form.company,
      filename: 'expense'
    })
      .then((result) => setUploadedReceiptUrl(result.url))
      .catch((err) => console.error('[Supabase Storage] Finance receipt upload failed:', err))
      .finally(() => setUploadingReceipt(false))

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

  const handleModalImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file.')
      return
    }
    const localUrl = URL.createObjectURL(file)
    setScanPreview(localUrl)
    setUploadingReceipt(true)
    try {
      const resolvedBranchId = form.branchId || branchId
      const resolvedBranchName = (allBranches.length > 0 ? allBranches : branches).find(b => b.id === resolvedBranchId)?.name || branchName
      const result = await uploadReceiptImage(file, {
        folder: 'finance',
        branch: resolvedBranchName,
        description: form.description || form.company,
        filename: 'expense'
      })
      setUploadedReceiptUrl(result.url)
    } catch (err) {
      console.error('[Finance Modal] Image upload failed:', err)
    } finally {
      setUploadingReceipt(false)
    }
  }

  const handleModalPaste = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const file = new File([blob], 'pasted-receipt.png', { type: imageType })
          await handleModalImageUpload(file)
          return
        }
      }
      alert('No image found in clipboard. Please copy an image first.')
    } catch {
      alert('Unable to paste image. Please ensure clipboard permissions are allowed or click Upload.')
    }
  }

  const handleModalDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleModalImageUpload(files[0])
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



  const noReceiptControl = uploadedReceiptUrl ? null : (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: textPrimary }}>
        <input type="checkbox" checked={noReceiptForm} onChange={e => setNoReceiptForm(e.target.checked)} />
        No receipt available for this expense
      </label>
      {noReceiptForm && (
        <input value={noReceiptReasonForm} onChange={e => setNoReceiptReasonForm(e.target.value)}
          placeholder="Why is there no receipt? (e.g. toll gate, no OR issued)"
          className="w-full rounded-lg px-3 py-2 text-xs outline-none"
          style={{ backgroundColor: inputBg, border: `1px solid ${noReceiptReasonForm.trim().length < 5 ? danger : inputBorder}`, color: textPrimary }} />
      )}
    </div>
  )

  if (!canAccess) return <div className="p-8 text-center" style={{ color: textMuted }}>Expense records are available for branch employees, managers, and admins only.</div>

  if (initialLoading || !revealed) {
    return (
      <div style={{ minHeight: '80vh', backgroundColor: bg }} className="flex items-center justify-center w-full">
        <AshcolLoader />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg }} className="flex flex-col gap-3 px-2 py-3 md:p-6 pb-12">

      {/* ── HEADER ── */}
      <div className="rounded-2xl px-4 py-3.5 flex flex-col gap-3"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.05)' : '0 1px 2px rgba(0,0,0,0.2)' }}>

        {/* Title + controls — one row on desktop */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}1A`, color: accent }}>
              <ClipboardList size={18} />
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="text-base font-extrabold tracking-tight leading-tight" style={{ color: textPrimary }}>Expense Records</h1>
              <div className="flex items-center gap-1.5 text-[11px] font-medium min-w-0" style={{ color: textMuted }}>
                <Building2 size={11} className="shrink-0" />
                <span className="truncate">{branchName || 'Select branch'}</span>
                {activeTab === 'expenses' && branchId && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="truncate">{filterMonth === 'All' ? 'All months' : filterMonth}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {/* Month picker */}
            {activeTab === 'expenses' && branchId && (
              <div style={{ position: 'relative' }} className="shrink-0 w-full lg:w-auto">
                <CalendarDays size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="w-full lg:w-auto rounded-lg pl-8 pr-7 py-2 text-xs appearance-none outline-none cursor-pointer font-bold uppercase tracking-wider"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, colorScheme: isLight ? 'light' : 'dark', minWidth: 155 }}
                >
                  <option value="All">All months</option>
                  {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown size={11} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
              </div>
            )}

            {activeTab === 'expenses' && (
              <>
                {/* Desktop actions */}
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  {!canAddRecord && (
                    <span className="text-[11px] font-semibold px-3 py-2 rounded-lg" style={{ color: textMuted, border: `1px solid ${border}` }}>
                      Add expenses through the DTR
                    </span>
                  )}
                  {canAddRecord && (
                  <button
                    type="button"
                    onClick={() => {
                      if (showForm) {
                        setShowForm(false); setEditing(null)
                      } else {
                        setEditing(null); setForm({ ...emptyForm(resolveFormBranchId(branchId)), date: '' }); setDateRaw(''); setDateError(''); setShowForm(true)
                      }
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white shadow-sm transition-all hover:opacity-90"
                    style={{ backgroundColor: showForm ? '#EF4444' : accent }}
                  >
                    {showForm ? <><X size={13} /> Close</> : <><Plus size={13} /> Add Record</>}
                  </button>
                  )}
                </div>

                {/* Hidden inputs */}
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanImage} />
              </>
            )}
          </div>
        </div>

        {/* Mobile: 3-column action grid */}
        {activeTab === 'expenses' && !canAddRecord && (
          <div className="sm:hidden w-full text-center text-[11px] font-semibold px-3 py-2 rounded-lg" style={{ color: textMuted, border: `1px solid ${border}` }}>
            Add expenses through the DTR
          </div>
        )}
        {activeTab === 'expenses' && canAddRecord && (
          <div className="grid grid-cols-2 gap-2 sm:hidden w-full">
            <button
              type="button"
              onClick={() => {
                      if (showForm) {
                        setShowForm(false); setEditing(null)
                      } else {
                        setEditing(null); setForm({ ...emptyForm(resolveFormBranchId(branchId)), date: '' }); setDateRaw(''); setDateError(''); setShowForm(true)
                      }
                    }}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold text-white transition-all active:scale-95 shadow-sm"
              style={{ backgroundColor: showForm ? '#EF4444' : accent }}
            >
              {showForm ? <X size={20} /> : <Plus size={20} />}
              <span>{showForm ? 'Close' : 'Add Record'}</span>
            </button>
            <button
              type="button"
              disabled={scanning}
              onClick={handleCameraClick}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold text-white transition-all active:scale-95 shadow-sm"
              style={{ backgroundColor: '#6366F1', opacity: scanning ? 0.6 : 1 }}
              title="Open camera to scan receipt"
            >
              <Camera size={20} />
              <span>Scan</span>
            </button>
          </div>
        )}
      </div>

      {/* ── ENTRY FORM (PORTALED) ── */}
      {showForm && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-6">
          <div
          onClick={(e) => e.stopPropagation()}
          className="fixed sm:relative inset-0 sm:inset-auto z-[100] sm:z-auto rounded-none sm:rounded-2xl flex flex-col gap-5 p-5 pb-8 sm:p-6 overflow-y-auto overscroll-contain h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-3xl sm:mx-auto"
          style={{ backgroundColor: cardBg, boxShadow: `0 8px 40px rgba(0,0,0,0.35)` }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 w-full pt-2 sm:pt-0 pb-4 sm:pb-3 border-b" style={{ borderColor: inputBorder }}>
            <div className="flex items-center justify-between w-full sm:w-auto">
              <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: textPrimary }}>
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

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="grid grid-cols-3 sm:flex items-center gap-2 flex-1 sm:flex-none">
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
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); setScanPreview(null) }} className="hidden sm:flex shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors" style={{ color: textMuted }}><X size={18} /></button>
            </div>
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
                {uploadingReceipt && (
                  <p className="text-xs mt-2 flex items-center gap-1" style={{ color: textMuted }}><Loader2 size={11} className="animate-spin" /> Saving image to storage…</p>
                )}
                {!uploadingReceipt && uploadedReceiptUrl && (
                  <p className="text-xs mt-2" style={{ color: accent }}>✓ Image saved to storage</p>
                )}
                <button type="button" onClick={() => { setScanPreview(null); setScannedFields(new Set()); setScanError(''); setUploadedReceiptUrl(null) }} className="text-xs mt-2" style={{ color: textMuted }}>× Clear</button>
              </div>
            )}

            {/* Form grid */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 sm:gap-x-4 sm:gap-y-3" onKeyDown={handleFormKeyDown}>
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

              {/* No receipt option */}
              {noReceiptControl && field('Receipt', noReceiptControl)}

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
          <div className="pt-1 border-t" style={{ borderColor: inputBorder }}>
            <div className="flex items-center justify-between pt-4">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: textMuted }}>Expense Category</label>
              {isAdmin && (
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
              )}
            </div>
            
            {!isEditingCategories && (
              <div className="relative mt-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: textMuted }} />
                <input
                  value={categoryQuery}
                  onChange={(e) => setCategoryQuery(e.target.value)}
                  placeholder="Search category…"
                  className="w-full pl-8 pr-8 py-2 rounded-lg text-xs font-semibold outline-none"
                  style={{ border: `1px solid ${inputBorder}`, backgroundColor: inputBg, color: textPrimary }}
                />
                {categoryQuery && (
                  <button type="button" onClick={() => setCategoryQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: textMuted }}><X size={13} /></button>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3 max-h-56 overflow-y-auto pr-1">
              {isEditingCategories ? (
                // --- Edit Mode / Reorder Mode ---
                sortedCategoryDetails.map((cat, idx) => {
                  const isEditingThis = editingCategoryDetail?.id === cat.id
                  return (
                    <div
                      key={cat.id}
                      draggable={false}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none shadow-sm"
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
                visibleCategories.map((cat) => (
                  <button key={cat} type="button" onClick={() => setForm((f) => ({ ...f, expenseCategory: cat as AuditExpenseCategory }))}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-102"
                    style={{ border: `1px solid ${form.expenseCategory === cat ? accent : inputBorder}`, backgroundColor: form.expenseCategory === cat ? `${accent}22` : inputBg, color: form.expenseCategory === cat ? accent : textMuted }}>
                    {cat}
                  </button>
                ))
              )}

              {!isEditingCategories && visibleCategories.length === 0 && (
                <span className="text-xs" style={{ color: textMuted }}>No category matches "{categoryQuery}".{isAdmin ? ' Use New to add one.' : ' Pick the closest one, or Other.'}</span>
              )}

              {/* Add custom category (admins only — members pick from the general list) */}
              {isAdmin && (addingCategory ? (
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
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-end pt-6 sm:pt-4 mt-2 border-t"
            style={{ borderColor: inputBorder }}>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null) }}
              className="flex-1 sm:flex-none px-4 py-3 sm:py-2.5 text-sm rounded-xl sm:rounded-lg font-semibold"
              style={{ color: textMuted, backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
              disabled={savingReceipt}>Cancel</button>
            <button type="button" onClick={submitReceipt}
              className="flex-1 sm:flex-none px-5 py-3 sm:py-2.5 rounded-xl text-sm font-bold text-white shadow flex items-center gap-2 justify-center transition-all active:scale-95"
              style={{ backgroundColor: activeAccent }} disabled={savingReceipt}>
              {savingReceipt ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : (editing ? 'Apply Updates' : 'Save Record')}
            </button>
          </div>
        </div>
        </div>
        </>, document.body
      )}

      {/* ── ADD ANOTHER RECEIPT? PROMPT (shown after saving a new record) ── */}
      {showAddAnotherPrompt && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: '1rem'
        }}>
          <div style={{
            backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '1rem',
            width: '100%', maxWidth: '380px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
            padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem'
          }}>
            <div>
              <h3 style={{ color: textPrimary, fontWeight: 'bold', fontSize: '1.05rem', margin: 0 }}>Receipt saved</h3>
              <p style={{ color: textMuted, fontSize: '0.875rem', margin: '0.35rem 0 0 0' }}>Do you want to add another receipt?</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={handleDoneAdding}
                className="px-4 py-2.5 text-sm rounded-lg font-semibold"
                style={{ color: textMuted, backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                Done
              </button>
              <button type="button" onClick={handleAddAnother}
                className="px-4 py-2.5 rounded-lg text-sm font-bold text-white shadow"
                style={{ backgroundColor: accent }}>
                Add Another
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => void handleAttachPhoto(e)} />

      {receiptTarget && (
        <ReceiptScanDialog
          mode="expense"
          branchName={branchName}
          reportDate={receiptTarget.date}
          expectedAmount={receiptTarget.amount}
          initial={{ incurredBy: receiptTarget.worker, sourceOfFunds: 'CASH' }}
          otherReceiptNos={branchExpenses.map(e => e.receiptNo).filter(Boolean)}
          onClose={() => setReceiptTarget(null)}
          onConfirm={r => resolvePendingPurchase(receiptTarget, r)}
        />
      )}

      {/* ── Expense Records vs DTR summary ── */}
      {activeTab === 'expenses' && branchId && dtrPeriod && (() => {
        const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}`
        const summaryLoading = dtrExpenses.loading || dtrLines.loading
        const hasDtr = dtrExpenses.matched && !summaryLoading && dtrExpenses.total != null
        // Expense Records hold both expenses and resolved purchases (materials), so compare them with
        // the DTR's Expenses + Purchases, not Expenses alone.
        const purchaseLines = dtrLines.rows.filter(l => l.type === 'PURCHASE')
        const linesTyped = dtrLines.rows.some(l => !!l.type)
        const resolvedPurchases = purchaseLines.reduce((acc, l) => acc + (l.receiptReturned ? Math.min(l.actualAmount || l.amount, l.amount) : (l.actualAmount || 0)), 0)
        const pendingPurchases = purchaseLines.filter(l => !l.receiptReturned).reduce((acc, l) => acc + Math.max(0, l.amount - (l.actualAmount || 0)), 0)
        const dtrSpend = (dtrExpenses.total || 0) + (linesTyped ? resolvedPurchases : dtrExpenses.purchases)
        const diff = hasDtr ? recordsTotalForDtr - dtrSpend : null
        const balanced = diff != null && Math.abs(diff) < 0.005
        const diffColor = diff == null ? textMuted : balanced ? accent : danger
        const depositDiff = depositsForDtr - dtrExpenses.deposits
        const pulse = <span className="inline-block h-6 w-28 rounded-md animate-pulse align-middle" style={{ backgroundColor: `${textMuted}2e` }} />
        const miniStat = (label: string, value: React.ReactNode, color: string, title?: string) => (
          <div title={title} className="flex flex-col gap-0 rounded-lg px-3 py-1 min-w-[112px]" style={{ border: `1px solid ${border}` }}>
            <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: textMuted }}>{label}</span>
            <span className="text-base font-black tabular-nums leading-tight whitespace-nowrap" style={{ color }}>{value}</span>
          </div>
        )
        // Reasons the records and the DTR differ (shown in a popup, count in the header)
        const why = hasDtr && reconciliation ? (() => {
              const { buckets, cashAdvance, sum } = reconciliation
              const rows: { id: string; title: string; hint: string; list: typeof buckets.manual; amount: number; side: 'dtr' | 'records' }[] = [
                { id: 'depositAsExpense', title: 'Deposits to HO entered as expenses', hint: 'Logged as DTR expense rows before the COH Deposit section existed. They inflate DTR Expenses; move them to COH Deposit on those DTRs.', list: buckets.depositAsExpense, amount: sum(buckets.depositAsExpense), side: 'dtr' },
                { id: 'pendingPurchase', title: 'Purchases waiting for receipt', hint: 'Not counted in the comparison until the receipt is returned — resolve them in Purchases so they become records.', list: buckets.pendingPurchase, amount: sum(buckets.pendingPurchase), side: 'dtr' },
                { id: 'neverPushed', title: 'DTR entries with no record', hint: 'Saved on the DTR but never sent to Expense Records (older DTRs or imported totals). Re-save the DTR to push them.', list: buckets.neverPushed, amount: sum(buckets.neverPushed), side: 'dtr' },
                { id: 'deleted', title: 'Records deleted', hint: 'The DTR entry was linked to a record that has since been deleted.', list: buckets.deleted, amount: sum(buckets.deleted), side: 'dtr' },
                { id: 'otherMonth', title: 'Recorded in a different month', hint: 'The record’s receipt date falls outside this month, so it is counted elsewhere.', list: buckets.otherMonth, amount: sum(buckets.otherMonth), side: 'dtr' },
                { id: 'amountDiff', title: 'Amount differs', hint: 'The DTR amount and the record amount do not match (positive = DTR higher).', list: buckets.amountDiff, amount: sum(buckets.amountDiff), side: 'dtr' },
                { id: 'manual', title: 'Records not on any DTR', hint: 'Added directly in Expense Records — they raise the records total.', list: buckets.manual, amount: sum(buckets.manual), side: 'records' },
              ]
              const visible = rows.filter(r => r.list.length > 0)
          return { cashAdvance, visible }
        })() : null
        const cashAdvance = why?.cashAdvance ?? 0
        const visible = why?.visible ?? []
        const whyCount = visible.length + (cashAdvance > 0.005 ? 1 : 0)
        return (
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
              <span className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>Summary</span>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={periodDupes.rows === 0} onClick={() => setShowDupesOnly(v => !v)}
                  title={periodDupes.rows === 0 ? 'No repeated receipts found' : `${signed(periodDupes.extra)} extra · click to ${showDupesOnly ? 'show all records' : 'show only these'}`}
                  className="flex flex-col text-left rounded-lg px-3 py-1 min-w-[112px] disabled:cursor-default"
                  style={{ border: `1px solid ${periodDupes.rows === 0 ? border : `${danger}66`}`, cursor: periodDupes.rows === 0 ? 'default' : 'pointer' }}>
                  <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: textMuted }}>Possible duplicates</span>
                  <span className="text-base font-black leading-tight whitespace-nowrap" style={{ color: periodDupes.rows === 0 ? accent : danger }}>{periodDupes.rows === 0 ? 'None' : `${periodDupes.rows} rows`}</span>
                </button>
                {miniStat('Deposit to HO', fmt(hasDtr ? dtrExpenses.deposits : depositsForDtr), textPrimary,
                  hasDtr ? `Per DTR · in records ${fmt(depositsForDtr)} · ${signed(depositDiff)}` : `${periodRecords.filter(isDepositRecord).length} deposit record(s)`)}
                {miniStat('Expense Records', fmt(recordsTotalForDtr), textPrimary, `${recordsForDtr.length} record${recordsForDtr.length === 1 ? '' : 's'} · excl. deposits`)}
                {miniStat('DTR Exp. + Purchases', summaryLoading ? pulse : !hasDtr ? 'Unavailable' : fmt(dtrSpend), textPrimary,
                  summaryLoading ? 'Loading this month…' : !dtrExpenses.matched ? 'No DTR found for this branch'
                    : linesTyped
                      ? `Expenses ${fmt(dtrExpenses.total || 0)} · Purchases w/ receipt ${fmt(resolvedPurchases)}${pendingPurchases > 0 ? ` · ${fmt(pendingPurchases)} awaiting receipt (not counted)` : ''}`
                      : `Expenses ${fmt(dtrExpenses.total || 0)} · Purchases ${fmt(dtrExpenses.purchases)}`)}
                {miniStat('Difference', summaryLoading ? pulse : diff == null ? '—' : signed(diff), diffColor, 'Records − DTR')}
                {whyCount > 0 && (
                  <button type="button" onClick={() => setWhyOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-full text-xs font-bold uppercase tracking-wide whitespace-nowrap min-w-[250px] cursor-pointer transition-opacity hover:opacity-80"
                    style={{ color: textPrimary, border: `1px solid ${border}` }}>
                    Why the difference? · {whyCount} reason{whyCount === 1 ? '' : 's'}
                  </button>
                )}
                {diff != null && (
                  <span className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-full text-xs font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: diffColor, backgroundColor: `${diffColor}18`, border: `1px solid ${diffColor}44` }}>
                    {balanced ? 'Balanced' : diff > 0 ? 'Records exceed DTR' : 'DTR exceeds records'}
                  </span>
                )}
                <button type="button" onClick={handleExportMonthReport} disabled={dtrLines.loading || dtrExpenses.loading || !reconciliation}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-full text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
                  title="Download Summary, Differences and Records for this period as an Excel file">
                  <Download size={14} /> Export month report
                </button>
              </div>
            </div>
            {whyOpen && why && createPortal(
              <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50">
                <div className="w-full max-w-5xl min-h-[60vh] max-h-[92vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                  <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${border}` }}>
                    <div className="flex flex-col">
                      <span className="text-lg font-black uppercase tracking-wider" style={{ color: textPrimary }}>Why the difference?</span>
                      <span className="text-[11px]" style={{ color: textMuted }}>{filterMonth === 'All' ? `${dtrPeriod.from} to ${dtrPeriod.to}` : filterMonth} · Records vs DTR{diff != null ? ` · ${signed(diff)}` : ''}</span>
                    </div>
                    <button type="button" onClick={() => setWhyOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer" style={{ color: textMuted }} title="Close"><X size={22} /></button>
                  </div>
                  <div className="overflow-y-auto" style={{ zoom: 1.2 }}>
                  {cashAdvance > 0.005 && (
                    <div className="px-3 py-2 flex items-center justify-between gap-3 text-xs" style={{ borderBottom: `1px solid ${border}` }}>
                      <div className="flex flex-col">
                        <span className="font-bold" style={{ color: textPrimary }}>Cash advances on the DTR</span>
                        <span className="text-[10px]" style={{ color: textMuted }}>Counted in DTR Expenses, but not kept in Expense Records.</span>
                      </div>
                      <span className="font-black tabular-nums" style={{ color: danger }}>-{fmt(cashAdvance)}</span>
                    </div>
                  )}
                  {!dtrLines.loading && visible.length === 0 && cashAdvance <= 0.005 && (
                    <div className="px-3 py-2 text-xs" style={{ color: textMuted }}>Every DTR entry matches a record.</div>
                  )}
                  {visible.map(r => {
                    const open = openBucket === r.id
                    const color = r.side === 'records' ? accent : danger
                    return (
                      <div key={r.id} style={{ borderBottom: `1px solid ${border}` }}>
                        <button type="button" onClick={() => setOpenBucket(open ? null : r.id)} className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold" style={{ color: textPrimary }}>{r.title} <span style={{ color: textMuted }}>· {r.list.length}</span></span>
                            <span className="text-[10px]" style={{ color: textMuted }}>{r.hint}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-black tabular-nums" style={{ color }}>{r.side === 'records' ? '+' : '-'}{fmt(Math.abs(r.amount))}</span>
                            <ChevronDown size={13} style={{ color: textMuted, transform: open ? 'rotate(180deg)' : undefined }} />
                          </div>
                        </button>
                        {open && (
                          <div className="px-3 pb-2 max-h-56 overflow-y-auto">
                            {r.list.map(i => (
                              <div key={i.key} className="flex items-center justify-between gap-3 py-1 text-[11px]" style={{ borderTop: `1px dashed ${border}` }}>
                                <span className="shrink-0 tabular-nums" style={{ color: textMuted }}>{i.date}</span>
                                <span className="flex-1 min-w-0 truncate" style={{ color: textPrimary }} title={i.label}>{i.label}{i.note && <span style={{ color: textMuted }}> · {i.note}</span>}</span>
                                <span className="shrink-0 font-bold tabular-nums" style={{ color: textPrimary }}>{fmt(i.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  </div>
                </div>
              </div>,
              document.body
            )}
            <div className="p-3 pb-0">
            {/* Everything still waiting for a receipt: purchases without one + records without a photo. Newest first. */}
            {(() => {
              const isoOf = (t: number) => {
                const d = new Date(t)
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
              }
              const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0)
              type Pending = { key: string; kind: 'purchase' | 'record'; date: string; label: string; amount: number; ageDays: number; purchase?: PendingPurchase; record?: AuditExpense }
              // The dedicated pending fetch can be older than the DTR-lines feed (e.g. a DTR submitted after this page loaded),
              // so also take every unreceipted purchase the DTR-lines feed shows — "Why the difference?" and this list must agree.
              const agingIds = new Set(agingPurchases.map(p => p.id))
              const fromLines: PendingPurchase[] = dtrLines.rows
                .filter(l => l.type === 'PURCHASE' && !l.receiptReturned && !!l.reportDate && !agingIds.has(l.id) && !l.description.startsWith('ORDER|'))
                .map(l => {
                  const d = new Date(`${l.reportDate}T00:00:00`)
                  const parts = l.description.split('|')
                  return {
                    id: l.id, date: l.reportDate as string,
                    label: parts.map(x => x.trim()).filter(Boolean).join(' · ') || 'Purchase',
                    worker: l.description.includes('|') ? parts[0].trim() : '',
                    detail: l.description.includes('|') ? parts.slice(1).join(' ').trim() : l.description.trim(),
                    amount: Math.max(0, l.amount - (l.actualAmount || 0)), given: l.amount, received: l.actualAmount || 0,
                    ageDays: Math.max(0, Math.round((todayMid.getTime() - d.getTime()) / 86400000)),
                  }
                })
              const purchaseItems: Pending[] = [...agingPurchases, ...fromLines].map(p => ({ key: `p-${p.id}`, kind: 'purchase', date: p.date, label: p.received > 0 ? `${p.label} — ${fmt(p.received)} receipted of ${fmt(p.given)}, remaining` : p.label, amount: p.amount, ageDays: p.ageDays, purchase: p }))
              // Cash advances have no receipt; every other record (expenses, deposits) needs its photo / slip.
              const recordItems: Pending[] = branchExpenses
                .filter(e => !e.receiptImageUri && !isNoReceipt(e) && !/^CASH ADVANCE/i.test(e.expenseCategory || ''))
                .map(e => {
                  const t = dateToTime(e.date)
                  return {
                    key: `r-${e.id}`, kind: 'record' as const,
                    date: t ? isoOf(t) : '',
                    label: `${isDepositRecord(e) ? 'Deposit slip' : e.expenseCategory || 'Expense'}: ${e.description || e.company || 'Record'}`,
                    amount: e.amount,
                    ageDays: t ? Math.max(0, Math.round((todayMid.getTime() - t) / 86400000)) : 0,
                    record: e,
                  }
                })
              // Newest first: today's, then yesterday's, and so on — the recent ones are the ones that can still be chased.
              // The summary follows the month picker: only items dated inside the selected month. "All months" shows
              // everything, with the pre-October backlog kept apart.
              const byMonth = filterMonth !== 'All'
              const all = [...purchaseItems, ...recordItems]
                // Focused on the selected month only; a month with nothing pending shows no box at all.
                .filter(i => !byMonth || (i.date >= dtrPeriod.from && i.date <= dtrPeriod.to))
                .sort((x, y) => (y.date || '0000').localeCompare(x.date || '0000'))
              if (all.length === 0) {
                return purchasesFeed.loading ? (
                  <div className="mb-3 rounded-lg px-4 py-3 text-sm animate-pulse" style={{ border: `1px solid ${border}`, color: textMuted }}>Loading pending receipts…</div>
                ) : null
              }
              const current = byMonth ? all : all.filter(i => i.date >= PENDING_LEGACY_BEFORE)
              const legacy = byMonth ? [] : all.filter(i => i.date < PENDING_LEGACY_BEFORE)
              const total = current.reduce((acc, i) => acc + i.amount, 0)
              const open = pendingOpen
              const ageColor = (d: number) => (d >= 8 ? danger : d >= 3 ? '#D97706' : textMuted)
              const ageLabel = (d: number) => (d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`)
              const row = (i: Pending) => (
                <div key={i.key} className="flex items-center justify-between gap-3 py-2.5 text-xs" style={{ borderTop: `1px dashed ${border}` }}>
                  <span className="shrink-0 tabular-nums" style={{ color: textMuted }}>{i.date || '—'}</span>
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: textMuted, border: `1px solid ${border}` }}>
                    {i.kind === 'purchase' ? 'Purchase' : 'No photo'}
                  </span>
                  <span className="flex-1 min-w-0 truncate" style={{ color: textPrimary }} title={i.label}>{i.label}</span>
                  <span className="shrink-0 font-bold tabular-nums" style={{ color: ageColor(i.ageDays) }}>{ageLabel(i.ageDays)}</span>
                  <span className="shrink-0 font-bold tabular-nums" style={{ color: textPrimary }}>{fmt(i.amount)}</span>
                  {i.purchase && i.purchase.received > 0 && (
                    <button type="button" onClick={() => void returnPendingAsCash(i.purchase!)}
                      title="The rest was returned as cash — close this purchase and add it as a Cash Return"
                      className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer"
                      style={{ color: '#b45309', border: '1px solid #f59e0b88', backgroundColor: '#f59e0b14' }}>
                      Return {fmt(i.purchase.amount)} as cash
                    </button>
                  )}
                  {i.purchase ? (
                    <button type="button" onClick={() => setReceiptTarget(i.purchase!)}
                      className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer"
                      style={{ color: accent, border: `1px solid ${accent}55`, backgroundColor: `${accent}12` }}>
                      <Upload size={13} /> Add receipt
                    </button>
                  ) : (
                    <button type="button" onClick={() => pickPhotoFor(i.record!)} disabled={attachingPhotoId === i.record!.id}
                      className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-60"
                      style={{ color: accent, border: `1px solid ${accent}55`, backgroundColor: `${accent}12` }}>
                      {attachingPhotoId === i.record!.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Add photo
                    </button>
                  )}
                </div>
              )
              return (
                <div className="mb-3 rounded-lg overflow-hidden" style={{ border: '1px solid #f59e0b99', backgroundColor: '#f59e0b14' }}>
                  <button type="button" onClick={() => setPendingOpen(v => !v)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="font-bold uppercase tracking-wider" style={{ color: '#b45309' }}>Pending purchases receipts</span>
                      <span className="text-xs font-black px-2 py-0.5 rounded-full tabular-nums" style={{ color: '#b45309', border: '1px solid #f59e0b99', backgroundColor: '#f59e0b22' }}>{current.length}</span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="font-black tabular-nums" style={{ color: '#b45309' }}>{fmt(total)}</span>
                      <ChevronDown size={14} style={{ color: '#d97706', transform: open ? 'rotate(180deg)' : undefined }} />
                    </span>
                  </button>
                  {open && (
                    <div className="px-4 pb-3 max-h-[65vh] overflow-y-auto">
                      {current.map(row)}
                      {legacy.length > 0 && (
                        <div className="mt-2 pt-1 text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted, borderTop: `1px solid ${border}` }}>
                          Before Oct 1, 2026 · {legacy.length}
                        </div>
                      )}
                      {legacy.map(row)}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Receipts above the cash given: the member is owed the extra, as a REIMBURSE row on a DTR */}
            {(() => {
              const missing = dtrLines.rows.filter(l => l.type === 'PURCHASE' && (l.reimburseDue || 0) > 0.005 && !l.reimburseFound)
              if (missing.length === 0) return null
              const total = missing.reduce((acc, l) => acc + (l.reimburseDue || 0), 0)
              const open = openBucket === 'reimburseMissing'
              return (
                <div className="mb-3 rounded-lg overflow-hidden" style={{ border: '1px solid #f59e0b88' }}>
                  <button type="button" onClick={() => setOpenBucket(open ? null : 'reimburseMissing')} className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold" style={{ color: '#b45309' }}>Reimbursements not found on the DTR: {missing.length} ({fmt(total)})</span>
                      <span className="text-[10px]" style={{ color: textMuted }}>The receipt was higher than the cash given, so the member paid the extra. Add a REIMBURSE row for them under Expenses with Receipts on a DTR dated on or after the purchase.</span>
                    </div>
                    <ChevronDown size={13} style={{ color: textMuted, transform: open ? 'rotate(180deg)' : undefined }} className="shrink-0" />
                  </button>
                  {open && (
                    <div className="px-3 pb-2 max-h-56 overflow-y-auto">
                      {missing.map(l => (
                        <div key={l.id} className="flex items-center justify-between gap-3 py-1 text-[11px]" style={{ borderTop: `1px dashed ${border}` }}>
                          <span className="shrink-0 tabular-nums" style={{ color: textMuted }}>{l.reportDate}</span>
                          <span className="flex-1 min-w-0 truncate" style={{ color: textPrimary }} title={l.description}>{l.description.split('|').filter(Boolean).join(' · ')}</span>
                          <span className="shrink-0 tabular-nums" style={{ color: textMuted }}>receipt {fmt(l.actualAmount || 0)} vs {fmt(l.amount)} given</span>
                          <span className="shrink-0 font-bold tabular-nums" style={{ color: '#b45309' }}>reimburse {fmt(l.reimburseDue || 0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Resolved purchases whose receipt was lower than the cash given: the difference must be a DTR Cash Return */}
            {(() => {
              const missing = dtrLines.rows.filter(l => l.type === 'PURCHASE' && (l.refundDue || 0) > 0.005 && !l.cashReturnFound)
              if (missing.length === 0) return null
              const total = missing.reduce((acc, l) => acc + (l.refundDue || 0), 0)
              const open = openBucket === 'cashReturnMissing'
              return (
                <div className="mb-3 rounded-lg overflow-hidden" style={{ border: `1px solid ${danger}55` }}>
                  <button type="button" onClick={() => setOpenBucket(open ? null : 'cashReturnMissing')} className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold" style={{ color: danger }}>Cash returns not found on the DTR: {missing.length} ({fmt(total)})</span>
                      <span className="text-[10px]" style={{ color: textMuted }}>The receipt was lower than the cash given, but no matching Cash Return was entered on a DTR dated on or after the purchase. Add it under Cash Returns on the DTR.</span>
                    </div>
                    <ChevronDown size={13} style={{ color: textMuted, transform: open ? 'rotate(180deg)' : undefined }} className="shrink-0" />
                  </button>
                  {open && (
                    <div className="px-3 pb-2 max-h-56 overflow-y-auto">
                      {missing.map(l => (
                        <div key={l.id} className="flex items-center justify-between gap-3 py-1 text-[11px]" style={{ borderTop: `1px dashed ${border}` }}>
                          <span className="shrink-0 tabular-nums" style={{ color: textMuted }}>{l.reportDate}</span>
                          <span className="flex-1 min-w-0 truncate" style={{ color: textPrimary }} title={l.description}>{l.description.split('|').filter(Boolean).join(' · ')}</span>
                          <span className="shrink-0 tabular-nums" style={{ color: textMuted }}>receipt {fmt(l.actualAmount || 0)} of {fmt(l.amount)}</span>
                          <span className="shrink-0 font-bold tabular-nums" style={{ color: danger }}>return {fmt(l.refundDue || 0)}</span>
                          <button type="button"
                            onClick={() => setReceiptTarget({
                              id: l.id,
                              date: l.reportDate || '',
                              label: l.description.split('|').filter(Boolean).join(' · '),
                              worker: l.description.includes('|') ? l.description.split('|')[0].trim() : '',
                              detail: l.description.includes('|') ? l.description.split('|').slice(1).join(' ').trim() : l.description,
                              amount: l.refundDue || 0,
                              given: l.amount,
                              received: l.actualAmount || 0,
                              ageDays: 0,
                            })}
                            title="Add another receipt for the remaining amount (e.g. the toll gate receipt)"
                            className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer"
                            style={{ color: accent, border: `1px solid ${accent}55`, backgroundColor: `${accent}12` }}>
                            <Upload size={13} /> Add another receipt
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* The other side of the check: change that WAS found as a Cash Return on a DTR, so it is visible that it was validated */}
            {(() => {
              const matched = dtrLines.rows.filter(l => l.type === 'PURCHASE' && (l.refundDue || 0) > 0.005 && l.cashReturnFound)
              if (matched.length === 0) return null
              const total = matched.reduce((acc, l) => acc + (l.refundDue || 0), 0)
              const open = openBucket === 'cashReturnMatched'
              return (
                <div className="mb-3 rounded-lg overflow-hidden" style={{ border: `1px solid ${accent}44` }}>
                  <button type="button" onClick={() => setOpenBucket(open ? null : 'cashReturnMatched')} className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                    <span className="font-bold" style={{ color: accent }}>✓ Cash returns matched on a DTR: {matched.length} ({fmt(total)})</span>
                    <ChevronDown size={13} style={{ color: textMuted, transform: open ? 'rotate(180deg)' : undefined }} className="shrink-0" />
                  </button>
                  {open && (
                    <div className="px-3 pb-2 max-h-56 overflow-y-auto">
                      {matched.map(l => (
                        <div key={l.id} className="flex items-center justify-between gap-3 py-1 text-[11px]" style={{ borderTop: `1px dashed ${border}` }}>
                          <span className="shrink-0 tabular-nums" style={{ color: textMuted }}>{l.reportDate}</span>
                          <span className="flex-1 min-w-0 truncate" style={{ color: textPrimary }} title={l.description}>{l.description.split('|').filter(Boolean).join(' · ')}</span>
                          <span className="shrink-0 font-bold tabular-nums" style={{ color: textPrimary }}>{fmt(l.refundDue || 0)}</span>
                          <span className="shrink-0 tabular-nums" style={{ color: accent }}>found on the DTR of {l.cashReturnDate || 'a later date'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
            </div>

          </div>
        )
      })()}

      {/* ── RECEIPT TABLE / DAILY LOG / PURCHASES ── */}
      {activeTab === 'expenses' && branchId && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${border}` }}>
            <h2 className="text-sm font-black uppercase tracking-wider truncate min-w-0" style={{ color: textPrimary }}>
              {branchName.replace(/[^A-Za-z0-9]+/g, ' ').trim()}
            </h2>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div style={{ position: 'relative' }} className="flex-1 sm:flex-none min-w-[140px] sm:w-56 sm:focus-within:w-72 transition-all">
                <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search records"
                  className="w-full h-9 rounded-full pl-9 pr-8 text-xs font-medium outline-none focus:border-emerald-500"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: textMuted }}>
                    <X size={12} />
                  </button>
                )}
              </div>
              <button type="button" onClick={handleExportExcel}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full text-xs font-bold uppercase tracking-wide transition-opacity hover:opacity-80 shrink-0"
                style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
                title="Export the records shown to Excel">
                <Download size={13} /> Export
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm font-bold uppercase tracking-widest" style={{ color: textMuted }}>
              {search ? 'No matching records' : 'No expense records'}
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
                        <div className="flex items-center gap-2 min-w-0">
                          {row.receiptImageUri && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setPreviewImage(row.receiptImageUri || null)
                              }}
                              className="shrink-0 focus:outline-none cursor-pointer"
                              title="Click to view full screen"
                            >
                              <img
                                src={row.receiptImageUri}
                                alt="Receipt"
                                className="w-8 h-8 object-cover rounded border border-slate-300 dark:border-slate-700 shadow-xs hover:scale-105 transition-transform"
                              />
                            </button>
                          )}
                          <span className="text-sm font-bold leading-tight truncate" style={{ color: textPrimary }}>
                            {row.company || '—'}
                          </span>
                        </div>
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
{isDepositRecord(row) && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: `${accent}1A`, color: accent }}>Deposit</span>}
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
                <table className="w-full text-xs min-w-[950px]">
                  <thead>
                    <tr style={{ backgroundColor: `${accent}18` }}>
                      <th className="px-3 py-3 text-left font-bold" style={{ color: textMuted }}>Date</th>
                      <th className="px-3 py-3 text-left font-bold" style={{ color: textMuted }}>Incurred By</th>
                      <th className="px-3 py-3 text-left font-bold" style={{ color: textMuted }}>Company / Vendor</th>
                      <th className="px-3 py-3 text-left font-bold" style={{ color: textMuted }}>Description</th>
                      <th className="px-3 py-3 text-left font-bold" style={{ color: textMuted }}>Category</th>
                      <th className="px-3 py-3 text-left font-bold" style={{ color: textMuted }}>Source</th>
                      <th className="px-3 py-3 text-right font-bold" style={{ color: textMuted }}>Amount</th>
                      <th className="px-3 py-3 text-center font-bold" style={{ color: textMuted }}>Receipt</th>
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
                          <div className="font-semibold whitespace-nowrap" style={{ color: textPrimary }}>{row.date}</div>
                        </td>
                        <td className="px-3 py-2.5 font-medium" style={{ color: textPrimary }}>
                          {row.incurredBy ? <EmployeeNameLink nameOrId={row.incurredBy} /> : '—'}
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="uppercase font-semibold" style={{ color: textPrimary }}>
                              {row.expenseCategory || '—'}
                            </span>
                            {isDepositRecord(row) && (
                              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: `${accent}1A`, color: accent }}>
                                Deposit
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="uppercase font-medium text-[11px]" style={{ color: row.sourceOfFunds ? textPrimary : textMuted }}>
                            {row.sourceOfFunds || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold" style={{ color: textPrimary }}>
                          ₱{peso(row.amount)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {row.receiptImageUri ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setPreviewImage(row.receiptImageUri || null)
                              }}
                              title="Click to view attached receipt in full screen"
                              className="inline-flex items-center justify-center group focus:outline-none cursor-pointer"
                            >
                              <img
                                src={row.receiptImageUri}
                                alt="Receipt"
                                className="w-8 h-8 object-cover rounded border border-slate-300 dark:border-slate-700 group-hover:scale-110 group-hover:border-emerald-500 transition-all shadow-xs"
                              />
                            </button>
                          ) : /^CASH ADVANCE/i.test(row.expenseCategory || '') ? (
                            <span className="text-slate-300 dark:text-slate-600 text-xs" title="Cash advances have no receipt">—</span>
                          ) : isNoReceipt(row) ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); pickPhotoFor(row) }}
                              title="Saved without a receipt (reason is in the description) — click to attach a photo if one turns up"
                              className="inline-flex items-center text-[10px] font-bold uppercase px-1.5 py-1 rounded-md cursor-pointer"
                              style={{ color: '#b45309', border: '1px solid #f59e0b88', backgroundColor: '#f59e0b14' }}>
                              No receipt
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); pickPhotoFor(row) }}
                              disabled={attachingPhotoId === row.id}
                              title="No receipt photo — click to attach one"
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-1 rounded-md cursor-pointer disabled:opacity-60"
                              style={{ color: danger, border: `1px solid ${danger}55` }}
                            >
                              {attachingPhotoId === row.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Add photo
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-2 justify-end" onClick={e => e.stopPropagation()}>
                            {canModifyRecord(row) ? (
                              <>
                                <button type="button" onClick={() => startEdit(row)} className="p-1 rounded hover:bg-slate-500/10"><Pencil size={13} style={{ color: textMuted }} /></button>
                                <button type="button" onClick={() => void handleDeleteRecord(row)} className="p-1 rounded hover:bg-rose-500/10"><Trash2 size={13} style={{ color: danger }} /></button>
                              </>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }} title={dtrLinkedHint(row)}>From DTR</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${border}` }}>
                      <td colSpan={6} className="px-3 py-2.5 font-bold text-right" style={{ color: textMuted }}>TOTAL</td>
                      <td className="px-3 py-2.5 text-right font-bold" style={{ color: accent }}>₱{peso(totalFiltered)}</td>
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}



      {detailRow && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[2500] flex items-center justify-center p-3 sm:p-6 md:p-8 bg-black/80 backdrop-blur-md transition-opacity duration-200"
          onClick={() => { if (!isEditingInModal) setDetailRow(null) }}
          role="dialog"
          aria-modal="true"
          aria-label="Expense Record Details"
        >
          <div
            className="w-full max-w-2xl lg:max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border"
            style={{
              backgroundColor: cardBg,
              borderColor: isLight ? '#e2e8f0' : '#1e293b',
              boxShadow: isLight ? '0 25px 50px -12px rgba(0,0,0,0.25)' : '0 25px 60px -12px rgba(0,0,0,0.7)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Modern Minimalist Header ── */}
            <div
              className="flex items-center justify-between px-6 sm:px-8 py-5 border-b shrink-0"
              style={{ borderColor: isLight ? '#f1f5f9' : '#1e293b' }}
            >
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: textPrimary }}>
                  {isEditingInModal ? 'Edit Expense Record' : 'Expense Record'}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm mt-0.5" style={{ color: textMuted }}>
                  <span>{detailRow.branchName}</span>
                  <span>·</span>
                  <span>{detailRow.date}</span>
                  {!isEditingInModal && detailRow.expenseCategory && (
                    <>
                      <span>·</span>
                      <span className="font-medium" style={{ color: isLight ? '#475569' : '#94a3b8' }}>
                        {detailRow.expenseCategory}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!isEditingInModal || window.confirm('Discard unsaved changes?')) {
                    setIsEditingInModal(false)
                    setDetailRow(null)
                    setScanPreview(null)
                    setUploadedReceiptUrl(null)
                  }
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer hover:opacity-80 active:scale-95"
                style={{ color: textMuted, backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}
                aria-label="Close details modal"
              >
                <X size={18} />
              </button>
            </div>

            {isEditingInModal ? (
              <div className="p-6 sm:p-8 flex flex-col gap-5 overflow-y-auto">
                <div
                  className="rounded-xl p-3.5 text-xs border"
                  style={{ backgroundColor: editAlertBg, borderColor: editAlertBorder, color: editAlertText }}
                >
                  <span className="font-bold block mb-0.5" style={{ color: textPrimary }}>Editing Persisted Record</span>
                  <span style={{ color: textMuted }}>You are modifying an existing receipt. Saving changes will update the record and append to its history log.</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  {/* Date */}
                  {field(
                    'Date',
                    <div>
                      <input
                        value={dateRaw}
                        id="modal-receipt-date"
                        onChange={(e) => { setDateRaw(e.target.value); setDateError('') }}
                        onBlur={(e) => handleDateBlur(e.target.value)}
                        placeholder={latestDateStr}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                      />
                      {dateError
                        ? <p className="text-xs mt-1" style={{ color: danger }}>{dateError}</p>
                        : form.date ? <p className="text-xs mt-1" style={{ color: accent }}>✓ {form.date}</p> : null}
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
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
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
                    <AutoSuggestInput
                      value={form.incurredBy}
                      id="modal-receipt-incurredBy"
                      onChange={(v) => setForm((f) => ({ ...f, incurredBy: v }))}
                      suggestions={suggestions.people}
                      placeholder="Who incurred this?"
                      {...{ inputBg, textPrimary, textMuted, accent }}
                      inputClassName="text-sm"
                      inputStyle={{ padding: '8px 12px' }}
                      inputBorder={inputBorder}
                    />
                  )}

                  {/* Company */}
                  {field(
                    'Company / Vendor',
                    <AutoSuggestInput
                      value={form.company}
                      id="modal-receipt-company"
                      onChange={(v) => setForm((f) => ({ ...f, company: v }))}
                      suggestions={suggestions.companies}
                      placeholder="Store or vendor name"
                      {...{ inputBg, textPrimary, textMuted, accent }}
                      inputClassName="text-sm"
                      inputStyle={{ padding: '8px 12px' }}
                      inputBorder={inputBorder}
                    />
                  )}

                  {/* Receipt No */}
                  {field(
                    'Receipt No.',
                    <input
                      value={form.receiptNo}
                      id="modal-receipt-receiptNo"
                      onChange={(e) => setForm((f) => ({ ...f, receiptNo: e.target.value }))}
                      placeholder="OR / SI number"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all font-mono"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                    />
                  )}

                  {/* No receipt option */}
                  {noReceiptControl && field('Receipt', noReceiptControl)}

                  {/* Amount */}
                  {field(
                    'Amount (₱)',
                    <input
                      type="text"
                      value={form.amount}
                      id="modal-receipt-amount"
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      onBlur={(e) => {
                        const numeric = parseFloat(e.target.value.replace(/,/g, ''))
                        if (!isNaN(numeric)) {
                          setForm((f) => ({ ...f, amount: numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }))
                        }
                      }}
                      placeholder="0.00"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all font-semibold"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                    />
                  )}

                  {/* Source of Funds */}
                  {field(
                    'Source of Funds',
                    <AutoSuggestInput
                      value={form.sourceOfFunds}
                      id="modal-receipt-sourceOfFunds"
                      onChange={(v) => setForm((f) => ({ ...f, sourceOfFunds: v }))}
                      suggestions={suggestions.sources}
                      placeholder="Petty cash, reimbursement…"
                      {...{ inputBg, textPrimary, textMuted, accent }}
                      inputClassName="text-sm"
                      inputStyle={{ padding: '8px 12px' }}
                      inputBorder={inputBorder}
                    />
                  )}

                  {/* Description */}
                  <div className="sm:col-span-2">
                    {field(
                      'Description',
                      <AutoSuggestInput
                        value={form.description}
                        id="modal-receipt-description"
                        onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                        suggestions={suggestions.descs}
                        placeholder="What was purchased?"
                        {...{ inputBg, textPrimary, textMuted, accent }}
                        inputClassName="text-sm"
                        inputStyle={{ padding: '8px 12px' }}
                        inputBorder={inputBorder}
                      />
                    )}
                  </div>
                </div>

                {/* ── Receipt Attachment in Edit Modal ── */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: textMuted }}>
                      Receipt Attachment
                    </label>
                    {uploadingReceipt && (
                      <span className="flex items-center gap-1.5 text-xs text-amber-500 font-medium">
                        <Loader2 size={13} className="animate-spin" /> Uploading image to storage…
                      </span>
                    )}
                    {!uploadingReceipt && (uploadedReceiptUrl || scanPreview) && (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                        ✓ Image attached
                      </span>
                    )}
                  </div>

                  <input
                    ref={modalFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleModalImageUpload(file)
                      e.target.value = ''
                    }}
                  />
                  <input
                    ref={modalCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleModalImageUpload(file)
                      e.target.value = ''
                    }}
                  />

                  {uploadedReceiptUrl || scanPreview ? (
                    <div
                      className="rounded-xl border p-3.5 flex flex-col sm:flex-row items-start sm:items-center gap-4 transition-all"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div
                        onClick={() => setPreviewImage(uploadedReceiptUrl || scanPreview)}
                        className="relative group cursor-pointer w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden border shrink-0 flex items-center justify-center bg-black/5 dark:bg-black/30"
                        style={{ borderColor: inputBorder }}
                        title="Click to view full size"
                      >
                        <img
                          src={uploadedReceiptUrl || scanPreview || ''}
                          alt="Attached Receipt"
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 text-[10px] font-semibold px-2 py-1 rounded bg-black/75 text-white">
                            Enlarge
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col justify-between gap-2 w-full">
                        <div>
                          <p className="text-xs font-semibold" style={{ color: textPrimary }}>
                            Receipt Document Attached
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: textMuted }}>
                            {uploadingReceipt ? 'Compressing and uploading image…' : 'This image will be saved with this expense record.'}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setPreviewImage(uploadedReceiptUrl || scanPreview)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 flex items-center gap-1 cursor-pointer"
                            style={{ backgroundColor: isLight ? '#ffffff' : '#1e293b', borderColor: inputBorder, color: textPrimary }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            disabled={uploadingReceipt}
                            onClick={() => modalFileInputRef.current?.click()}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 flex items-center gap-1 cursor-pointer"
                            style={{ backgroundColor: isLight ? '#ffffff' : '#1e293b', borderColor: inputBorder, color: textPrimary }}
                          >
                            <Upload size={13} />
                            Replace
                          </button>
                          <button
                            type="button"
                            disabled={uploadingReceipt}
                            onClick={() => modalCameraInputRef.current?.click()}
                            className="sm:hidden px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 flex items-center gap-1 cursor-pointer"
                            style={{ backgroundColor: isLight ? '#ffffff' : '#1e293b', borderColor: inputBorder, color: textPrimary }}
                          >
                            <Camera size={13} />
                            Camera
                          </button>
                          <button
                            type="button"
                            disabled={uploadingReceipt}
                            onClick={() => {
                              setUploadedReceiptUrl(null)
                              setScanPreview(null)
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-1 cursor-pointer ml-auto"
                          >
                            <Trash2 size={13} />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                      onDrop={handleModalDrop}
                      className="border-2 border-dashed rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all"
                      style={{ borderColor: isLight ? '#cbd5e1' : '#334155', backgroundColor: isLight ? '#f8fafc' : '#0b1324' }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: isLight ? '#e2e8f0' : '#1e293b', color: textMuted }}
                        >
                          <Upload size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: textPrimary }}>
                            No receipt image attached
                          </p>
                          <p className="text-[11px]" style={{ color: textMuted }}>
                            Upload image, take a photo, or paste from clipboard
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={handleModalPaste}
                          className="flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-medium border transition-all hover:opacity-80 flex items-center justify-center gap-1 cursor-pointer"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                          title="Paste from clipboard"
                        >
                          <ClipboardPaste size={14} />
                          <span>Paste</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => modalCameraInputRef.current?.click()}
                          className="sm:hidden flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all flex items-center justify-center gap-1 cursor-pointer"
                          style={{ backgroundColor: '#6366F1' }}
                        >
                          <Camera size={14} />
                          <span>Camera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => modalFileInputRef.current?.click()}
                          className="flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all flex items-center justify-center gap-1 cursor-pointer"
                          style={{ backgroundColor: editAccent }}
                        >
                          <Upload size={14} />
                          <span>Upload Receipt</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Category Selection */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide block mb-2" style={{ color: textMuted }}>Expense Category</label>
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: textMuted }} />
                    <input
                      value={categoryQuery}
                      onChange={(e) => setCategoryQuery(e.target.value)}
                      placeholder="Search category…"
                      className="w-full pl-8 pr-3 py-2 rounded-lg text-xs font-semibold outline-none"
                      style={{ border: `1px solid ${inputBorder}`, backgroundColor: inputBg, color: textPrimary }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                    {visibleCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, expenseCategory: cat as AuditExpenseCategory }))}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          border: `1px solid ${form.expenseCategory === cat ? editAccent : inputBorder}`,
                          backgroundColor: form.expenseCategory === cat ? `${editAccent}22` : inputBg,
                          color: form.expenseCategory === cat ? editAccent : textMuted
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 sm:p-8 flex flex-col gap-6 overflow-y-auto">
                {/* ── Polished Hero Amount Strip ── */}
                <div
                  className="rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4 border"
                  style={{
                    backgroundColor: isLight ? '#f8fafc' : '#0b1324',
                    borderColor: isLight ? '#e2e8f0' : '#1e293b'
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                      Total Amount
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl sm:text-4xl font-extrabold tracking-tight" style={{ color: textPrimary }}>
                        ₱{peso(detailRow.amount)}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: textMuted }}>
                        PHP
                      </span>
                    </div>
                  </div>

                  {detailRow.expenseCategory && (
                    <div className="shrink-0">
                      <span
                        className="text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-xl border inline-block"
                        style={{
                          backgroundColor: isLight ? '#ffffff' : '#060d1a',
                          borderColor: isLight ? '#e2e8f0' : '#1e293b',
                          color: textPrimary
                        }}
                      >
                        {detailRow.expenseCategory}
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Main Details Grid ── */}
                <div className={`grid grid-cols-1 ${detailRow.receiptImageUri ? 'lg:grid-cols-12' : 'grid-cols-1'} gap-6`}>
                  {/* Left Column: Metadata & Notes */}
                  <div className={`${detailRow.receiptImageUri ? 'lg:col-span-7' : 'w-full'} flex flex-col gap-5`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: textMuted }}>
                          Company / Vendor
                        </span>
                        <span className="text-sm font-semibold break-words" style={{ color: textPrimary }}>
                          {detailRow.company ? detailRow.company.toUpperCase() : '—'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: textMuted }}>
                          Receipt No.
                        </span>
                        <span className="text-sm font-mono font-semibold" style={{ color: textPrimary }}>
                          {detailRow.receiptNo ? detailRow.receiptNo.toUpperCase() : '—'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: textMuted }}>
                          Incurred By
                        </span>
                        <span className="text-sm font-semibold" style={{ color: textPrimary }}>
                          {detailRow.incurredBy ? (
                            <EmployeeNameLink
                              nameOrId={formatDetailsName(detailRow.incurredBy)}
                              displayText={formatDetailsName(detailRow.incurredBy)}
                            />
                          ) : '—'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: textMuted }}>
                          Submitted By
                        </span>
                        <span className="text-sm font-semibold" style={{ color: textPrimary }}>
                          <EmployeeNameLink
                            nameOrId={formatDetailsName(detailRow.inputBy)}
                            displayText={formatDetailsName(detailRow.inputBy)}
                          />
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: textMuted }}>
                          Source of Funds
                        </span>
                        <span className="text-sm font-semibold" style={{ color: textPrimary }}>
                          {detailRow.sourceOfFunds ? detailRow.sourceOfFunds.toUpperCase() : '—'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: textMuted }}>
                          Category
                        </span>
                        <span className="text-sm font-semibold" style={{ color: textPrimary }}>
                          {detailRow.expenseCategory || '—'}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="pt-4 border-t" style={{ borderColor: isLight ? '#f1f5f9' : '#1e293b' }}>
                      <span className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: textMuted }}>
                        Description
                      </span>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium" style={{ color: textPrimary }}>
                        {detailRow.description || '—'}
                      </p>
                    </div>

                    {/* Timeline Activity */}
                    <div className="pt-4 border-t" style={{ borderColor: isLight ? '#f1f5f9' : '#1e293b' }}>
                      <span className="text-[11px] font-bold uppercase tracking-wider block mb-2.5" style={{ color: textMuted }}>
                        Activity Log
                      </span>
                      <div className="space-y-2">
                        {expenseRecordHistory(detailRow).map((entry, idx) => (
                          <div
                            key={`${entry.action}-${entry.at}-${idx}`}
                            className="flex items-center justify-between text-xs py-1"
                            style={{ color: textMuted }}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold uppercase text-[11px]" style={{ color: textPrimary }}>
                                {entry.action === 'created' ? 'Created' : 'Updated'}
                              </span>
                              <span>by</span>
                              <span className="font-semibold" style={{ color: textPrimary }}>
                                <EmployeeNameLink
                                  nameOrId={formatDetailsName(entry.by)}
                                  displayText={formatDetailsName(entry.by)}
                                />
                              </span>
                            </div>
                            <span className="text-[11px] font-medium">
                              {historyDateTime(entry.at)}
                            </span>
                          </div>
                        ))}
                        {expenseRecordHistory(detailRow).length === 0 && (
                          <span className="text-xs" style={{ color: textMuted }}>No activity records found.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Receipt Image */}
                  {detailRow.receiptImageUri && (
                    <div className="lg:col-span-5 flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-wider block mb-2" style={{ color: textMuted }}>
                        Receipt Document
                      </span>
                      <div
                        onClick={() => setPreviewImage(detailRow.receiptImageUri || null)}
                        className="group relative cursor-pointer rounded-2xl overflow-hidden border flex items-center justify-center p-3 transition-all duration-200 hover:border-slate-400/50"
                        style={{
                          backgroundColor: isLight ? '#ffffff' : '#08111f',
                          borderColor: isLight ? '#e2e8f0' : '#1e293b',
                          minHeight: 280
                        }}
                        title="Click to view full screen"
                      >
                        <img
                          src={detailRow.receiptImageUri}
                          alt="Receipt Document"
                          className="max-h-[350px] w-auto max-w-full object-contain rounded-lg transition-transform duration-200 group-hover:scale-[1.01]"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold px-3.5 py-1.5 rounded-full bg-black/80 text-white backdrop-blur-sm shadow-md">
                            Click to enlarge
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Modern Minimalist Footer ── */}
            <div
              className="flex items-center justify-between px-6 sm:px-8 py-4 border-t shrink-0"
              style={{ borderColor: isLight ? '#f1f5f9' : '#1e293b' }}
            >
              {isEditingInModal ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Discard unsaved changes?')) {
                        setIsEditingInModal(false)
                        setEditing(null)
                        setScanPreview(null)
                        setUploadedReceiptUrl(null)
                      }
                    }}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80 active:scale-95 cursor-pointer"
                    style={{ color: textMuted, backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitReceipt}
                    disabled={savingReceipt}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-95 cursor-pointer"
                    style={{ backgroundColor: editAccent }}
                  >
                    {savingReceipt ? <Loader2 size={14} className="animate-spin" /> : null}
                    Apply Changes
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setDetailRow(null)}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-85 active:scale-95 cursor-pointer border"
                    style={{
                      color: textPrimary,
                      backgroundColor: isLight ? '#ffffff' : '#0d1527',
                      borderColor: isLight ? '#e2e8f0' : '#1e293b'
                    }}
                  >
                    Close
                  </button>
                  <div className="flex items-center gap-3">
                    {!canModifyRecord(detailRow) && (
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: textMuted }} title={dtrLinkedHint(detailRow)}>From DTR</span>
                    )}
                    {canModifyRecord(detailRow) && <>
                    <button
                      type="button"
                      onClick={() => startEditInModal(detailRow)}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 cursor-pointer shadow-sm"
                      style={{ backgroundColor: '#1e293b' }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteRecord(detailRow)}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 cursor-pointer shadow-sm"
                      style={{ backgroundColor: danger }}
                    >
                      Delete
                    </button>
                    </>}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
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
              {!actionMenuRow.receiptImageUri && !/^CASH ADVANCE/i.test(actionMenuRow.expenseCategory || '') && (
                <button type="button" onClick={() => { pickPhotoFor(actionMenuRow); setActionMenuRow(null) }} className="w-full px-5 py-4 text-center text-sm font-bold border-b transition-colors active:bg-black/5" style={{ color: danger, borderColor: border }}>Add Receipt Photo</button>
              )}
              {canModifyRecord(actionMenuRow) ? (
                <>
                  <button type="button" onClick={() => { startEdit(actionMenuRow); setActionMenuRow(null) }} className="w-full px-5 py-4 text-center text-sm font-bold border-b transition-colors active:bg-black/5" style={{ color: textPrimary, borderColor: border }}>Edit Record</button>
                  <button type="button" onClick={() => { void handleDeleteRecord(actionMenuRow); setActionMenuRow(null) }} className="w-full px-5 py-4 text-center text-sm font-bold transition-colors active:bg-black/5" style={{ color: danger }}>Delete Record</button>
                </>
              ) : (
                <div className="w-full px-5 py-4 text-center text-xs font-bold" style={{ color: textMuted }}>From DTR — {dtrLinkedHint(actionMenuRow)}</div>
              )}
            </div>
            <button type="button" onClick={() => setActionMenuRow(null)} className="w-full px-5 py-4 text-center text-sm font-bold rounded-2xl shadow-2xl transition-colors active:bg-black/5 mt-1" style={{ backgroundColor: cardBg, color: textMuted }}>Cancel</button>
          </div>
        </>, document.body
      )}

      {/* ── Fullscreen Receipt Image Popup Modal ── */}
      {previewImage && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md transition-opacity duration-200"
          onClick={() => setPreviewImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Receipt Image Fullscreen Preview"
        >
          {/* Top Bar with Close (X) Button */}
          <div className="absolute top-4 right-4 z-[3010]">
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-white/15 hover:bg-white/25 active:scale-95 transition-all border border-white/20 cursor-pointer shadow-xl focus:outline-none"
              title="Close preview (Esc)"
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </div>

          {/* Fullscreen Image Preview */}
          <div
            className="relative max-w-full max-h-[92vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage}
              alt="Receipt Preview"
              className="max-w-full max-h-[92vh] w-auto h-auto object-contain rounded-xl shadow-2xl border border-white/10 select-none"
            />
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}
