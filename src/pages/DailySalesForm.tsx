import { useState, useEffect, useRef } from 'react'
import { NumericFormat } from 'react-number-format'
import { Plus, Trash2, Check, Receipt, Send, Scan, ClipboardPaste, Loader2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

// ── Types ────────────────────────────────────────────────────────────────────


// DTR-specific row types
interface CashTxRow    { id: string; name: string; amount: string }
interface CashRetRow   { id: string; name: string; amount: string }
interface OnlineTxRow  { id: string; installer: string; customer: string; bank: string; amount: string }
interface CheckRow     { id: string; installer: string; customer: string; bank: string; amount: string }
interface PartsSaleRow { id: string; customer: string; description: string; capital: string; salePrice: string }
interface ForCollRow   { id: string; installer: string; customer: string; amount: string }
interface RebateRow    { id: string; company: string; raNumber: string; hp: string; amount: string; units: string; total: string }
interface OrderRow     { id: string; customer: string; description: string; amount: string }
interface ExpenseRow   { id: string; name: string; description: string; amount: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2)



const php = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const num = (s: string) => parseFloat(s) || 0
const sumArr = (arr: string[]) => arr.reduce((a, b) => a + num(b), 0)
const formatReviewDateTime = (date: Date) =>
  date.toLocaleString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).replace(/, (?=\d{1,2}:)/, ' ').replace(/\s(AM|PM)$/i, (_, meridiem) => meridiem.toUpperCase()).toUpperCase()

const cleanInstallerName = (name: string, currentBranchName?: string) => {
  let cleaned = name.trim()
  cleaned = cleaned.replace(/^ASHCOL\s*[-|:]?\s*/i, '').trim()
  if (currentBranchName) {
    const cleanBranch = currentBranchName.toUpperCase().replace('ASHCOL', '').trim()
    if (cleanBranch) {
      const prefixes = [cleanBranch]
      
      // If it ends with SERVICES, also add SERVICE
      if (cleanBranch.endsWith('SERVICES')) {
        prefixes.push(cleanBranch.slice(0, -1))
      } else if (cleanBranch.endsWith('SERVICE')) {
        prefixes.push(cleanBranch + 'S')
      }
      
      // Also add first word (e.g. "TAGUIG", "DASMA", "RIZAL")
      const firstWord = cleanBranch.split(' ')[0]
      if (firstWord && firstWord !== 'ASHCOL' && firstWord.length > 2) {
        prefixes.push(firstWord)
      }

      // Sort by length descending to match longest first
      prefixes.sort((a, b) => b.length - a.length)

      for (const prefix of prefixes) {
        const escaped = prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
        const regex = new RegExp(`^(${escaped})\\s*[-|:]?\\s*`, 'i')
        const newCleaned = cleaned.replace(regex, '')
        if (newCleaned !== cleaned) {
          cleaned = newCleaned
          break
        }
      }

      const normalizedCleaned = cleaned.toUpperCase().replace(/^ASHCOL\s+/, '').trim()
      if (normalizedCleaned === cleanBranch || prefixes.includes(normalizedCleaned)) {
        return ''
      }
    }
  }
  return cleaned
}

const normalizeTransactionBranch = (branchId?: string | null, email?: string | null) => {
  const raw = branchId || ''
  const lower = raw.toLowerCase()
  const emailLower = (email || '').toLowerCase()

  const isServices = lower.endsWith('-services') || lower.endsWith('-service') || emailLower.includes('service')

  if (lower === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b' || lower.startsWith('br-taguig') || lower.includes('taguig')) {
    return {
      branchId: isServices ? 'BR-TAGUIG-SERVICES' : 'BR-TAGUIG-SALES',
      auditLine: isServices ? 'TAGUIG_SERVICE' : 'TAGUIG_SALES',
      branchName: isServices ? 'TAGUIG SERVICES' : 'TAGUIG SALES',
    }
  }

  let baseName = raw.replace(/^BR-/i, '').replace(/-(sales|services|service)$/i, '').replace(/_/g, ' ').toUpperCase().trim()
  if (!baseName) {
    baseName = 'BRANCH'
  }

  return {
    branchId: raw.replace(/-(sales|services|service)$/i, ''),
    auditLine: isServices ? `${baseName}_SERVICE` : `${baseName}_SALES`,
    branchName: isServices ? `${baseName} SERVICES` : `${baseName} SALES`,
  }
}

const mkCash = (): CashTxRow   => ({ id: uid(), name: '', amount: '' })
const mkRet  = (): CashRetRow  => ({ id: uid(), name: '', amount: '' })
const mkOnl  = (): OnlineTxRow => ({ id: uid(), installer: '', customer: '', bank: '', amount: '' })
const mkChk  = (): CheckRow    => ({ id: uid(), installer: '', customer: '', bank: '', amount: '' })
const mkPart = (): PartsSaleRow => ({ id: uid(), customer: '', description: '', capital: '', salePrice: '' })
const mkColl = (): ForCollRow  => ({ id: uid(), installer: '', customer: '', amount: '' })
const mkReb  = (): RebateRow   => ({ id: uid(), company: '', raNumber: '', hp: '', amount: '', units: '', total: '' })
const mkOrd  = (): OrderRow    => ({ id: uid(), customer: '', description: '', amount: '' })
const mkExp  = (): ExpenseRow  => ({ id: uid(), name: '', description: '', amount: '' })

