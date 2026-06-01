import { useState, useEffect, useRef } from 'react'
import { NumericFormat } from 'react-number-format'
import { Plus, Trash2, Check, Receipt, Send, Scan, ClipboardPaste, Loader2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface Denomination {
  label: string
  value: number
  qty: string
}

// DTR-specific row types
interface CashTxRow    { id: string; name: string; amount: string }
interface CashRetRow   { id: string; name: string; amount: string }
interface OnlineTxRow  { id: string; installer: string; customer: string; bank: string; amount: string }
interface CheckRow     { id: string; installer: string; customer: string; bank: string; amount: string }
interface PartsSaleRow { id: string; customer: string; description: string; capital: string; salePrice: string }
interface ForCollRow   { id: string; installer: string; customer: string; amount: string }
interface RebateRow    { id: string; company: string; amount: string; units: string; total: string }
interface OrderRow     { id: string; customer: string; description: string; amount: string }
interface ExpenseRow   { id: string; name: string; description: string; amount: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2)

const DENOMS: Denomination[] = [
  { label: '₱1,000', value: 1000, qty: '' },
  { label: '₱500',   value: 500,  qty: '' },
  { label: '₱200',   value: 200,  qty: '' },
  { label: '₱100',   value: 100,  qty: '' },
  { label: '₱50',    value: 50,   qty: '' },
  { label: '₱20',    value: 20,   qty: '' },
  { label: '₱10',    value: 10,   qty: '' },
  { label: '₱5',     value: 5,    qty: '' },
  { label: '₱1',     value: 1,    qty: '' },
]

const php = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const num = (s: string) => parseFloat(s) || 0
const sumArr = (arr: string[]) => arr.reduce((a, b) => a + num(b), 0)
const normalizeTransactionBranch = (branchId?: string | null, email?: string | null) => {
  const raw = branchId || ''
  const lower = raw.toLowerCase()
  const emailLower = (email || '').toLowerCase()
  if (lower === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') {
    const isServices = emailLower.includes('service')
    return {
      branchId: raw,
      auditLine: isServices ? 'TAGUIG_SERVICE' : 'TAGUIG_SALES',
      branchName: isServices ? 'TAGUIG SERVICES' : 'TAGUIG SALES',
    }
  }
  if (/-services$/i.test(raw)) {
    return {
      branchId: raw.replace(/-services$/i, ''),
      auditLine: 'TAGUIG_SERVICE',
      branchName: 'TAGUIG SERVICES',
    }
  }
  if (/-sales$/i.test(raw)) {
    return {
      branchId: raw.replace(/-sales$/i, ''),
      auditLine: 'TAGUIG_SALES',
      branchName: 'TAGUIG SALES',
    }
  }
  return { branchId: raw, auditLine: null as string | null, branchName: '' }
}

const mkCash = (): CashTxRow   => ({ id: uid(), name: '', amount: '' })
const mkRet  = (): CashRetRow  => ({ id: uid(), name: '', amount: '' })
const mkOnl  = (): OnlineTxRow => ({ id: uid(), installer: '', customer: '', bank: '', amount: '' })
const mkChk  = (): CheckRow    => ({ id: uid(), installer: '', customer: '', bank: '', amount: '' })
const mkPart = (): PartsSaleRow => ({ id: uid(), customer: '', description: '', capital: '', salePrice: '' })
const mkColl = (): ForCollRow  => ({ id: uid(), installer: '', customer: '', amount: '' })
const mkReb  = (): RebateRow   => ({ id: uid(), company: '', amount: '', units: '', total: '' })
const mkOrd  = (): OrderRow    => ({ id: uid(), customer: '', description: '', amount: '' })
const mkExp  = (): ExpenseRow  => ({ id: uid(), name: '', description: '', amount: '' })

// ── Component ────────────────────────────────────────────────────────────────

export default function DailySalesForm() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'

  const role = (user?.role || '').toLowerCase()
  const canSubmit = role === 'manager' || role === 'staff' || role === 'admin' || role === 'employee'
  const isAdmin = role === 'admin'

  const today = new Date().toISOString().split('T')[0]

  const emailLower = (user?.email || '').toLowerCase()
  const normalizedAssignedBranch = normalizeTransactionBranch(user?.branchId, emailLower)
  
  const initialBranchId = normalizedAssignedBranch.branchId
  const initialAuditLine = normalizedAssignedBranch.auditLine
  const initialBranchName = normalizedAssignedBranch.branchName

  // ── Form State ───────────────────────────────────────────────────
  const [reportDate, setReportDate] = useState(today)
  const [receivedBy, setReceivedBy] = useState(user?.name || '')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const [scanning, setScanning]     = useState(false)
  const [scanError, setScanError]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [trNo, setTrNo]         = useState('')
  const [branchName, setBranch] = useState(initialBranchName)
  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId)
  const [selectedAuditLine, setSelectedAuditLine] = useState<string | null>(initialAuditLine)
  const [branchesList, setBranchesList] = useState<{ id: string; name: string; auditLine?: string }[]>([])

  useEffect(() => {
    if (!isAdmin) return
    const loadBranchesList = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/branches`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          const list = (data?.data || data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))
          const newList: { id: string; name: string; auditLine?: string }[] = []
          for (const b of list) {
            const cleanName = b.name.replace(/^(ashcol\s+)/i, '').toUpperCase()
            if (cleanName === 'TAGUIG' || cleanName === 'ASHCOL TAGUIG') {
              newList.push({ id: b.id, name: 'TAGUIG SALES', auditLine: 'TAGUIG_SALES' })
              newList.push({ id: b.id, name: 'TAGUIG SERVICES', auditLine: 'TAGUIG_SERVICE' })
            } else {
              newList.push({ id: b.id, name: cleanName })
            }
          }
          newList.sort((a, b) => a.name.localeCompare(b.name))
          setBranchesList(newList)
          if (newList.length > 0) {
            setSelectedBranchId(newList[0].id)
            setSelectedAuditLine(newList[0].auditLine || null)
            setBranch(newList[0].name)
          }
        }
      } catch (err) {
        console.error('Error loading branches list:', err)
      }
    }
    loadBranchesList()
  }, [isAdmin])

  // I. Cash Transactions
  const [cashTx, setCashTx]     = useState<CashTxRow[]>([mkCash()])
  // II. Cash Returns
  const [cashRet, setCashRet]   = useState<CashRetRow[]>([mkRet()])
  // III. Fund Transfer from HO
  const [cashOnHand, setCashOnHand]     = useState('')
  const [fundFromHo, setFundFromHo]     = useState('')
  // IV. Online Transactions
  const [onlineTx, setOnlineTx]         = useState<OnlineTxRow[]>([mkOnl()])
  // V. Check Remits
  const [checkRem, setCheckRem]         = useState<CheckRow[]>([mkChk()])
  // VI. Parts Sales / Unit Sales
  const [partsSales, setPartsSales]     = useState<PartsSaleRow[]>([mkPart()])
  // VII. For Collection
  const [forColl, setForColl]           = useState<ForCollRow[]>([mkColl()])
  // VIII. Estimate Rebates
  const [rebates, setRebates]           = useState<RebateRow[]>([mkReb()])
  // IX. Parts Order / Units Order
  const [orders, setOrders]             = useState<OrderRow[]>([mkOrd()])
  // X. Expenses with Receipts
  const [expReceipt, setExpReceipt]     = useState<ExpenseRow[]>([mkExp()])
  // XI. Expenses for Purchase
  const [expPurch, setExpPurch]         = useState<ExpenseRow[]>([mkExp()])
  // XIII. Cash Breakdown (denominations grid)
  const [dtrDenoms, setDtrDenoms]       = useState<Denomination[]>(DENOMS.map(d => ({ ...d })))

  // ── Auto Prefill & Suggestions Hook ──────────────────────────────
  const [techSuggestions, setTechSuggestions] = useState<string[]>([])

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
          if (myRow && myRow.totalCohCfd !== undefined) {
            setCashOnHand(String(myRow.totalCohCfd))
          } else {
            setCashOnHand('')
          }
        } else {
          setCashOnHand('')
        }

        // 3. Fetch lineup, service reports, and branch employees to collect technician names
        const lineupQueryBranchId = selectedAuditLine
          ? `${selectedBranchId}-${selectedAuditLine === 'TAGUIG_SERVICE' ? 'services' : 'sales'}`
          : selectedBranchId

        const [resLineup, resService, resEmployees] = await Promise.all([
          fetch(`${API_BASE_URL}/v1/lineup?date=${reportDate}&branchId=${lineupQueryBranchId}`, { headers }),
          fetch(`${API_BASE_URL}/v1/service-reports?date=${reportDate}&branchId=${selectedBranchId}`, { headers }),
          fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers })
        ])

        const namesSet = new Set<string>()

        // Process lineup
        if (resLineup.ok) {
          const list = await resLineup.json()
          list.forEach((r: any) => {
            if (r.installerName?.trim()) namesSet.add(r.installerName.trim())
            if (r.driverName?.trim()) namesSet.add(r.driverName.trim())
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
                const cleaned = n.trim()
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
              namesSet.add(emp.name.trim())
            }
          })
        }

        const uniqueNames = Array.from(namesSet).sort()
        setTechSuggestions(uniqueNames)

        // Only pre-fill Section I if it contains exactly one row and that row is completely blank
        setCashTx(current => {
          const isBlank = current.length === 1 && !current[0].name && !current[0].amount
          if (isBlank && uniqueNames.length > 0) {
            return uniqueNames.map(name => ({ id: uid(), name, amount: '' }))
          }
          return current
        })

      } catch (err) {
        console.error('Error pre-filling data:', err)
      }
    }

    loadData()
  }, [reportDate, selectedBranchId, selectedAuditLine, isAdmin])

  // Generate TR No suggestion based on branch initials and date
  useEffect(() => {
    if (branchName) {
      const cleanBranch = branchName.toUpperCase().replace('ASHCOL', '').trim()
      const words = cleanBranch.split(' ')
      const initials = words.map(w => w[0]).join('')
      const dateObj = new Date(reportDate)
      const month = String(dateObj.getMonth() + 1).padStart(2, '0')
      const day = String(dateObj.getDate()).padStart(2, '0')
      
      setTrNo(current => {
        if (!current) {
          return `${initials || 'TR'}-${month}${day}`
        }
        return current
      })
    }
  }, [branchName, reportDate])

  // ── DTR Scanner Logic ────────────────────────────────────────────
  const processImage = async (file: File) => {
    setScanning(true)
    setScanError(null)

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
    if (data.cohPreviousDay != null) setCashOnHand(String(data.cohPreviousDay))
    if (data.fundFromHo != null) setFundFromHo(String(data.fundFromHo))

    if (data.cashTransactions && Array.isArray(data.cashTransactions) && data.cashTransactions.length > 0) {
      setCashTx(data.cashTransactions.map((item: any) => ({ id: uid(), name: item.name || '', amount: item.amount ? String(item.amount) : '' })))
    } else if (data.totalCashCollection) {
      setCashTx([{ id: uid(), name: 'Scanned Cash Collection', amount: String(data.totalCashCollection) }])
    }

    if (data.cashReturns) setCashRet([{ id: uid(), name: 'Scanned Cash Returns', amount: String(data.cashReturns) }])

    if (data.onlineTransactions && Array.isArray(data.onlineTransactions) && data.onlineTransactions.length > 0) {
      setOnlineTx(data.onlineTransactions.map((item: any) => ({ id: uid(), installer: item.installer || '', customer: item.customer || '', bank: item.bank || '', amount: item.amount ? String(item.amount) : '' })))
    } else if (data.totalOnlineCollection) {
      setOnlineTx([{ id: uid(), installer: 'Scanned Online', customer: '', bank: '', amount: String(data.totalOnlineCollection) }])
    }

    if (data.forCollection) setForColl([{ id: uid(), installer: 'Scanned For Collection', customer: '', amount: String(data.forCollection) }])

    if (data.rebates && Array.isArray(data.rebates) && data.rebates.length > 0) {
      setRebates(data.rebates.map((item: any) => ({ id: uid(), company: item.company || '', units: String(item.units || '1'), amount: item.amount ? String(item.amount) : '', total: item.amount ? String(item.amount) : '' })))
    } else if (data.rebatesForCollection) {
      setRebates([{ id: uid(), company: 'Scanned Rebates', units: '1', amount: String(data.rebatesForCollection), total: String(data.rebatesForCollection) }])
    }

    if (data.expReceipt && Array.isArray(data.expReceipt) && data.expReceipt.length > 0) {
      setExpReceipt(data.expReceipt.map((item: any) => ({ id: uid(), name: item.name || '', description: item.description || '', amount: item.amount ? String(item.amount) : '' })))
    } else if (data.totalExpenses) {
      setExpReceipt([{ id: uid(), name: 'Scanned Expenses', description: '', amount: String(data.totalExpenses) }])
    }

    if (data.expPurch && Array.isArray(data.expPurch) && data.expPurch.length > 0) {
      setExpPurch(data.expPurch.map((item: any) => ({ id: uid(), name: item.name || '', description: item.description || '', amount: item.amount ? String(item.amount) : '' })))
    }

    if (data.cashBreakdown && Array.isArray(data.cashBreakdown)) {
      setDtrDenoms(prev => prev.map(d => {
        const found = data.cashBreakdown.find((cb: any) => cb.label === d.label)
        return found ? { ...d, qty: String(found.qty) } : d
      }))
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
  const dtrCashFromDenoms    = dtrDenoms.reduce((s, d) => s + (parseInt(d.qty) || 0) * d.value, 0)
  const totalCashOnHand      = totalFundReceived - grandTotalExpenses

  // ── Submit handler ───────────────────────────────────────────────

  const handleDtrSubmit = async () => {
    if (!canSubmit) return
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
      ]

      const payload = {
        branchId: selectedBranchId,
        auditLine: selectedAuditLine,
        reportDate,
        receivedBy,
        trNo,
        branchName,
        cohPreviousDay: parseFloat(cashOnHand) || 0,
        fundFromHo: parseFloat(fundFromHo) || 0,
        cashReturns: totalCashReturns,
        forCollection: totalForColl,
        rebatesForCollection: totalRebates,
        cashBreakdownJson: JSON.stringify(dtrDenoms.map(d => ({ label: d.label, value: d.value, qty: parseInt(d.qty) || 0 }))),
        items: dtrItems,
      }

      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setSuccess(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.')
    } finally { setSubmitting(false) }
  }

  const handleClearForm = () => {
    if (!canSubmit) return
    const ok = window.confirm('Clear all entered transaction form details for this branch and date?')
    if (!ok) return

    setError(null)
    setScanError(null)
    setSuccess(false)
    setTrNo('')
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
    setDtrDenoms(DENOMS.map(d => ({ ...d })))
  }

  // ── Style helper tokens ──────────────────────────────────────────

  const tableTh = 'px-3 py-1.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider'
  const tableTd = 'px-2 py-1 border-b border-slate-100 dark:border-slate-800/40'
  const flushInput = 'w-full bg-transparent border-0 outline-none text-xs py-1 px-1.5 transition-all focus:bg-slate-100/60 dark:focus:bg-slate-800/40 focus:ring-1 focus:ring-emerald-500/20 rounded text-slate-800 dark:text-slate-200 placeholder-slate-400'
  const flushInputNumber = 'w-full bg-transparent border-0 outline-none text-xs py-1 px-1.5 text-right transition-all focus:bg-slate-100/60 dark:focus:bg-slate-800/40 focus:ring-1 focus:ring-emerald-500/20 rounded font-semibold text-slate-800 dark:text-slate-200 placeholder-slate-400'

  const SectionHeader = ({ label, total }: { label: string; total?: number }) => (
    <div className="px-3 py-2 flex items-center gap-2 bg-slate-100/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">{label}</span>
      {total !== undefined && (
        <span className="ml-auto text-xs font-bold text-emerald-600 dark:text-emerald-400">{php(total)}</span>
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
        <p className="text-sm" style={{ color: textMuted }}>Your transaction report has been recorded successfully.</p>
        <div className="flex gap-3">
          <button
            onClick={() => setSuccess(false)}
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
        <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5 text-emerald-600 dark:text-emerald-400">Branch Transaction Form</p>
        <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
          Branch Transaction Report
        </h2>
        <p className="text-xs" style={{ color: textMuted }}>ASHCOL Airconditioning Corporation — Daily Transactions Report</p>
      </div>

      {!canSubmit && (
        <div className="rounded-xl p-4 flex items-center gap-3 bg-red-500/5 border border-red-500/20">
          <Receipt className="w-5 h-5 shrink-0 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">
            <strong>Read Only:</strong> Only Managers and Staff can submit daily branch reports.
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
              disabled={!canSubmit}
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
              disabled={!canSubmit}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TR No.</label>
            <input
              id="tr-no-input"
              type="text"
              placeholder="e.g. HO-0002"
              value={trNo}
              onChange={e => setTrNo(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              disabled={!canSubmit}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Branch</label>
            {isAdmin ? (
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
                  }
                }}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 cursor-pointer"
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
      {canSubmit && (
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

          {/* I. Cash Transactions */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="I. Cash Transactions" total={totalCashCollection} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Name (Installer/Technician)</th>
                    <th className={tableTh + ' text-right w-32'}>Amount</th>
                    {canSubmit && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {cashTx.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Name" value={row.name}
                          onChange={e => setCashTx(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                          list="tech-suggestions"
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setCashTx(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={!canSubmit} />
                      </td>
                      {canSubmit && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setCashTx(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && <AddRowBtn onClick={() => setCashTx(p => [...p, mkCash()])} label="Add row" />}
            </div>
          </div>

          {/* II. Cash Returns */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="II. Cash Returns (Change from Purchases)" total={totalCashReturns} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Name (Installer/Technician/Driver)</th>
                    <th className={tableTh + ' text-right w-32'}>Amount</th>
                    {canSubmit && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {cashRet.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Name" value={row.name}
                          onChange={e => setCashRet(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                          list="tech-suggestions"
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setCashRet(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={!canSubmit} />
                      </td>
                      {canSubmit && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setCashRet(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && <AddRowBtn onClick={() => setCashRet(p => [...p, mkRet()])} label="Add row" />}
            </div>
          </div>

          {/* III. Fund Transfer from HO */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="III. Fund Transfer from HO" />
            <div className="p-2">
              <table className="w-full text-left border-collapse text-xs">
                <tbody>
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
                        className={flushInputNumber}
                        disabled={!canSubmit}
                      />
                    </td>
                  </tr>
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
                        className={flushInputNumber}
                        disabled={!canSubmit}
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

          {/* IV. Online Transactions */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="IV. Online Transactions" total={totalOnline} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Installer</th>
                    <th className={tableTh}>Customer Name</th>
                    <th className={tableTh + ' w-24'}>Bank</th>
                    <th className={tableTh + ' text-right w-24'}>Amount</th>
                    {canSubmit && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {onlineTx.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Installer" value={row.installer}
                          onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Bank" value={row.bank}
                          onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, bank: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={!canSubmit} />
                      </td>
                      {canSubmit && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setOnlineTx(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && <AddRowBtn onClick={() => setOnlineTx(p => [...p, mkOnl()])} label="Add row" />}
            </div>
          </div>

          {/* V. Check Remits */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="V. Check Remits" total={totalCheck} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Installer</th>
                    <th className={tableTh}>Customer Name</th>
                    <th className={tableTh + ' w-24'}>Bank</th>
                    <th className={tableTh + ' text-right w-24'}>Amount</th>
                    {canSubmit && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {checkRem.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Installer" value={row.installer}
                          onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Bank" value={row.bank}
                          onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, bank: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={!canSubmit} />
                      </td>
                      {canSubmit && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setCheckRem(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && <AddRowBtn onClick={() => setCheckRem(p => [...p, mkChk()])} label="Add row" />}
            </div>
          </div>

          {/* VI. Parts Sales / Unit Sales */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="VI. Parts Sales / Unit Sales" total={sumArr(partsSales.map(r => r.salePrice))} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-24'}>Capital</th>
                    <th className={tableTh + ' text-right w-24'}>Sale Price</th>
                    {canSubmit && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {partsSales.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.capital} 
                          onValueChange={(values) => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, capital: values.value } : r))}
                          className={flushInputNumber} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.salePrice} 
                          onValueChange={(values) => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, salePrice: values.value } : r))}
                          className={flushInputNumber} disabled={!canSubmit} />
                      </td>
                      {canSubmit && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setPartsSales(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && <AddRowBtn onClick={() => setPartsSales(p => [...p, mkPart()])} label="Add row" />}
            </div>
          </div>

          {/* VII. For Collection */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="VII. For Collection" total={totalForColl} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Installer</th>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {forColl.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Installer" value={row.installer}
                          onChange={e => setForColl(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setForColl(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setForColl(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={!canSubmit} />
                      </td>
                      {canSubmit && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setForColl(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && <AddRowBtn onClick={() => setForColl(p => [...p, mkColl()])} label="Add row" />}
            </div>
          </div>

          {/* VIII. Estimate Rebates for Collection */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="VIII. Estimate Rebates for Collection (Gross Amount)" total={totalRebates} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Company</th>
                    <th className={tableTh + ' text-right w-24'}>Amount</th>
                    <th className={tableTh + ' text-center w-16'}>Units</th>
                    <th className={tableTh + ' text-right w-24'}>Total</th>
                    {canSubmit && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {rebates.map(row => {
                    const calc = num(row.amount) * num(row.units)
                    return (
                      <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                        <td className={tableTd}>
                          <input type="text" placeholder="Company" value={row.company}
                            onChange={e => setRebates(p => p.map(r => r.id === row.id ? { ...r, company: e.target.value } : r))}
                            className={flushInput} disabled={!canSubmit} />
                        </td>
                        <td className={tableTd}>
                          <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                            onValueChange={(values) => setRebates(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                            className={flushInputNumber} disabled={!canSubmit} />
                        </td>
                        <td className={tableTd}>
                          <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0" value={row.units} min="0"
                            onValueChange={(values) => setRebates(p => p.map(r => r.id === row.id ? { ...r, units: values.value } : r))}
                            className="w-full bg-transparent border-0 outline-none text-xs py-1 px-1.5 text-center transition-all focus:bg-slate-100/60 dark:focus:bg-slate-800/40 focus:ring-1 focus:ring-emerald-500/20 rounded font-semibold text-slate-800 dark:text-slate-200" disabled={!canSubmit} />
                        </td>
                        <td className={tableTd + ' text-right font-bold text-slate-700 dark:text-slate-300 pr-2 text-xs'}>
                          {php(calc)}
                        </td>
                        {canSubmit && (
                          <td className={tableTd + ' text-center'}>
                            <DelBtn onClick={() => setRebates(p => p.filter(r => r.id !== row.id))} />
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {canSubmit && <AddRowBtn onClick={() => setRebates(p => [...p, mkReb()])} label="Add row" />}
            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="flex flex-col gap-4">

          {/* IX. Parts Order / Units Order */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="IX. Parts Order / Units Order" total={totalOrders} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setOrders(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setOrders(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setOrders(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={!canSubmit} />
                      </td>
                      {canSubmit && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setOrders(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && <AddRowBtn onClick={() => setOrders(p => [...p, mkOrd()])} label="Add row" />}
            </div>
          </div>

          {/* X. Expenses with Receipts */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="X. Expenses with Receipts (Reimbursements)" total={totalExpReceipt} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Name</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {expReceipt.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Name" value={row.name}
                          onChange={e => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={!canSubmit} />
                      </td>
                      {canSubmit && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setExpReceipt(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && <AddRowBtn onClick={() => setExpReceipt(p => [...p, mkExp()])} label="Add row" />}
            </div>
          </div>

          {/* XI. Expenses for Purchase */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="XI. Expenses for Purchase" total={totalExpPurch} />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Name</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {expPurch.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Name" value={row.name}
                          onChange={e => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={!canSubmit} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount} 
                          onValueChange={(values) => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={!canSubmit} />
                      </td>
                      {canSubmit && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setExpPurch(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && <AddRowBtn onClick={() => setExpPurch(p => [...p, mkExp()])} label="Add row" />}
            </div>
          </div>

          {/* XIII. Cash Breakdown */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="XIII. Cash Breakdown" total={dtrCashFromDenoms} />
            <div className="p-3">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="px-3 py-1 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Denomination</th>
                    <th className="px-3 py-1 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center w-24">Pcs</th>
                    <th className="px-3 py-1 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-36">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dtrDenoms.map((denom, idx) => {
                    const subtotal = (parseInt(denom.qty) || 0) * denom.value
                    return (
                      <tr key={denom.label} className="border-b border-slate-100 dark:border-slate-800/40">
                        <td className="px-3 py-1.5 font-bold text-slate-600 dark:text-slate-400">{denom.label}</td>
                        <td className="px-3 py-1 text-center w-24">
                          <NumericFormat
                            thousandSeparator=","
                            decimalScale={0}
                            fixedDecimalScale={false}
                            allowNegative={false}
                            placeholder="0"
                            value={denom.qty}
                            onValueChange={(values) => setDtrDenoms(prev => prev.map((d, i) => i === idx ? { ...d, qty: values.value } : d))}
                            className="w-16 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs font-bold rounded focus:outline-none focus:ring-1 focus:ring-emerald-500/30 py-0.5 text-slate-800 dark:text-slate-200"
                            disabled={!canSubmit}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold text-slate-700 dark:text-slate-300">
                          {subtotal > 0 ? php(subtotal) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* XII–XIV. Summary */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="XII–XIV. Summary" />
            <div className="p-3">
              <table className="w-full text-left border-collapse text-xs">
                <tbody>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">XII. Grand Total Expenses</td>
                    <td className="px-3 py-2 text-right font-bold text-red-500">{php(grandTotalExpenses)}</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">XIV. Total Fund Received</td>
                    <td className="px-3 py-2 text-right font-bold text-cyan-600 dark:text-cyan-400">{php(totalFundReceived)}</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">XIV. Grand Total Expenses</td>
                    <td className="px-3 py-2 text-right font-bold text-red-500">{php(grandTotalExpenses)}</td>
                  </tr>
                  <tr className="bg-slate-50 dark:bg-slate-900/40 font-bold">
                    <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200 font-bold text-sm">XIV. Total Cash on Hand / Deposit</td>
                    <td className="px-3 py-2.5 text-right text-base text-emerald-600 dark:text-emerald-400">
                      {php(totalCashOnHand)}
                    </td>
                  </tr>
                </tbody>
              </table>
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
            {submitting ? <>Submitting...</> : <><Send className="w-4 h-4" /> Submit Transaction Report</>}
          </button>
        </div>
      )}

      {/* Autocomplete Datalist */}
      <datalist id="tech-suggestions">
        {techSuggestions.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>

    </div>
  )
}
