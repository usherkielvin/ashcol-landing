import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { 
  Receipt, 
  Layers, 
  Search, 
  X, 
  Loader2, 
  ClipboardCheck, 
  Clock, 
  Building2, 
  User, 
  TrendingUp, 
  AlertTriangle,
  Upload
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import { loadAuditExpenseCategories, type AuditExpenseCategoryDetail } from '../utils/auditExpenseCategoryStorage'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'
import { parseSmartDate } from '../utils/smartDate'
import { formatTodayReceiptDate } from '../utils/auditExpenseDates'

interface BranchOption { id: string; name: string }
interface PurchaseItem {
  id: string
  description: string
  amount: number
  receiptReturned: boolean
  actualAmount: number
  receiptNo: string
  receiptDate: string
  resolvedExpenseId: string
  reportId: string
  reportDate: string
  auditLine: string
  branchId: string
  branchName: string
}

const peso = (v: number) => v.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

export default function PurchaseMonitor() {
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

  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const isBranchScopedUser = !isAdmin && !!user?.branchId
  const canAccess = isAdmin

  const [branches, setBranches] = useState<BranchOption[]>([])
  const [branchId, setBranchId] = useState('')
  const [purchases, setPurchases] = useState<PurchaseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved'>('pending')
  const [search, setSearch] = useState('')

  // Categories
  const [categories, setCategories] = useState<AuditExpenseCategoryDetail[]>([])
  
  // Resolve Modal State
  const [showModal, setShowModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PurchaseItem | null>(null)
  const [resolving, setResolving] = useState(false)
  
  // Resolve Form State
  const [actualAmount, setActualAmount] = useState('')
  const [receiptNo, setReceiptNo] = useState('')
  const [receiptDate, setReceiptDate] = useState(formatTodayReceiptDate())
  const [dateRaw, setDateRaw] = useState(formatTodayReceiptDate())
  const [dateError, setDateError] = useState('')
  const [company, setCompany] = useState('')
  const [description, setDescription] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('OTHER')
  const [sourceOfFunds, setSourceOfFunds] = useState('PETTY CASH')
  const [incurredBy, setIncurredBy] = useState('')

  // AI OCR Scan State
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scanError, setScanError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const token = useMemo(() => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || '', [])

  const reloadCategories = useCallback(async () => {
    try {
      const data = await loadAuditExpenseCategories()
      setCategories(data)
    } catch (err) {
      console.error(err)
    }
  }, [])

  const allCategories = useMemo(() => {
    if (categories.length > 0) {
      return categories.map(c => c.name)
    }
    return AUDIT_EXPENSE_CATEGORIES
  }, [categories])

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list: BranchOption[] = (data?.data || data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))
      
      const newList: BranchOption[] = []
      for (const b of list) {
        const cleanName = b.name.replace(/^(ashcol\s+)/i, '')
        if (b.name.toUpperCase() === 'ASHCOL TAGUIG' || b.name.toUpperCase() === 'TAGUIG') {
          newList.push({ id: `${b.id}-sales`, name: 'TAGUIG SALES' })
          newList.push({ id: `${b.id}-services`, name: 'Taguig - Services' })
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
    } catch (e) { console.error(e) }
  }, [isBranchScopedUser, user?.branchId, token])

  const loadPurchases = useCallback(async () => {
    setLoading(true)
    try {
      let url = `${API_BASE_URL}/v1/reports/purchases?pendingOnly=${statusFilter === 'pending'}`
      if (branchId) {
        const cleanBranchId = branchId.replace(/-(sales|services)$/, '')
        url += `&branchId=${cleanBranchId}`
      }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setPurchases(data)
      }
    } catch (err) {
      console.error('Error fetching purchases:', err)
    } finally {
      setLoading(false)
    }
  }, [branchId, statusFilter, token])

  useEffect(() => {
    if (canAccess) {
      void loadBranches()
      void reloadCategories()
    }
  }, [canAccess, loadBranches, reloadCategories])

  useEffect(() => {
    if (canAccess) {
      void loadPurchases()
    }
  }, [canAccess, loadPurchases])

  const handleDateBlur = (raw: string) => {
    const parsed = parseSmartDate(raw)
    if (parsed) {
      setDateRaw(parsed)
      setReceiptDate(parsed)
      setDateError('')
    } else if (raw.trim()) {
      setDateError('Cannot parse date. Try: May 16, 16-May-26, 2026-05-16')
    }
  }

  const filteredPurchases = useMemo(() => {
    let list = [...purchases]

    // Status filter
    if (statusFilter === 'pending') {
      list = list.filter(p => !p.receiptReturned)
    } else if (statusFilter === 'resolved') {
      list = list.filter(p => p.receiptReturned)
    }

    // Branch filter
    if (branchId) {
      const cleanBranchId = branchId.replace(/-(sales|services)$/, '')
      // Match exact branchId OR literal stored suffix (e.g. BR-TAGUIG-SALES stored in DB)
      list = list.filter(p =>
        p.branchId === cleanBranchId ||
        p.branchId === branchId ||
        p.branchId.startsWith(cleanBranchId + '-')
      )
      
      // Taguig department separation
      if (branchId.endsWith('-sales')) {
        list = list.filter(p => p.auditLine === 'TAGUIG_SALES' || !p.auditLine || p.branchId.toUpperCase().includes('SALES'))
      } else if (branchId.endsWith('-services')) {
        list = list.filter(p => p.auditLine === 'TAGUIG_SERVICE' || p.branchId.toUpperCase().includes('SERVICE'))
      }
    }

    // Search filter
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(p => 
        p.description.toLowerCase().includes(q) ||
        p.branchName.toLowerCase().includes(q) ||
        p.receiptNo.toLowerCase().includes(q) ||
        p.reportDate.includes(q)
      )
    }

    return list
  }, [purchases, statusFilter, branchId, search])

  // Summary Metrics
  const stats = useMemo(() => {
    const all = purchases
    const pending = all.filter(p => !p.receiptReturned)
    const resolved = all.filter(p => p.receiptReturned)
    
    return {
      pendingCount: pending.length,
      pendingTotal: pending.reduce((sum, p) => sum + p.amount, 0),
      resolvedCount: resolved.length,
      resolvedTotal: resolved.reduce((sum, p) => sum + p.actualAmount, 0),
      totalDisbursed: all.reduce((sum, p) => sum + p.amount, 0)
    }
  }, [purchases])

  const openResolveModal = (item: PurchaseItem) => {
    setSelectedItem(item)
    setActualAmount(String(item.amount))
    setReceiptNo('')
    setDateRaw(formatTodayReceiptDate())
    setReceiptDate(formatTodayReceiptDate())
    setCompany('')
    
    // Parse description if it's in installer|materials format
    let descPart = item.description
    let incPart = ''
    if (item.description.includes('|')) {
      const idx = item.description.indexOf('|')
      incPart = item.description.substring(0, idx).trim()
      descPart = item.description.substring(idx + 1).trim()
    }
    
    setDescription(descPart)
    setIncurredBy(incPart.toUpperCase() || 'INSTALLER')
    setExpenseCategory(item.description.toUpperCase().includes('GAS') || item.description.toUpperCase().includes('FUEL') ? 'MOBILIZATION' : 'SERVICE MATERIALS')
    setSourceOfFunds('PETTY CASH')
    setScanPreview(null)
    setScanError('')
    setDateError('')
    setShowModal(true)
  }

  // OCR scanning logic
  const handleScanImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const url = URL.createObjectURL(file)
    setScanPreview(url)
    setScanning(true)
    setScanError('')
    
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`${API_BASE_URL}/v1/receipts/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      
      if (!res.ok) throw new Error(`Scan server error ${res.status}`)
      
      const data = await res.json()
      if (data.error) {
        setScanError(`Scan failed: ${data.error}`)
        return
      }

      if (data.date) {
        const parsed = parseSmartDate(String(data.date))
        if (parsed) {
          setDateRaw(parsed)
          setReceiptDate(parsed)
        }
      }
      if (data.company) setCompany(String(data.company).toUpperCase())
      if (data.receiptNo) setReceiptNo(String(data.receiptNo))
      if (data.amount != null) {
        const amtVal = parseFloat(String(data.amount).replace(/,/g, ''))
        if (!isNaN(amtVal)) {
          setActualAmount(String(amtVal))
        }
      }
      if (data.description) setDescription(String(data.description))
      if (data.expenseCategory) setExpenseCategory(String(data.expenseCategory).toUpperCase())
      if (data.sourceOfFunds) setSourceOfFunds(String(data.sourceOfFunds))
      if (data.incurredBy) setIncurredBy(String(data.incurredBy).toUpperCase())
    } catch (err: any) {
      setScanError(err.message || 'Could not scan receipt. Please input manually.')
    } finally {
      setScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Handle Clipboard Paste scanner
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!showModal || scanning) return
      const items = e.clipboardData?.items
      if (!items) return
      
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) {
            const file = new File([blob], 'pasted-receipt.png', { type: item.type })
            const url = URL.createObjectURL(file)
            setScanPreview(url)
            setScanning(true)
            setScanError('')
            
            try {
              const formData = new FormData()
              formData.append('image', file)
              const res = await fetch(`${API_BASE_URL}/v1/receipts/scan`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
              })
              if (!res.ok) throw new Error(`Scan server error ${res.status}`)
              const data = await res.json()
              
              if (data.date) {
                const parsed = parseSmartDate(String(data.date))
                if (parsed) { setDateRaw(parsed); setReceiptDate(parsed) }
              }
              if (data.company) setCompany(String(data.company).toUpperCase())
              if (data.receiptNo) setReceiptNo(String(data.receiptNo))
              if (data.amount != null) {
                const amtVal = parseFloat(String(data.amount).replace(/,/g, ''))
                if (!isNaN(amtVal)) setActualAmount(String(amtVal))
              }
              if (data.description) setDescription(String(data.description))
              if (data.expenseCategory) setExpenseCategory(String(data.expenseCategory).toUpperCase())
              if (data.sourceOfFunds) setSourceOfFunds(String(data.sourceOfFunds))
              if (data.incurredBy) setIncurredBy(String(data.incurredBy).toUpperCase())
            } catch (err: any) {
              setScanError(err.message || 'Could not scan receipt.')
            } finally {
              setScanning(false)
            }
            return
          }
        }
      }
    }
    
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [showModal, scanning, token])

  const submitResolution = async () => {
    if (!selectedItem) return
    const amt = parseFloat(actualAmount)
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid actual amount.')
      return
    }
    if (!receiptNo.trim()) {
      alert('Please enter a receipt number.')
      return
    }
    if (!receiptDate.trim() || dateError) {
      alert('Please enter a valid receipt date.')
      return
    }

    setResolving(true)
    try {
      const payload = {
        receiptNo: receiptNo.trim(),
        actualAmount: amt,
        receiptDate: receiptDate.trim(),
        company: company.trim(),
        description: description.trim(),
        expenseCategory,
        sourceOfFunds,
        incurredBy: incurredBy.trim()
      }

      const res = await fetch(`${API_BASE_URL}/v1/reports/purchases/${selectedItem.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        alert('Purchase request successfully resolved and recorded to Expenses!')
        setShowModal(false)
        setSelectedItem(null)
        await loadPurchases()
      } else {
        const errorData = await res.json()
        alert(errorData.error || 'Failed to resolve purchase item.')
      }
    } catch (err) {
      console.error(err)
      alert('An error occurred during submission.')
    } finally {
      setResolving(false)
    }
  }

  // Calculate refund/change from original and actual spent
  const computedChange = useMemo(() => {
    if (!selectedItem) return 0
    const amt = parseFloat(actualAmount)
    if (isNaN(amt)) return 0
    return selectedItem.amount - amt
  }, [selectedItem, actualAmount])

  if (!canAccess) {
    return <div className="p-8 text-center" style={{ color: textMuted }}>Access denied. You do not have permissions to view this page.</div>
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg }} className="flex flex-col gap-4 p-4 md:p-6 pb-12 transition-colors duration-200">
      
      {/* ── HEADER ── */}
      <div className="rounded-2xl p-5 md:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="rounded-xl p-2" style={{ backgroundColor: `${accent}22` }}>
              <Layers size={20} style={{ color: accent }} />
            </div>
            <h1 className="text-xl md:text-2xl font-bold" style={{ color: textPrimary }}>Purchase Monitor</h1>
          </div>
          <p className="text-sm animate-fade-in" style={{ color: textMuted }}>
            Track and audit DTR "For Purchase" fund releases. Mark receipts to instantly create expense entries.
          </p>
        </div>
      </div>

      {/* ── METRIC STATS CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: Pending */}
        <div className="rounded-2xl p-5 flex items-center justify-between transition-all duration-200 hover:scale-[1.01]" 
          style={{ backgroundColor: cardBg, border: `1px solid ${border}`, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wider text-amber-500 uppercase flex items-center gap-1">
              <Clock size={12} /> Pending Receipts
            </span>
            <span className="text-2xl font-bold" style={{ color: textPrimary }}>
              {peso(stats.pendingTotal)}
            </span>
            <span className="text-xs" style={{ color: textMuted }}>
              {stats.pendingCount} items waiting for receipt
            </span>
          </div>
          <div className="rounded-xl p-3 bg-amber-500/10 text-amber-500">
            <Receipt size={24} />
          </div>
        </div>

        {/* Metric 2: Resolved */}
        <div className="rounded-2xl p-5 flex items-center justify-between transition-all duration-200 hover:scale-[1.01]" 
          style={{ backgroundColor: cardBg, border: `1px solid ${border}`, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wider text-emerald-500 uppercase flex items-center gap-1">
              <ClipboardCheck size={12} /> Confirmed Expenses
            </span>
            <span className="text-2xl font-bold" style={{ color: textPrimary }}>
              {peso(stats.resolvedTotal)}
            </span>
            <span className="text-xs" style={{ color: textMuted }}>
              {stats.resolvedCount} requests successfully cleared
            </span>
          </div>
          <div className="rounded-xl p-3 bg-emerald-500/10 text-emerald-500">
            <TrendingUp size={24} />
          </div>
        </div>

        {/* Metric 3: Total Disbursed */}
        <div className="rounded-2xl p-5 flex items-center justify-between transition-all duration-200 hover:scale-[1.01]" 
          style={{ backgroundColor: cardBg, border: `1px solid ${border}`, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: textMuted }}>
              Total Funds Released
            </span>
            <span className="text-2xl font-bold" style={{ color: textPrimary }}>
              {peso(stats.totalDisbursed)}
            </span>
            <span className="text-xs" style={{ color: textMuted }}>
              Gross cash allocated for installer purchases
            </span>
          </div>
          <div className="rounded-xl p-3 bg-blue-500/10 text-blue-500">
            <Building2 size={24} />
          </div>
        </div>
      </div>

      {/* ── FILTER TOOLBAR ── */}
      <div className="rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Tabs */}
          {(['pending', 'resolved', 'all'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-150"
              style={{
                backgroundColor: statusFilter === status ? accent : 'transparent',
                color: statusFilter === status ? '#ffffff' : textMuted,
                border: `1px solid ${statusFilter === status ? accent : border}`
              }}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          {/* Branch filter */}
          {branches.length > 1 && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm font-medium w-full md:w-48 outline-none border transition-all duration-150"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            >
              <option value="">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}

          {/* Search field */}
          <div className="relative w-full md:w-64 flex items-center">
            <Search size={16} className="absolute left-3" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 py-2 rounded-xl text-sm w-full outline-none border transition-all duration-150"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 text-gray-400 hover:text-gray-200">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── PURCHASES LIST GRID ── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-emerald-500" size={32} />
            <span className="text-sm font-medium" style={{ color: textMuted }}>Loading purchases...</span>
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
            <AlertTriangle className="text-amber-500" size={40} />
            <h3 className="text-lg font-bold" style={{ color: textPrimary }}>No purchases found</h3>
            <p className="text-sm max-w-md" style={{ color: textMuted }}>
              There are no purchases matching your current filter choices. Pending purchases appear when workers request funds in the transaction reports.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-xs font-semibold tracking-wider uppercase" style={{ borderColor: border, color: textMuted, backgroundColor: isLight ? '#f8fafc' : '#0D1527' }}>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Branch / DTR Date</th>
                  <th className="px-5 py-4">Installer & Request Details</th>
                  <th className="px-5 py-4 text-right">Released Amount</th>
                  <th className="px-5 py-4 text-right">Actual Spent</th>
                  <th className="px-5 py-4 text-right">Refund / Change</th>
                  <th className="px-5 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y text-sm font-medium" style={{ color: textPrimary }}>
                {filteredPurchases.map((p) => {
                  let worker = 'STAFF'
                  let desc = p.description
                  if (p.description.includes('|')) {
                    const parts = p.description.split('|')
                    worker = parts[0]
                    desc = parts[1]
                  }

                  const refundAmount = p.amount - p.actualAmount
                  const isResolved = p.receiptReturned

                  return (
                    <tr key={p.id} className="hover:bg-emerald-500/5 transition-colors duration-150">
                      <td className="px-5 py-4">
                        {isResolved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Pending Receipt
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-bold">{p.branchName.replace(/^(ashcol\s+)/i, '').toUpperCase()}</div>
                        <div className="text-xs mt-0.5" style={{ color: textMuted }}>
                          {p.reportDate} {p.auditLine ? `(${p.auditLine.replace('TAGUIG_', '')})` : ''}
                        </div>
                      </td>
                      <td className="px-5 py-4 max-w-xs">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-blue-500">
                          <User size={12} /> {worker}
                        </div>
                        <div className="text-sm mt-0.5 font-normal truncate" title={desc}>{desc}</div>
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-amber-500">
                        {peso(p.amount)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {isResolved ? (
                          <span className="font-bold text-emerald-500">{peso(p.actualAmount)}</span>
                        ) : (
                          <span className="text-gray-400 font-normal">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-bold">
                        {isResolved ? (
                          <span className={refundAmount > 0 ? 'text-emerald-500' : refundAmount < 0 ? 'text-rose-500' : 'text-gray-400'}>
                            {peso(refundAmount)}
                          </span>
                        ) : (
                          <span className="text-gray-400 font-normal">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        {isResolved ? (
                          <div className="flex flex-col items-center text-xs" style={{ color: textMuted }}>
                            <span className="font-bold">Receipt: {p.receiptNo}</span>
                            <span>{p.receiptDate}</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openResolveModal(p)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide uppercase transition-all duration-150 hover:shadow-lg"
                            style={{ backgroundColor: accent, color: '#ffffff' }}
                          >
                            Resolve Receipt
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── RESOLVE PURCHASE MODAL ── */}
      {showModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] transition-all duration-300 transform scale-100"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            
            {/* Modal Header */}
            <div className="p-5 md:p-6 border-b flex justify-between items-center" style={{ borderColor: border }}>
              <div className="flex items-center gap-2">
                <Receipt className="text-emerald-500" size={22} />
                <div>
                  <h2 className="text-lg font-bold" style={{ color: textPrimary }}>Resolve DTR Purchase</h2>
                  <p className="text-xs" style={{ color: textMuted }}>Original Request: {selectedItem.branchName} • {selectedItem.reportDate}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-full p-1.5 transition-colors hover:bg-gray-500/10" style={{ color: textMuted }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto flex flex-col gap-5">
              
              {/* Receipt OCR Scanning Zone */}
              <div className="border border-dashed rounded-2xl p-4 flex flex-col items-center justify-center gap-3 relative transition-all duration-200 hover:bg-emerald-500/5 group"
                style={{ borderColor: scanPreview ? accent : inputBorder, backgroundColor: inputBg }}>
                
                {scanPreview ? (
                  <div className="w-full flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <img src={scanPreview} alt="Receipt preview" className="w-12 h-12 object-cover rounded-lg border" style={{ borderColor: border }} />
                      <div className="text-left">
                        <span className="text-xs font-bold block" style={{ color: textPrimary }}>Receipt Image Selected</span>
                        <span className="text-[10px]" style={{ color: textMuted }}>Press Ctrl+V to paste a different image</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => { setScanPreview(null); setScanError('') }}
                      className="px-2.5 py-1 text-xs font-bold rounded-lg border text-rose-500 hover:bg-rose-500/10 transition-colors"
                      style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload size={32} className="text-emerald-500 group-hover:scale-110 transition-transform duration-200" />
                    <div className="text-center">
                      <p className="text-xs font-bold" style={{ color: textPrimary }}>
                        Drag & Drop or Paste Image to Scan Receipt
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>
                        Auto-fills Receipt #, date, vendor, description, and spent amount using AI OCR
                      </p>
                    </div>
                    <input 
                      type="file" 
                      accept="image/*"
                      ref={fileInputRef} 
                      onChange={handleScanImage} 
                      className="hidden" 
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150"
                      style={{ borderColor: inputBorder, color: textPrimary, backgroundColor: cardBg }}
                    >
                      Browse Receipt Image
                    </button>
                  </>
                )}

                {scanning && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 rounded-2xl animate-fade-in">
                    <Loader2 className="animate-spin text-emerald-500" size={24} />
                    <span className="text-xs font-bold text-white">AI analyzing receipt data...</span>
                  </div>
                )}
              </div>

              {scanError && (
                <div className="p-3 rounded-xl text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{scanError}</span>
                </div>
              )}

              {/* Original Disbursed Box */}
              <div className="rounded-2xl p-4 flex justify-between items-center" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', border: `1px solid ${border}` }}>
                <div>
                  <span className="text-xs font-bold block" style={{ color: textMuted }}>Original Purchase Request Amount</span>
                  <span className="text-sm font-semibold uppercase text-blue-500">{selectedItem.description}</span>
                </div>
                <span className="text-xl font-black text-amber-500">{peso(selectedItem.amount)}</span>
              </div>

              {/* Detail Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Actual Spent */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold tracking-wide uppercase" style={{ color: textMuted }}>Actual Spent Amount (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Enter amount spent"
                    value={actualAmount}
                    onChange={(e) => setActualAmount(e.target.value)}
                    className="px-3 py-2.5 rounded-xl text-sm font-semibold outline-none border focus:border-emerald-500 transition-all"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>

                {/* 2. Receipt Number */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold tracking-wide uppercase" style={{ color: textMuted }}>Receipt / Invoice Number</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-10029"
                    value={receiptNo}
                    onChange={(e) => setReceiptNo(e.target.value)}
                    className="px-3 py-2.5 rounded-xl text-sm outline-none border focus:border-emerald-500 transition-all"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>

                {/* 3. Receipt Date */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold tracking-wide uppercase" style={{ color: textMuted }}>Receipt Date</label>
                  <input
                    type="text"
                    placeholder="e.g. 03-Jun-26, Jun 3"
                    value={dateRaw}
                    onChange={(e) => setDateRaw(e.target.value)}
                    onBlur={() => handleDateBlur(dateRaw)}
                    className="px-3 py-2.5 rounded-xl text-sm outline-none border focus:border-emerald-500 transition-all"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                  {dateError && <span className="text-[10px] text-rose-500 font-medium">{dateError}</span>}
                </div>

                {/* 4. Company / Vendor */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold tracking-wide uppercase" style={{ color: textMuted }}>Vendor / Supplier Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Ace Hardware"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="px-3 py-2.5 rounded-xl text-sm outline-none border focus:border-emerald-500 transition-all"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>

                {/* 5. Incurred By */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold tracking-wide uppercase" style={{ color: textMuted }}>Incurred By (Installer)</label>
                  <input
                    type="text"
                    placeholder="Worker who requested funds"
                    value={incurredBy}
                    onChange={(e) => setIncurredBy(e.target.value)}
                    className="px-3 py-2.5 rounded-xl text-sm outline-none border focus:border-emerald-500 transition-all"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>

                {/* 6. Description */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold tracking-wide uppercase" style={{ color: textMuted }}>Expense Details</label>
                  <input
                    type="text"
                    placeholder="What was bought"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="px-3 py-2.5 rounded-xl text-sm outline-none border focus:border-emerald-500 transition-all"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>

                {/* 7. Category */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold tracking-wide uppercase" style={{ color: textMuted }}>Expense Category</label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="px-3 py-2.5 rounded-xl text-sm outline-none border focus:border-emerald-500 transition-all"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  >
                    {allCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* 8. Source of Funds */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold tracking-wide uppercase" style={{ color: textMuted }}>Source of Funds</label>
                  <select
                    value={sourceOfFunds}
                    onChange={(e) => setSourceOfFunds(e.target.value)}
                    className="px-3 py-2.5 rounded-xl text-sm outline-none border focus:border-emerald-500 transition-all"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  >
                    <option value="PETTY CASH">Petty Cash</option>
                    <option value="CASH REMITS">Cash Remits</option>
                    <option value="OFFICE FUND">Office Fund</option>
                  </select>
                </div>
              </div>

              {/* Calculated Change Details */}
              <div className="rounded-2xl p-4 mt-2 flex items-center justify-between transition-all duration-300"
                style={{ 
                  backgroundColor: computedChange > 0 ? 'rgba(16, 185, 129, 0.08)' : computedChange < 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                  border: `1px solid ${computedChange > 0 ? '#10B98133' : computedChange < 0 ? '#EF444433' : '#F59E0B33'}` 
                }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className={computedChange > 0 ? 'text-emerald-500' : computedChange < 0 ? 'text-rose-500' : 'text-amber-500'} size={18} />
                  <div>
                    <span className="text-xs font-bold block" style={{ color: textPrimary }}>Refund or Difference</span>
                    <span className="text-[10px]" style={{ color: textMuted }}>
                      {computedChange > 0 
                        ? 'Installer returned change. Safe to remit back to office cash.' 
                        : computedChange < 0 
                          ? 'Spent exceeded request. Additional reimbursement required.'
                          : 'Amount matched perfectly. No change returned.'
                      }
                    </span>
                  </div>
                </div>
                <span className={`text-xl font-black ${computedChange > 0 ? 'text-emerald-500' : computedChange < 0 ? 'text-rose-500' : 'text-amber-500'}`}>
                  {peso(computedChange)}
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 md:p-6 border-t flex justify-end gap-3" style={{ borderColor: border }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-semibold rounded-xl border hover:bg-gray-500/10 transition-colors"
                style={{ borderColor: inputBorder, color: textPrimary }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resolving || !!dateError}
                onClick={submitResolution}
                className="px-5 py-2 text-sm font-semibold rounded-xl text-white transition-all flex items-center gap-1.5 hover:shadow-lg disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                {resolving && <Loader2 className="animate-spin" size={16} />}
                Confirm & Log Expense
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