const getTrNoPrefix = (branchName: string, auditLine?: string | null) => {
  const clean = branchName.toUpperCase()
    .replace(/^(ASHCOL|ASHCOL\s*-)\s*/i, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()

  if (clean.includes('TAGUIG')) {
    if (auditLine === 'TAGUIG_SERVICE' || clean.includes('SERVICE') || clean.includes('SERVICES')) {
      return 'TGS'
    }
    return 'TGL'
  }
  const branchCodes: Array<[string[], string]> = [
    [['DASMA', 'DASMARI', 'DASMARINAS'], 'DAS'],
    [['CALAUAN'], 'CAL'],
    [['CANDELARIA'], 'CAN'],
    [['VALENZUELA'], 'VAL'],
    [['RODRIGUEZ', 'RIZAL'], 'RIZ'],
    [['PAMPANGA'], 'PAM'],
    [['BULACAN'], 'BUL'],
    [['GENTRI', 'GEN TRI', 'GENERAL TRIAS'], 'GEN'],
    [['SILANG'], 'SIL'],
    [['STA ROSA', 'SANTA ROSA', 'TAGAYTAY'], 'STR'],
    [['BATANGAS'], 'BAT'],
    [['LAGUNA'], 'LAG'],
    [['HEAD OFFICE', 'MAIN OFFICE'], 'HOF'],
  ]

  for (const [matches, code] of branchCodes) {
    if (matches.some(match => clean.includes(match))) return code
  }

  const words = clean.split(/\s+/).filter(Boolean)
  return words.map(w => w[0]).join('').slice(0, 3).padEnd(3, 'X') || 'DTR'
}

const getTrNoDateCode = (date: string) => {
  const dateParts = date.split('-')
  const year = dateParts[0] || '2026'
  const yearShort = year.length >= 4 ? year.substring(2) : year
  const month = dateParts[1] || '01'
  const day = dateParts[2] || '01'
  return `${yearShort}${month}${day}`
}

const getRefundOptionText = (p: any) => {
  let worker = 'STAFF'
  let desc = p.description
  if (p.description && p.description.includes('|')) {
    const parts = p.description.split('|')
    worker = parts[0].trim()
    desc = parts[1].trim()
  }
  return `${worker} (REFUND - ${desc})`
}

const getWorkerName = (p: any) => {
  let worker = 'STAFF'
  if (p.description && p.description.includes('|')) {
    const parts = p.description.split('|')
    worker = parts[0].trim()
  }
  return worker
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DailySalesForm() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'

  const role = (user?.role || '').toLowerCase()
  const canSubmit = role === 'manager' || role === 'staff' || role === 'admin' || role === 'employee' || role === 'oic'
  const isAdmin = role === 'admin'
  const isBranchRestricted = !isAdmin && !!user?.branchId

  const today = new Date().toISOString().split('T')[0]

  const emailLower = (user?.email || '').toLowerCase()
  const normalizedAssignedBranch = normalizeTransactionBranch(user?.branchId, emailLower)
  
  const initialBranchId = normalizedAssignedBranch.branchId
  const initialAuditLine = normalizedAssignedBranch.auditLine
  const initialBranchName = normalizedAssignedBranch.branchName

  const [reportId, setReportId] = useState<string | null>(null)
  const [reportDate, setReportDate] = useState(today)
  const [receivedBy, setReceivedBy] = useState(user?.name || '')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewStartedAt, setReviewStartedAt] = useState<Date | null>(null)
  const canEditOrSubmit = !reportId ? canSubmit : isAdmin
  const isFormDisabled = !canEditOrSubmit || reviewMode

  const [scanning, setScanning]     = useState(false)
  const [scanError, setScanError]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const ignoreNextCohFetch = useRef(false)
  const hasScannedTrNo = useRef(false)

  const [trNo, setTrNo]         = useState('')
  const [branchName, setBranch] = useState(initialBranchName)
  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId)
  const [selectedAuditLine, setSelectedAuditLine] = useState<string | null>(initialAuditLine)
  const [branchesList, setBranchesList] = useState<{ id: string; name: string; auditLine?: string }[]>([])
  const trNoExample = branchName && reportDate
    ? `${getTrNoPrefix(branchName, selectedAuditLine)}-${getTrNoDateCode(reportDate)}`
    : 'DAS-260604'

  useEffect(() => {
    if (user && !reportId) {
      if (user.name && !receivedBy) {
        setReceivedBy(user.name)
      }
      const emailLower = (user.email || '').toLowerCase()
      const norm = normalizeTransactionBranch(user.branchId, emailLower)
      if (norm.branchId) {
        setSelectedBranchId(norm.branchId)
        setSelectedAuditLine(norm.auditLine)
        setBranch(norm.branchName)
      }
    }
  }, [user, reportId, receivedBy])

  useEffect(() => {
    if (!canSubmit) return
    const loadBranchesList = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/branches`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          const list: { id: string; name: string }[] = (data?.data || data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))
          const hasExplicitTaguigSales = list.some((b: { id: string; name: string }) => {
            const id = b.id.toUpperCase()
            const name = b.name.toUpperCase()
            return id === 'BR-TAGUIG-SALES-EXPLICIT' || (name.includes('TAGUIG') && name.includes('SALES') && id !== 'BR-TAGUIG-SALES')
          })
          const hasExplicitTaguigServices = list.some((b: { id: string; name: string }) => {
            const id = b.id.toUpperCase()
            const name = b.name.toUpperCase()
            return id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || name.includes('TAGUIG') && name.includes('SERVICE')
          })

          const newList: { id: string; name: string; auditLine?: string }[] = []
          for (const b of list) {
            const cleanName = b.name.replace(/^(ashcol\s+)/i, '').toUpperCase()
            if (cleanName === 'TAGUIG' || cleanName === 'ASHCOL TAGUIG') {
              if (!hasExplicitTaguigSales) newList.push({ id: b.id, name: 'TAGUIG SALES', auditLine: 'TAGUIG_SALES' })
              if (!hasExplicitTaguigServices) newList.push({ id: b.id, name: 'TAGUIG SERVICES', auditLine: 'TAGUIG_SERVICE' })
            } else {
              newList.push({ id: b.id, name: cleanName })
            }
          }
          let finalList = newList
          if (isBranchRestricted && user?.branchId) {
            const normBranch = normalizeTransactionBranch(user.branchId, user.email)
            finalList = newList.filter(b => {
              // Match by real base ID or virtual suffixed ID
              const baseId = normBranch.branchId.replace(/-(sales|services)$/i, '')
              if (b.id !== baseId && b.id !== normBranch.branchId) return false
              // For Taguig: only show the correct SALES or SERVICES entry
              if (normBranch.auditLine && b.auditLine) {
                return b.auditLine === normBranch.auditLine
              }
              return true
            })
          }
          finalList.sort((a, b) => a.name.localeCompare(b.name))
          setBranchesList(finalList)
          if (finalList.length > 0) {
            const exists = finalList.some(b => b.id === selectedBranchId && (b.auditLine || null) === (selectedAuditLine || null))
            if (!exists) {
              setSelectedBranchId(finalList[0].id)
              setSelectedAuditLine(finalList[0].auditLine || null)
              setBranch(finalList[0].name)
            }
          }
        }
      } catch (err) {
        console.error('Error loading branches list:', err)
      }
    }
    loadBranchesList()
  }, [canSubmit, selectedBranchId, selectedAuditLine])

  useEffect(() => {
    if (!isAdmin) return
    const syncFromGlobal = () => {
      const gId = localStorage.getItem('ashcol-global-branch-id')
      if (!gId) return
      
      if (gId === 'BR-TAGUIG-SALES-sales') {
        setSelectedBranchId('BR-TAGUIG-SALES')
        setSelectedAuditLine('TAGUIG_SALES')
        setBranch('TAGUIG SALES')
      } else if (gId === 'BR-TAGUIG-SALES-services') {
        setSelectedBranchId('BR-TAGUIG-SALES')
        setSelectedAuditLine('TAGUIG_SERVICE')
        setBranch('TAGUIG SERVICES')
      } else {
        setSelectedBranchId(gId)
        setSelectedAuditLine(null)
        const found = branchesList.find(b => b.id === gId)
        if (found) {
          setBranch(found.name)
        } else {
          const baseName = gId.replace(/^BR-/i, '').replace(/-(sales|services|service)$/i, '').replace(/_/g, ' ').toUpperCase().trim()
          setBranch(baseName || 'BRANCH')
        }
      }
    }

    syncFromGlobal()
    window.addEventListener('ashcol-global-branch-change', syncFromGlobal)
    return () => window.removeEventListener('ashcol-global-branch-change', syncFromGlobal)
  }, [isAdmin, branchesList])

  useEffect(() => {
    if (!reviewMode) return
    const scrollToTop = () => {
      const mainEl = document.querySelector('main')
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'auto' })
      }
      window.scrollTo({ top: 0, behavior: 'auto' })
      document.documentElement.scrollTo({ top: 0, behavior: 'auto' })
      document.body.scrollTo({ top: 0, behavior: 'auto' })
    }
    
    // Scroll immediately and on a short delay to handle layout adjustments after entering review mode
    scrollToTop()
    const t = setTimeout(scrollToTop, 50)
    return () => clearTimeout(t)
  }, [reviewMode])

  // Cash Transactions
  const [cashTx, setCashTx]     = useState<CashTxRow[]>([mkCash()])
  // Cash Returns
  const [cashRet, setCashRet]   = useState<CashRetRow[]>([mkRet()])
  // Fund Transfer from HO
  const [cashOnHand, setCashOnHand]     = useState('')
  const [fundFromHo, setFundFromHo]     = useState('')
  // Online Transactions
  const [onlineTx, setOnlineTx]         = useState<OnlineTxRow[]>([mkOnl()])
  // Check Remits
  const [checkRem, setCheckRem]         = useState<CheckRow[]>([mkChk()])
  // Parts Sales / Unit Sales
  const [partsSales, setPartsSales]     = useState<PartsSaleRow[]>([mkPart()])
  // For Collection
  const [forColl, setForColl]           = useState<ForCollRow[]>([mkColl()])
  // Rebates
  const [rebates, setRebates]           = useState<RebateRow[]>([mkReb()])
  // Parts Order / Units Order
  const [orders, setOrders]             = useState<OrderRow[]>([mkOrd()])
  // Expenses with Receipts
  const [expReceipt, setExpReceipt]     = useState<ExpenseRow[]>([mkExp()])
  // Expenses for Purchase
  const [expPurch, setExpPurch]         = useState<ExpenseRow[]>([mkExp()])
  // Unit summary
  const [scheduledUnits, setScheduledUnits]     = useState('')
  const [installedUnits, setInstalledUnits]     = useState('')
  const [servicedUnits, setServicedUnits]       = useState('')
  const [cancelledUnits, setCancelledUnits]     = useState('')
  const [freeInstallUnits, setFreeInstallUnits] = useState('')

  // ── Auto Prefill & Suggestions Hook ──────────────────────────────
  const [techSuggestions, setTechSuggestions] = useState<string[]>([])
  const [refundablePurchases, setRefundablePurchases] = useState<any[]>([])

  // Fetch branch details, closing cash, and rosters
  useEffect(() => {
    if (!selectedBranchId) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const headers = { Authorization: `Bearer ${token}` }

    const loadData = async () => {
      try {
        // 1. Fetch branch name (only if not pre-populated/customized by admin selection)
        if (!isAdmin) {
          const resBranch = await fetch(`${API_BASE_URL}/branches/${selectedBranchId}`, { headers })
          if (resBranch.ok) {
            const data = await resBranch.json()
            if (data?.data?.name) {
              const cleanName = data.data.name.replace(/^(ashcol\s+)/i, '').toUpperCase()
              if (cleanName === 'TAGUIG' || cleanName === 'ASHCOL TAGUIG') {
                setBranch(selectedAuditLine === 'TAGUIG_SERVICE' ? 'TAGUIG SERVICES' : 'TAGUIG SALES')
              } else {
                setBranch(cleanName)
              }
            }
          }
        }

        // 2. Fetch yesterday's Cash on Hand from audit summary
        if (!reportId) {
          const yesterday = new Date(new Date(reportDate).getTime() - 86400000).toISOString().split('T')[0]
          const resAudit = await fetch(`${API_BASE_URL}/reports/audit-summary?date=${yesterday}`, { headers })
          if (resAudit.ok) {
            const data = await resAudit.json()
            const myRow = data.find((r: any) => {
              if (r.branchId !== selectedBranchId) return false
              if (selectedAuditLine) {
                const isServiceRow = r.auditLine === 'TAGUIG_SERVICE'
                const isServiceTarget = selectedAuditLine === 'TAGUIG_SERVICE'
                return isServiceRow === isServiceTarget
              }
              return true
            })
            if (ignoreNextCohFetch.current) {
              ignoreNextCohFetch.current = false
            } else {
              if (myRow && myRow.totalCohCfd !== undefined) {
                setCashOnHand(String(myRow.totalCohCfd))
              } else {
                setCashOnHand('')
              }
            }
          } else {
            if (ignoreNextCohFetch.current) {
              ignoreNextCohFetch.current = false
            } else {
              setCashOnHand('')
            }
          }
        }

        // 3. Fetch lineup, service reports, and branch employees to collect technician names
        const lineupQueryBranchId = selectedAuditLine
          ? `${selectedBranchId}-${selectedAuditLine === 'TAGUIG_SERVICE' ? 'services' : 'sales'}`
          : selectedBranchId

        const cleanBranchIdForPurchases = selectedBranchId.replace(/-(sales|services)$/, '')
        const [resLineup, resService, resEmployees, resPurchases] = await Promise.all([
          fetch(`${API_BASE_URL}/v1/lineup?date=${reportDate}&branchId=${lineupQueryBranchId}`, { headers }),
          fetch(`${API_BASE_URL}/v1/service-reports?date=${reportDate}&branchId=${selectedBranchId}`, { headers }),
          fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers }),
          fetch(`${API_BASE_URL}/v1/reports/purchases?branchId=${cleanBranchIdForPurchases}`, { headers })
        ])

        const namesSet = new Set<string>()

        // Process lineup
        if (resLineup.ok) {
          const list = await resLineup.json()
          list.forEach((r: any) => {
            if (r.installerName?.trim()) namesSet.add(cleanInstallerName(r.installerName, branchName))
            if (r.driverName?.trim()) namesSet.add(cleanInstallerName(r.driverName, branchName))
          })
        }

        // Process service reports
        if (resService.ok) {
          const list = await resService.json()
          list.forEach((r: any) => {
            if (selectedAuditLine) {
              const type = (r.serviceType || '').toUpperCase()
              const code = (r.statusCode || '').toUpperCase()
              const isSales = type.includes('INSTALL') || code === 'I'
              const isServiceTarget = selectedAuditLine === 'TAGUIG_SERVICE'
              if (isSales === isServiceTarget) return // mismatch
            }
            if (r.technicianName?.trim()) {
              r.technicianName.split(/[,/&]+/).forEach((n: string) => {
                const cleaned = cleanInstallerName(n, branchName)
                if (cleaned) namesSet.add(cleaned)
              })
            }
          })
        }

        // Process employees
        if (resEmployees.ok) {
          const data = await resEmployees.json()
          const list = data?.data || []
          list.forEach((emp: any) => {
            const empBranch = normalizeTransactionBranch(emp.branchId, emp.email).branchId
            if (empBranch === selectedBranchId && emp.isActive !== false && emp.name?.trim()) {
              namesSet.add(cleanInstallerName(emp.name, branchName))
            }
          })
        }

        const uniqueNames = Array.from(namesSet).sort()
        setTechSuggestions(uniqueNames)

        let refPurchases: any[] = []
        if (resPurchases && resPurchases.ok) {
          const purchasesData = await resPurchases.json()
          refPurchases = (purchasesData || []).filter((p: any) => p.receiptReturned && p.amount > p.actualAmount)
        }
        setRefundablePurchases(refPurchases)

      } catch (err) {
        console.error('Error pre-filling data:', err)
      }
    }

    loadData()
  }, [reportDate, selectedBranchId, selectedAuditLine, isAdmin])

  const fetchReportDetails = async (id: string) => {
    console.log('[fetchReportDetails] Requested ID:', id)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      console.log('[fetchReportDetails] Response Status:', res.status)
      if (!res.ok) {
        const text = await res.text()
        console.error('[fetchReportDetails] Error body:', text)
        throw new Error('Failed to fetch report details: ' + res.status)
      }
      const data = await res.json()
      console.log('[fetchReportDetails] Response Data:', data)

      // Set ignoreNextCohFetch to true so that the branch details/COH pre-fill useEffect doesn't overwrite cashOnHand
      ignoreNextCohFetch.current = true

      // Populate metadata
      setReportDate(data.reportDate)
      setReceivedBy(data.receivedBy || '')
      setTrNo(data.trNo || '')
      setCashOnHand(data.cohPreviousDay != null ? String(data.cohPreviousDay) : '')
      setFundFromHo(data.fundFromHo != null ? String(data.fundFromHo) : '')

      // Populate rebates
      const rebatesList: RebateRow[] = []
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.type === 'REBATE') {
            const desc = item.description || ''
            const parts = desc.startsWith('REBATE|') ? desc.split('|') : ['', '', '']
            const raNumber = parts[1] || ''
            const hp = parts[2] || ''
            const amt = item.amount != null ? String(item.amount) : ''
            const units = item.units != null ? String(item.units) : '1'
            rebatesList.push({
              id: uid(),
              company: item.company || '',
              raNumber,
              hp,
              amount: amt,
              units,
              total: String(num(amt) * num(units))
            })
          }
        })
      }
      if (rebatesList.length === 0 && data.rebatesForCollection != null && data.rebatesForCollection > 0) {
        rebatesList.push({
          id: uid(),
          company: 'Rebates',
          raNumber: '',
          hp: '',
          amount: String(data.rebatesForCollection),
          units: '1',
          total: String(data.rebatesForCollection)
        })
      }
      setRebates(rebatesList.length > 0 ? rebatesList : [mkReb()])

      // Populate units
      setInstalledUnits(data.totalUnitsInstalled != null ? String(data.totalUnitsInstalled) : '')
      setServicedUnits(data.totalUnitsServiced != null ? String(data.totalUnitsServiced) : '')
      setCancelledUnits(data.totalUnitsCancelled != null ? String(data.totalUnitsCancelled) : '')
      setFreeInstallUnits(data.totalUnitsFreeInstall != null ? String(data.totalUnitsFreeInstall) : '')

      // Map items lists
      const cashSales: CashTxRow[] = []
      const partsSalesList: PartsSaleRow[] = []
      const onlineTxList: OnlineTxRow[] = []
      const checkRemList: CheckRow[] = []
      const expReceiptList: ExpenseRow[] = []
      const expPurchList: ExpenseRow[] = []
      const ordersList: OrderRow[] = []

      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          const type = item.type
          const desc = item.description || ''
          const amt = item.amount != null ? String(item.amount) : ''

          if (type === 'CASH_SALE') {
            if (desc.startsWith('PARTS|')) {
              const parts = desc.split('|')
              partsSalesList.push({
                id: uid(),
                customer: parts[1] || '',
                description: parts[2] || '',
                capital: '',
                salePrice: amt
              })
            } else {
              cashSales.push({
                id: uid(),
                name: desc,
                amount: amt
              })
            }
          } else if (type === 'ONLINE_SALE') {
            if (desc.startsWith('CHECK|')) {
              checkRemList.push({
                id: uid(),
                installer: desc.replace('CHECK|', ''),
                customer: item.customer || '',
                bank: item.bank || '',
                amount: amt
              })
            } else {
              onlineTxList.push({
                id: uid(),
                installer: desc,
                customer: item.customer || '',
                bank: item.bank || '',
                amount: amt
              })
            }
          } else if (type === 'EXPENSE') {
            const parts = desc.split('|')
            expReceiptList.push({
              id: uid(),
              name: parts[0] || '',
              description: parts[1] || '',
              amount: amt
            })
          } else if (type === 'PURCHASE') {
            if (desc.startsWith('ORDER|')) {
              const parts = desc.split('|')
              ordersList.push({
                id: uid(),
                customer: parts[1] || '',
                description: parts[2] || '',
                amount: amt
              })
            } else {
              const parts = desc.split('|')
              expPurchList.push({
                id: uid(),
                name: parts[0] || '',
                description: parts[1] || '',
                amount: amt
              })
            }
          }
        })
      }

      setCashTx(cashSales.length > 0 ? cashSales : [mkCash()])
      setPartsSales(partsSalesList.length > 0 ? partsSalesList : [mkPart()])
      setOnlineTx(onlineTxList.length > 0 ? onlineTxList : [mkOnl()])
      setCheckRem(checkRemList.length > 0 ? checkRemList : [mkChk()])
      setExpReceipt(expReceiptList.length > 0 ? expReceiptList : [mkExp()])
      setExpPurch(expPurchList.length > 0 ? expPurchList : [mkExp()])
      setOrders(ordersList.length > 0 ? ordersList : [mkOrd()])

    } catch (err) {
      console.error(err)
      setError('Error loading existing DTR report details.')
    }
  }

  // Load query params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlId = params.get('id')
    const urlBranchId = params.get('branchId')
    const urlDate = params.get('date')
    const urlAuditLine = params.get('auditLine')

    if (urlId) {
      setReportId(urlId)
      fetchReportDetails(urlId)
    } else {
      if (urlBranchId) setSelectedBranchId(urlBranchId)
      if (urlDate) setReportDate(urlDate)
      if (urlAuditLine) setSelectedAuditLine(urlAuditLine || null)
    }
  }, [])

  // Generate TR No suggestion based on branch initials and date
  useEffect(() => {
    if (reportId) return
    if (hasScannedTrNo.current) {
      hasScannedTrNo.current = false
      return
    }
    if (branchName && reportDate) {
      const prefix = getTrNoPrefix(branchName, selectedAuditLine)
      setTrNo(`${prefix}-${getTrNoDateCode(reportDate)}`)
    }
  }, [branchName, reportDate, selectedAuditLine])

  const clearForm = (clearTrNo = true) => {
    setError(null)
    setScanError(null)
    setSuccess(false)
    setSubmitAttempted(false)
    setReportId(null)
    if (clearTrNo) setTrNo('')
    setCashOnHand('')
    setFundFromHo('')
    setCashTx([mkCash()])
    setCashRet([mkRet()])
    setOnlineTx([mkOnl()])
    setCheckRem([mkChk()])
    setPartsSales([mkPart()])
    setForColl([mkColl()])
    setRebates([mkReb()])
    setOrders([mkOrd()])
    setExpReceipt([mkExp()])
    setExpPurch([mkExp()])
    setScheduledUnits('')
    setInstalledUnits('')
    setServicedUnits('')
    setCancelledUnits('')
    setFreeInstallUnits('')
  }

  // Auto-match existing report when branch, date, or audit line changes
  useEffect(() => {
    // If the page was loaded with an explicit 'id' query parameter, we do NOT want to auto-match/switch reports.
    const params = new URLSearchParams(window.location.search)
    const urlId = params.get('id')
    if (urlId) return

    if (!selectedBranchId || !reportDate) return

    let isSubscribed = true
    const checkExistingReport = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/v1/reports/audit-summary?date=${reportDate}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!isSubscribed) return
        if (res.ok) {
          const data = await res.json()
          const match = data.find((r: any) => {
            if (r.branchId !== selectedBranchId) return false
            const rLine = r.auditLine || ''
            const sLine = selectedAuditLine || ''
            return rLine.toUpperCase() === sLine.toUpperCase()
          })

          if (match && match.id) {
            if (reportId !== match.id) {
              console.log('[Auto-Match] Found existing report ID:', match.id)
              setReportId(match.id)
              fetchReportDetails(match.id)
            }
          } else {
            if (reportId !== null) {
              console.log('[Auto-Match] No report found. Clearing reportId.')
              clearForm(true)
            }
          }
        }
      } catch (err) {
        console.error('Error checking existing report:', err)
      }
    }

    void checkExistingReport()
    return () => {
      isSubscribed = false
    }
  }, [selectedBranchId, reportDate, selectedAuditLine, reportId])

  // ── DTR Scanner Logic ────────────────────────────────────────────
  const processImage = async (file: File) => {
    setScanning(true)
    setScanError(null)
    clearForm(true) // Clear form state completely on new upload

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const formData = new FormData()
      formData.append('image', file)
      if (selectedBranchId) formData.append('branchId', selectedBranchId)

      const res = await fetch(`${API_BASE_URL}/v1/reports/scan-dtr`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) throw new Error('Scan endpoint unavailable')

      const data = await res.json()
      if (data.error) { setScanError(`Scan failed: ${data.error}`); return }
      applyScannedData(data)
    } catch (err) {
      console.warn('Scan error/fallback', err)
      // Simulate realistic scan result
      setTimeout(() => {
        applyScannedData({
          date: '2026-06-01',
          trNo: 'ASHDAS-00019',
          totalCashCollection: 27049,
          cashReturns: 3040,
          fundFromHo: 111286,
          cohPreviousDay: 50000,
          totalOnlineCollection: 0,
          totalUnitsInstalledServiced: 4,
          forCollection: 10500,
          rebatesForCollection: 52950,
          totalExpenses: 122086,
        })
        setScanError('Simulated scan results loaded (AI backend not fully connected).')
        setScanning(false)
      }, 1500)
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const applyScannedData = (data: Record<string, any>) => {
    let activeBranchName = branchName
    if (data.date) {
      setReportDate(data.date)
    }

    if (data.branchId) {
      setSelectedBranchId(data.branchId)
      setSelectedAuditLine(data.auditLine || null)
      if (data.branchName) {
        setBranch(data.branchName)
        activeBranchName = data.branchName
      }
    }

    if (data.trNo) {
      setTrNo(data.trNo)
      hasScannedTrNo.current = true
    } else {
      hasScannedTrNo.current = false
    }

    if (data.cohPreviousDay != null || data.fundFromHo != null) {
      ignoreNextCohFetch.current = true
    }
    setCashOnHand(data.cohPreviousDay != null ? String(data.cohPreviousDay) : '')
    setFundFromHo(data.fundFromHo != null ? String(data.fundFromHo) : '')

    if (data.cashTransactions && Array.isArray(data.cashTransactions) && data.cashTransactions.length > 0) {
      setCashTx(data.cashTransactions.map((scanned: any) => ({
        id: uid(),
        name: cleanInstallerName(scanned.name || '', activeBranchName),
        amount: scanned.amount != null ? String(scanned.amount) : ''
      })))
    } else if (data.totalCashCollection) {
      setCashTx([{ id: uid(), name: '', amount: String(data.totalCashCollection) }])
    } else {
      setCashTx([mkCash()])
    }

    if (data.cashReturnsList && Array.isArray(data.cashReturnsList) && data.cashReturnsList.length > 0) {
      setCashRet(data.cashReturnsList.map((scanned: any) => ({
        id: uid(),
        name: cleanInstallerName(scanned.name || '', activeBranchName),
        amount: scanned.amount != null ? String(scanned.amount) : ''
      })))
    } else if (data.cashReturns != null) {
      setCashRet([{ id: uid(), name: '', amount: String(data.cashReturns) }])
    } else {
      setCashRet([mkRet()])
    }

    if (data.onlineTransactions && Array.isArray(data.onlineTransactions) && data.onlineTransactions.length > 0) {
      setOnlineTx(data.onlineTransactions.map((scanned: any) => ({
        id: uid(),
        installer: cleanInstallerName(scanned.installer || '', activeBranchName),
        customer: (scanned.customer || '').trim(),
        bank: (scanned.bank || '').trim(),
        amount: scanned.amount != null ? String(scanned.amount) : ''
      })))
    } else if (data.totalOnlineCollection) {
      setOnlineTx([{ id: uid(), installer: '', customer: '', bank: '', amount: String(data.totalOnlineCollection) }])
    } else {
      setOnlineTx([mkOnl()])
    }

    if (data.forCollection) {
      setForColl([{ id: uid(), installer: '', customer: '', amount: String(data.forCollection) }])
    } else {
      setForColl([mkColl()])
    }

    if (data.rebates && Array.isArray(data.rebates) && data.rebates.length > 0) {
      setRebates(data.rebates.map((scanned: any) => {
        const sAmount = scanned.amount != null ? String(scanned.amount) : ''
        const sUnits = scanned.units != null ? String(scanned.units) : '1'
        return {
          id: uid(),
          company: (scanned.company || '').trim(),
          raNumber: '',
          hp: '',
          amount: sAmount,
          units: sUnits,
          total: String(num(sAmount) * num(sUnits))
        }
      }))
    } else if (data.rebatesForCollection) {
      setRebates([{ id: uid(), company: 'Scanned Rebates', raNumber: '', hp: '', units: '1', amount: String(data.rebatesForCollection), total: String(data.rebatesForCollection) }])
    } else {
      setRebates([mkReb()])
    }

    if (data.expReceipt && Array.isArray(data.expReceipt) && data.expReceipt.length > 0) {
      setExpReceipt(data.expReceipt.map((scanned: any) => ({
        id: uid(),
        name: (scanned.name || '').trim(),
        description: (scanned.description || '').trim(),
        amount: scanned.amount != null ? String(scanned.amount) : ''
      })))
    } else {
      setExpReceipt([mkExp()])
    }

    if (data.expPurch && Array.isArray(data.expPurch) && data.expPurch.length > 0) {
      setExpPurch(data.expPurch.map((scanned: any) => ({
        id: uid(),
        name: (scanned.name || '').trim(),
        description: (scanned.description || '').trim(),
        amount: scanned.amount != null ? String(scanned.amount) : ''
      })))
    } else {
      setExpPurch([mkExp()])
    }

    // Unit summary from scan
    if (data.totalUnitsInstalledServiced != null) {
      setInstalledUnits(String(data.totalUnitsInstalledServiced))
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
            const file = new File([blob], 'pasted-dtr.png', { type: item.type })
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
      setScanError('Clipboard button disabled on HTTP. Press Ctrl+V anywhere on the page.')
      return
    }
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageTypes = item.types.filter(t => t.startsWith('image/'))
        if (imageTypes.length > 0) {
          const blob = await item.getType(imageTypes[0])
          const file = new File([blob], 'pasted-dtr.png', { type: imageTypes[0] })
          await processImage(file)
          return
        }
      }
      setScanError('No image found in clipboard.')
    } catch {
      setScanError('Could not read clipboard. Please check permissions.')
    }
  }

  // ── DTR Calculations ─────────────────────────────────────────────
  const totalCashCollection  = sumArr(cashTx.map(r => r.amount))
  const totalCashReturns     = sumArr(cashRet.map(r => r.amount))
  const totalOnline          = sumArr(onlineTx.map(r => r.amount))
  const totalCheck           = sumArr(checkRem.map(r => r.amount))
  const totalForColl         = sumArr(forColl.map(r => r.amount))
  const totalRebates         = rebates.reduce((s, r) => s + num(r.amount) * num(r.units), 0)
  const totalOrders          = sumArr(orders.map(r => r.amount))
  const totalExpReceipt      = sumArr(expReceipt.map(r => r.amount))
  const totalExpPurch        = sumArr(expPurch.map(r => r.amount))
  const grandTotalExpenses   = totalExpReceipt + totalExpPurch
  const totalFundReceived    = num(cashOnHand) + num(fundFromHo) + totalCashCollection + totalCashReturns
  const totalCashOnHand      = totalFundReceived - grandTotalExpenses

  // ── Submit handler ───────────────────────────────────────────────
  const handleDtrSubmit = async () => {
    if (!canEditOrSubmit) return
    setSubmitAttempted(true)
    setError(null)
    if (
      cashOnHand.trim() === '' ||
      fundFromHo.trim() === '' ||
      scheduledUnits.trim() === '' ||
      installedUnits.trim() === '' ||
      servicedUnits.trim() === '' ||
      cancelledUnits.trim() === '' ||
      freeInstallUnits.trim() === ''
    ) {
      setError('All numeric input fields (HO Transfers & Cash on Hand, and Unit Summary) require a value. Please enter 0 if there is no amount/count.')
      return
    }
    if (!reviewMode) {
      setReviewStartedAt(new Date())
      setReviewMode(true)
      
      // Scroll to top immediately when user enters checking/review mode
      const mainEl = document.querySelector('main')
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'auto' })
      }
      window.scrollTo({ top: 0, behavior: 'auto' })
      document.documentElement.scrollTo({ top: 0, behavior: 'auto' })
      document.body.scrollTo({ top: 0, behavior: 'auto' })
      
      return
    }
    setSubmitting(true); setError(null)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

      // Build unified items array from all DTR sections
      const dtrItems: object[] = [
        ...cashTx.filter(r => r.name || r.amount).map(r => ({
          type: 'CASH_SALE', description: r.name, amount: parseFloat(r.amount) || 0
        })),
        ...onlineTx.filter(r => r.installer || r.amount).map(r => ({
          type: 'ONLINE_SALE', description: r.installer, customer: r.customer, bank: r.bank, amount: parseFloat(r.amount) || 0
        })),
        ...checkRem.filter(r => r.installer || r.amount).map(r => ({
          type: 'ONLINE_SALE', description: `CHECK|${r.installer}`, customer: r.customer, bank: r.bank, amount: parseFloat(r.amount) || 0
        })),
        ...partsSales.filter(r => r.customer || r.salePrice).map(r => ({
          type: 'CASH_SALE', description: `PARTS|${r.customer}|${r.description}`, amount: parseFloat(r.salePrice) || 0
        })),
        ...expReceipt.filter(r => r.name || r.amount).map(r => ({
          type: 'EXPENSE', description: `${r.name}|${r.description}`, amount: parseFloat(r.amount) || 0
        })),
        ...expPurch.filter(r => r.name || r.amount).map(r => ({
          type: 'PURCHASE', description: `${r.name}|${r.description}`, amount: parseFloat(r.amount) || 0
        })),
        ...orders.filter(r => r.customer || r.amount).map(r => ({
          type: 'PURCHASE', description: `ORDER|${r.customer}|${r.description}`, amount: parseFloat(r.amount) || 0
        })),
        ...rebates.filter(r => r.company || r.amount).map(r => ({
          type: 'REBATE',
          company: r.company,
          units: parseInt(r.units) || 1,
          amount: parseFloat(r.amount) || 0,
          description: `REBATE|${r.raNumber}|${r.hp}`
        })),
      ]

      const payload = {
        id: reportId,
        branchId: selectedBranchId,
        auditLine: selectedAuditLine,
        reportDate,
        receivedBy,
        trNo: trNo.trim() || trNoExample,
        branchName,
        cohPreviousDay: parseFloat(cashOnHand) || 0,
        fundFromHo: parseFloat(fundFromHo) || 0,
        cashReturns: totalCashReturns,
        forCollection: totalForColl,
        rebatesForCollection: totalRebates,
        totalUnitsScheduled: parseInt(scheduledUnits) || 0,
        totalUnitsInstalled: parseInt(installedUnits) || 0,
        totalUnitsServiced: parseInt(servicedUnits) || 0,
        totalUnitsCancelled: parseInt(cancelledUnits) || 0,
        totalUnitsFreeInstall: parseInt(freeInstallUnits) || 0,
        items: dtrItems,
      }

      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setSuccess(true)
      setReviewMode(false)
      setReviewStartedAt(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.')
    } finally { setSubmitting(false) }
  }

  const handleClearForm = () => {
    if (!canEditOrSubmit) return
    const ok = window.confirm('Clear all entered transaction form details for this branch and date?')
    if (!ok) return
    clearForm(true)
  }

  // ── Style helper tokens ──────────────────────────────────────────

  const tableTh = 'px-3 py-1.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider'
  const tableTd = 'px-2 py-1 border-b border-slate-100 dark:border-slate-800/40'
  const flushInput = `w-full bg-transparent border-0 outline-none text-xs py-1 px-1.5 transition-all focus:bg-slate-100/60 dark:focus:bg-slate-800/40 focus:ring-1 focus:ring-emerald-500/20 rounded text-slate-800 dark:text-slate-200 placeholder-slate-400 ${reviewMode ? 'opacity-70 cursor-not-allowed bg-slate-100/30 dark:bg-slate-800/20' : ''}`
  const flushInputNumber = `w-full bg-transparent border-0 outline-none text-xs py-1 px-1.5 text-right transition-all focus:bg-slate-100/60 dark:focus:bg-slate-800/40 focus:ring-1 focus:ring-emerald-500/20 rounded font-semibold text-slate-800 dark:text-slate-200 placeholder-slate-400 ${reviewMode ? 'opacity-70 cursor-not-allowed bg-slate-100/30 dark:bg-slate-800/20' : ''}`

  const SectionHeader = ({ label, total }: { label: string; total?: number }) => (
    <div className="px-3 py-2 flex items-center justify-between gap-2 bg-slate-100/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">{label}</span>
      {total !== undefined && (
        <span className="text-xs font-black tabular-nums" style={{ color: '#10B981' }}>
          ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )}
    </div>
  )

  const AddRowBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button onClick={onClick} className="flex items-center gap-1 text-[11px] font-bold mt-1.5 mb-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 transition-colors self-start ml-2">
      <Plus className="w-3 h-3" /> {label}
    </button>
  )

  const DelBtn = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors shrink-0">
      <Trash2 className="w-3 h-3" />
    </button>
  )

  // ── Success screen ───────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
          <Check className="w-10 h-10" style={{ color: '#10B981' }} />
        </div>
        <h2 className="text-2xl font-black" style={{ color: textPrimary }}>Report Submitted!</h2>
        <p className="text-sm" style={{ color: textMuted }}>Your daily report has been recorded successfully.</p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              clearForm(true)
              setSuccess(false)
            }}
            className="px-5 py-2.5 rounded-xl text-sm font-bold border transition-all hover:scale-105"
            style={{ borderColor: border, color: textMuted }}
          >
            Submit Another
          </button>
          <a
            href="/audit-report"
            className="px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:scale-105"
            style={{ backgroundColor: '#10B981' }}
          >
            View Branch Performance
          </a>
        </div>
      </div>
    )
  }

  // ── Main Render ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 pb-10 max-w-6xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="rounded-xl p-4 md:p-6 relative overflow-hidden bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-[0.03] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #10B981, transparent)' }} />
        <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5 text-emerald-600 dark:text-emerald-400">Branch Daily Report</p>
        <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
          {reportId ? 'Edit Daily Report' : 'Branch Daily Report'}
        </h2>
        <p className="text-xs" style={{ color: textMuted }}>ASHCOL Airconditioning Corporation — Daily Report</p>
      </div>

      {reviewMode && (
        <div className="rounded-xl p-4 flex items-center gap-3 bg-amber-500/5 border border-amber-500/20">
          <Receipt className="w-5 h-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-600 dark:text-amber-400">
            <strong>Review Mode:</strong> Please double-check all details below. All fields are locked. Scroll down and click <strong>Confirm & Submit</strong> to record the report, or <strong>Go Back & Edit</strong> to make adjustments.
          </p>
        </div>
      )}

      {!canSubmit && (
        <div className="rounded-xl p-4 flex items-center gap-3 bg-red-500/5 border border-red-500/20">
          <Receipt className="w-5 h-5 shrink-0 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">
            <strong>Read Only:</strong> Only Managers and Staff can submit daily branch reports.
          </p>
        </div>
      )}

      {!!reportId && !isAdmin && (
        <div className="rounded-xl p-4 flex items-center gap-3 bg-amber-500/5 border border-amber-500/20">
          <Receipt className="w-5 h-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-600 dark:text-amber-400">
            <strong>Uploaded Report:</strong> This report has been submitted and is final. Editing is disabled.
          </p>
        </div>
      )}

      {/* ── Metadata Header ─────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Report Date</label>
            <input
              id="report-date-input"
              type="date"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              disabled={isFormDisabled}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prepared By</label>
            <input
              id="received-by-input"
              type="text"
              placeholder="Name"
              value={receivedBy}
              onChange={e => setReceivedBy(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              disabled={isFormDisabled}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TR No.</label>
            <input
              id="tr-no-input"
              type="text"
              placeholder={`e.g. ${trNoExample}`}
              value={trNo}
              readOnly={true}
              className="w-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 focus:outline-none cursor-not-allowed"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Branch</label>
            {canEditOrSubmit ? (
              <select
                id="branch-select"
                value={`${selectedBranchId}-${selectedAuditLine || ''}`}
                onChange={e => {
                  const val = e.target.value
                  const found = branchesList.find(b => `${b.id}-${b.auditLine || ''}` === val)
                  if (found) {
                    setSelectedBranchId(found.id)
                    setSelectedAuditLine(found.auditLine || null)
                    setBranch(found.name)
                    
                    if (isAdmin) {
                      let gId = found.id
                      if (found.id === 'BR-TAGUIG-SALES') {
                        if (found.auditLine === 'TAGUIG_SERVICE') {
                          gId = 'BR-TAGUIG-SALES-services'
                        } else {
                          gId = 'BR-TAGUIG-SALES-sales'
                        }
                      }
                      localStorage.setItem('ashcol-global-branch-id', gId)
                      window.dispatchEvent(new Event('ashcol-global-branch-change'))
                    }
                  }
                }}
                className="w-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 focus:outline-none cursor-not-allowed"
                disabled={true}
              >
                {branchesList.map(b => (
                  <option key={`${b.id}-${b.auditLine || ''}`} value={`${b.id}-${b.auditLine || ''}`}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="branch-name-input"
                type="text"
                value={branchName}
                readOnly
                className="w-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 focus:outline-none"
              />
            )}
          </div>
        </div>
      </div>

      {/* ── DTR Scanner Actions ──────────────────────────────────────── */}
      {canEditOrSubmit && !reviewMode && (
        <div className="rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
              <Scan size={18} style={{ color: '#3B82F6' }} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Auto-Fill from DTR Document</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Upload or paste an image of your DTR receipt</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={scanning}
              onClick={handlePasteClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 disabled:opacity-50"
            >
              <ClipboardPaste size={14} /> Paste
            </button>
            <button
              disabled={scanning}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 text-white bg-blue-500 disabled:opacity-50"
            >
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <Scan size={14} />} 
              {scanning ? 'Scanning...' : 'Upload Image'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleScanImage} />
          </div>
        </div>
      )}
      
      {scanError && (
        <div className="rounded-xl p-3 flex items-start gap-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30">
          <p className="text-xs text-red-600 dark:text-red-400">{scanError}</p>
        </div>
      )}

      {/* ── Two-Column Layout for Sections ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-4">

          {/* Cash Transactions */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Cash Transactions" total={totalCashCollection} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Name (Installer/Technician)</th>
                    <th className={tableTh + ' text-right w-32'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {cashTx.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Name" value={row.name}
                          onChange={e => setCashTx(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                          list="tech-suggestions"
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setCashTx(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setCashTx(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setCashTx(p => [...p, mkCash()])} label="Add row" />}
            </div>
          </div>

          {/* Cash Returns */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Cash Returns" total={totalCashReturns} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Name (Installer/Technician/Driver)</th>
                    <th className={tableTh + ' text-right w-32'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {cashRet.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Name" value={row.name}
                          onChange={e => {
                            const val = e.target.value
                            const matched = refundablePurchases.find(p => getRefundOptionText(p) === val)
                            if (matched) {
                              const worker = getWorkerName(matched)
                              const refundAmt = String((matched.amount - matched.actualAmount).toFixed(2))
                              setCashRet(p => p.map(r => r.id === row.id ? { ...r, name: worker, amount: refundAmt } : r))
                            } else {
                              setCashRet(p => p.map(r => r.id === row.id ? { ...r, name: val } : r))
                            }
                          }}
                          list="cash-return-suggestions"
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setCashRet(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setCashRet(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setCashRet(p => [...p, mkRet()])} label="Add row" />}
            </div>
          </div>

          {/* Fund Transfer from HO */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="HO Transfers & Cash on Hand" />
            <div className="p-2">
              <table className="w-full text-left border-collapse text-xs">
                <tbody>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Fund Transfer from HO</td>
                    <td className="px-2 py-1 text-right w-36">
                      <NumericFormat
                        thousandSeparator=","
                        decimalScale={2}
                        fixedDecimalScale={true}
                        allowNegative={false}
                        placeholder="0.00"
                        value={fundFromHo}
                        onValueChange={(values) => setFundFromHo(values.value)}
                        className={`${flushInputNumber} ${submitAttempted && fundFromHo.trim() === '' ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
                        disabled={isFormDisabled}
                      />
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Cash on Hand (Previous Day)</td>
                    <td className="px-2 py-1 text-right w-36">
                      <NumericFormat
                        thousandSeparator=","
                        decimalScale={2}
                        fixedDecimalScale={true}
                        allowNegative={false}
                        placeholder="0.00"
                        value={cashOnHand}
                        onValueChange={(values) => setCashOnHand(values.value)}
                        className={`${flushInputNumber} ${submitAttempted && cashOnHand.trim() === '' ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
                        disabled={isFormDisabled}
                      />
                    </td>
                  </tr>
                  <tr className="bg-slate-50 dark:bg-slate-900/40 font-bold">
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">Total Fund</td>
                    <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                      {php(num(cashOnHand) + num(fundFromHo))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Online Transactions */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Online Transactions" total={totalOnline} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Installer</th>
                    <th className={tableTh}>Customer Name</th>
                    <th className={tableTh + ' w-24'}>Bank</th>
                    <th className={tableTh + ' text-right w-24'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {onlineTx.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Installer" value={row.installer}
                          onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Bank" value={row.bank}
                          onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, bank: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setOnlineTx(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setOnlineTx(p => [...p, mkOnl()])} label="Add row" />}
            </div>
          </div>

          {/* Check Remits */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Check Remits" total={totalCheck} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Installer</th>
                    <th className={tableTh}>Customer Name</th>
                    <th className={tableTh + ' w-24'}>Bank</th>
                    <th className={tableTh + ' text-right w-24'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {checkRem.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Installer" value={row.installer}
                          onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Bank" value={row.bank}
                          onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, bank: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setCheckRem(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setCheckRem(p => [...p, mkChk()])} label="Add row" />}
            </div>
          </div>

          {/* Parts Sales / Unit Sales */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Parts Sales / Unit Sales" total={sumArr(partsSales.map(r => r.salePrice))} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-24'}>Capital</th>
                    <th className={tableTh + ' text-right w-24'}>Sale Price</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {partsSales.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.capital} 
                          onValueChange={(values) => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, capital: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.salePrice} 
                          onValueChange={(values) => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, salePrice: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setPartsSales(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setPartsSales(p => [...p, mkPart()])} label="Add row" />}
            </div>
          </div>

          {/* For Collection */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="For Collection" total={totalForColl} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Installer</th>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {forColl.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Installer" value={row.installer}
                          onChange={e => setForColl(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setForColl(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setForColl(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setForColl(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setForColl(p => [...p, mkColl()])} label="Add row" />}
            </div>
          </div>

          {/* Rebates for Collection */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Rebates for Collection" total={totalRebates} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Company</th>
                    <th className={tableTh}>Brand</th>
                    <th className={tableTh + ' w-16'}>HP</th>
                    <th className={tableTh + ' text-right w-24'}>Rate</th>
                    <th className={tableTh + ' text-center w-16'}>Units</th>
                    <th className={tableTh + ' text-right w-24'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-8'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {rebates.map(row => {
                    const calc = num(row.amount) * num(row.units)
                    return (
                      <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                        <td className={tableTd}>
                          <input type="text" placeholder="ROBINSONS" value={row.raNumber}
                            onChange={e => setRebates(p => p.map(r => r.id === row.id ? { ...r, raNumber: e.target.value } : r))}
                            className={flushInput} disabled={isFormDisabled} />
                        </td>
                        <td className={tableTd}>
                          <input type="text" placeholder="MIDEA" value={row.company}
                            onChange={e => setRebates(p => p.map(r => r.id === row.id ? { ...r, company: e.target.value } : r))}
                            className={flushInput} disabled={isFormDisabled} />
                        </td>
                        <td className={tableTd}>
                          <input type="text" placeholder="1.5HP" value={row.hp}
                            onChange={e => setRebates(p => p.map(r => r.id === row.id ? { ...r, hp: e.target.value } : r))}
                            className={flushInput} disabled={isFormDisabled} />
                        </td>
                        <td className={tableTd}>
                          <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                            onValueChange={(values) => setRebates(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                            className={flushInputNumber} disabled={isFormDisabled} />
                        </td>
                        <td className={tableTd}>
                          <NumericFormat thousandSeparator="," decimalScale={0} fixedDecimalScale={false} allowNegative={false} placeholder="0" value={row.units} min="0"
                            onValueChange={(values) => setRebates(p => p.map(r => r.id === row.id ? { ...r, units: values.value } : r))}
                            className="w-full bg-transparent border-0 outline-none text-xs py-1 px-1.5 text-center transition-all focus:bg-slate-100/60 dark:focus:bg-slate-800/40 focus:ring-1 focus:ring-emerald-500/20 rounded font-semibold text-slate-800 dark:text-slate-200" disabled={isFormDisabled} />
                        </td>
                        <td className={tableTd + ' text-right font-bold text-slate-700 dark:text-slate-300 pr-2 text-xs'}>
                          {php(calc)}
                        </td>
                        {canSubmit && !reviewMode && (
                          <td className={tableTd + ' text-center'}>
                            <DelBtn onClick={() => setRebates(p => p.filter(r => r.id !== row.id))} />
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setRebates(p => [...p, mkReb()])} label="Add row" />}
            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="flex flex-col gap-4">

          {/* Parts Order / Units Order */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Parts Order / Units Order" total={totalOrders} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setOrders(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setOrders(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setOrders(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setOrders(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setOrders(p => [...p, mkOrd()])} label="Add row" />}
            </div>
          </div>

          {/* Expenses with Receipts */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Expenses with Receipts" total={totalExpReceipt} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Name</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {expReceipt.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Name" value={row.name}
                          onChange={e => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setExpReceipt(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setExpReceipt(p => [...p, mkExp()])} label="Add row" />}
            </div>
          </div>

          {/* Expenses for Purchase */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Expenses for Purchase" total={totalExpPurch} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Name</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {expPurch.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Name" value={row.name}
                          onChange={e => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setExpPurch(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setExpPurch(p => [...p, mkExp()])} label="Add row" />}
            </div>
          </div>

          {/* Unit Summary */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Unit Summary" />
            <div className="p-3">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center w-28">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    { label: 'Total Scheduled Units',   value: scheduledUnits,   setter: setScheduledUnits },
                    { label: 'Total Installed Units',   value: installedUnits,   setter: setInstalledUnits },
                    { label: 'Total Serviced Units',    value: servicedUnits,    setter: setServicedUnits },
                    { label: 'Total Cancelled',         value: cancelledUnits,   setter: setCancelledUnits },
                    { label: 'Total Free Install',      value: freeInstallUnits, setter: setFreeInstallUnits },
                  ] as { label: string; value: string; setter: (v: string) => void }[]).map(({ label, value, setter }) => (
                    <tr key={label} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className="px-3 py-1.5 font-medium text-slate-600 dark:text-slate-400">{label}</td>
                      <td className="px-3 py-1 text-center w-28">
                        <NumericFormat
                          thousandSeparator={false}
                          decimalScale={0}
                          fixedDecimalScale={false}
                          allowNegative={false}
                          placeholder="0"
                          value={value}
                          onValueChange={(values) => setter(values.value)}
                          className={`w-20 bg-slate-50 dark:bg-slate-900 border text-center text-xs font-bold rounded focus:outline-none py-0.5 px-2 text-slate-800 dark:text-slate-200 ${submitAttempted && value.trim() === '' ? 'border-red-500 ring-2 ring-red-500/20' : 'border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-emerald-500/30'}`}
                          disabled={isFormDisabled}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Final Summary */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Final Summary" />
            <div className="p-3">
              <table className="w-full text-left border-collapse text-xs">
                <tbody>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Grand Total Expenses</td>
                    <td className="px-3 py-2 text-right font-bold text-red-500">{php(grandTotalExpenses)}</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Total Fund Received</td>
                    <td className="px-3 py-2 text-right font-bold text-cyan-600 dark:text-cyan-400">{php(totalFundReceived)}</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Grand Total Expenses</td>
                    <td className="px-3 py-2 text-right font-bold text-red-500">{php(grandTotalExpenses)}</td>
                  </tr>
                  <tr className="bg-slate-50 dark:bg-slate-900/40 font-bold">
                    <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200 font-bold text-sm">Total Cash on Hand / Deposit</td>
                    <td className="px-3 py-2.5 text-right text-base text-emerald-600 dark:text-emerald-400 font-black">
                      {php(totalCashOnHand)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {(branchName || 'No branch selected').toUpperCase()} - {formatReviewDateTime(reviewStartedAt || new Date())}
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 bg-red-500/5 border border-red-500/20">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Submit Button */}
      {canSubmit && (
        reviewMode ? (
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                setReviewMode(false)
                setReviewStartedAt(null)
              }}
              disabled={submitting}
              className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-[1.01] disabled:opacity-60"
              style={{ border: '1px solid rgba(100,116,139,0.3)', color: textMuted, backgroundColor: isLight ? '#f8fafc' : '#0f172a' }}
            >
              Go Back & Edit
            </button>
            <button
              id="confirm-submit-dtr-btn"
              onClick={handleDtrSubmit}
              disabled={submitting}
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-[1.01] hover:shadow-lg disabled:opacity-60"
              style={{ backgroundColor: '#10B981', boxShadow: '0 4px 14px rgba(16,185,129,0.2)' }}
            >
              {submitting ? <>Submitting...</> : <><Check className="w-4 h-4" /> Confirm & Submit</>}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 mt-2">
            <button
              type="button"
              onClick={handleClearForm}
              disabled={submitting}
              className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-[1.01] disabled:opacity-60"
              style={{ border: '1px solid rgba(239,68,68,0.28)', color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.06)' }}
            >
              <Trash2 className="w-4 h-4" /> Clear Form
            </button>
            <button
              id="submit-dtr-btn"
              onClick={handleDtrSubmit}
              disabled={submitting}
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-[1.01] hover:shadow-lg disabled:opacity-60"
              style={{ backgroundColor: '#10B981', boxShadow: '0 4px 14px rgba(16,185,129,0.2)' }}
            >
              {submitting ? <>Submitting...</> : <><Send className="w-4 h-4" /> Submit Daily Report</>}
            </button>
          </div>
        )
      )}

      {/* Autocomplete Datalist */}
      <datalist id="tech-suggestions">
        {techSuggestions.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* Cash Return Autocomplete Datalist */}
      <datalist id="cash-return-suggestions">
        {techSuggestions.map(name => (
          <option key={name} value={name} />
        ))}
        {refundablePurchases.map(p => {
          const optionText = getRefundOptionText(p)
          return <option key={p.id} value={optionText} />
        })}
      </datalist>

    </div>
  )
}
