import { useState, useRef, useEffect } from 'react'
import {
  Upload, Scan, FileSpreadsheet, Check, X,
  AlertTriangle, Loader2, ClipboardPaste, Save,
  Building2, Calendar
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

interface BranchOption { id: string; name: string }

export default function DTRScanner() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const fileRef = useRef<HTMLInputElement>(null)

  const bg = isLight ? '#f0f4f8' : '#060D1A'
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const accent = '#10B981'
  const scanBorder = '#F59E0B'
  const danger = '#EF4444'

  const role = (user?.role || '').toLowerCase()
  const isManager = role === 'manager'

  const [branches, setBranches] = useState<BranchOption[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set())
  const [scanError, setScanError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Form State
  const [form, setForm] = useState({
    branchId: '',
    date: new Date().toISOString().split('T')[0],
    grossSales: '',
    targetDailyQuota: '',
    cohPreviousDay: '',
    fundFromHo: '',
    cashReturns: '',
    totalCashCollection: '',
    totalOnlineCollection: '',
    totalExpenses: '',
    totalUnitsInstalledServiced: '',
    totalCancelled: '',
    totalUnitsFreeInstall: '',
    forCollection: '',
    rebatesForCollection: '',
    remarks: 'CHECKED'
  })

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data = await res.json()
          const list = (data?.data || data || []).map((b: any) => ({ id: b.id, name: b.name }))
          setBranches(list)
          if (isManager && user?.branchId) {
            setForm(f => ({ ...f, branchId: user.branchId || '' }))
          }
        }
      } catch (e) { console.error(e) }
    }
    loadBranches()
  }, [isManager, user?.branchId])

  // Automatically calculate grossSales = totalCashCollection + totalOnlineCollection + rebatesForCollection + forCollection
  useEffect(() => {
    const cash = parseFloat(form.totalCashCollection) || 0
    const online = parseFloat(form.totalOnlineCollection) || 0
    const rebates = parseFloat(form.rebatesForCollection) || 0
    const forColl = parseFloat(form.forCollection) || 0
    const calculatedGross = cash + online + rebates + forColl

    setForm(prev => {
      const calculatedStr = calculatedGross > 0 ? String(calculatedGross) : ''
      if (prev.grossSales !== calculatedStr) {
        return { ...prev, grossSales: calculatedStr }
      }
      return prev
    })
  }, [form.totalCashCollection, form.totalOnlineCollection, form.rebatesForCollection, form.forCollection])

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
      if (form.branchId) {
        formData.append('branchId', form.branchId)
      }
      
      // Call DTR scan endpoint (or fallback/placeholder if not available)
      const res = await fetch(`${API_BASE_URL}/v1/reports/scan-dtr`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      
      if (!res.ok) {
        throw new Error('DTR Scan API not available yet or failed. Simulation will be used.')
      }
      
      const data = await res.json()
      if (data.error) { setScanError(`Scan failed: ${data.error}`); return }

      // Map scanned data to form
      const filled = new Set<string>()
      setForm(prev => {
        const next = { ...prev }
        const fields = ['grossSales', 'targetDailyQuota', 'cohPreviousDay', 'fundFromHo', 'cashReturns', 'totalCashCollection', 'totalOnlineCollection', 'totalExpenses', 'totalUnitsInstalledServiced', 'totalCancelled', 'totalUnitsFreeInstall', 'forCollection', 'rebatesForCollection', 'remarks']
        
        fields.forEach(f => {
          if (data[f] !== undefined && data[f] !== null) {
            next[f as keyof typeof next] = String(data[f])
            filled.add(f)
          }
        })
        if (data.date) { next.date = data.date; filled.add('date') }
        return next
      })
      
      setScannedFields(filled)
    } catch (err) {
      console.warn('Scan error/fallback', err)
      // Simulate scan result since endpoint might not exist yet
      setTimeout(() => {
        setForm(f => ({
          ...f,
          grossSales: '90499',
          totalCashCollection: '27049',
          cashReturns: '3040',
          fundFromHo: '111286',
          totalOnlineCollection: '0',
          totalExpenses: '122086',
          forCollection: '10500',
          rebatesForCollection: '52950'
        }))
        setScannedFields(new Set(['grossSales', 'totalCashCollection', 'cashReturns', 'fundFromHo', 'totalOnlineCollection', 'totalExpenses', 'forCollection', 'rebatesForCollection']))
        setScanError('Simulated scan results loaded. Real AI backend endpoint not fully connected.')
        setScanning(false)
      }, 1500)
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
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
          const file = new File([blob], "pasted-dtr.png", { type: imageTypes[0] })
          await processImage(file)
          return
        }
      }
      setScanError('No image found in clipboard.')
    } catch (err) {
      setScanError('Could not read clipboard. Please check permissions.')
    }
  }

  const updateForm = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setScannedFields(prev => { const next = new Set(prev); next.delete(field); return next })
  }

  const handleSubmit = async () => {
    if (!form.branchId) {
      alert("Please select a branch")
      return
    }
    setSubmitting(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      
      const payload = {
        branchId: form.branchId,
        date: form.date,
        grossSales: parseFloat(form.grossSales) || 0,
        targetDailyQuota: parseFloat(form.targetDailyQuota) || 0,
        cohPreviousDay: parseFloat(form.cohPreviousDay) || 0,
        fundFromHo: parseFloat(form.fundFromHo) || 0,
        cashReturns: parseFloat(form.cashReturns) || 0,
        totalCashCollection: parseFloat(form.totalCashCollection) || 0,
        totalOnlineCollection: parseFloat(form.totalOnlineCollection) || 0,
        totalExpenses: parseFloat(form.totalExpenses) || 0,
        totalUnitsInstalledServiced: parseInt(form.totalUnitsInstalledServiced) || 0,
        totalCancelled: parseInt(form.totalCancelled) || 0,
        totalUnitsFreeInstall: parseInt(form.totalUnitsFreeInstall) || 0,
        forCollection: parseFloat(form.forCollection) || 0,
        rebatesForCollection: parseFloat(form.rebatesForCollection) || 0,
        remarks: form.remarks || 'CHECKED'
      }

      const res = await fetch(`${API_BASE_URL}/v1/reports/audit-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      
      if (!res.ok) throw new Error('Submission failed')
      setSuccess(true)
    } catch (e) {
      console.error(e)
      alert("Failed to submit DTR audit report. Make sure backend supports POST to /v1/reports/audit-summary")
    } finally {
      setSubmitting(false)
    }
  }

  const scannedStyle = (field: string): React.CSSProperties =>
    scannedFields.has(field)
      ? { borderColor: scanBorder, boxShadow: `0 0 0 2px ${scanBorder}33` }
      : {}

  const field = (label: string, id: keyof typeof form, type = 'number') => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold tracking-wide uppercase flex justify-between" style={{ color: textMuted }}>
        {label}
        {scannedFields.has(id) && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}
      </label>
      <input
        type={type}
        value={form[id]}
        onChange={e => updateForm(id, e.target.value)}
        className="w-full rounded-xl px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle(id) }}
      />
    </div>
  )

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5" style={{ backgroundColor: bg }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
          <Check className="w-10 h-10" style={{ color: '#10B981' }} />
        </div>
        <h2 className="text-2xl font-black" style={{ color: textPrimary }}>Audit Report Saved!</h2>
        <p className="text-sm" style={{ color: textMuted }}>The scanned DTR data has been added to the audit table.</p>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => {
              setSuccess(false); setScanPreview(null); setScannedFields(new Set());
              setForm(f => ({ ...f, grossSales: '', targetDailyQuota: '', cohPreviousDay: '', fundFromHo: '', cashReturns: '', totalCashCollection: '', totalOnlineCollection: '', totalExpenses: '', totalUnitsInstalledServiced: '', totalCancelled: '', totalUnitsFreeInstall: '', forCollection: '', rebatesForCollection: '' }))
            }}
            className="px-5 py-2.5 rounded-xl text-sm font-bold border transition-all hover:scale-105"
            style={{ borderColor: inputBorder, color: textMuted }}
          >
            Scan Another
          </button>
          <a
            href="/audit-report"
            className="px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:scale-105"
            style={{ backgroundColor: '#10B981' }}
          >
            Go to Audit Table
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg }} className="flex flex-col gap-5 pb-12 max-w-6xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl p-5 md:p-7 relative overflow-hidden flex flex-col sm:flex-row justify-between sm:items-center gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-[0.05] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #3B82F6, transparent)' }} />
        
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="rounded-xl p-2" style={{ backgroundColor: `rgba(59, 130, 246, 0.15)` }}>
              <Scan size={20} style={{ color: '#3B82F6' }} />
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight" style={{ color: textPrimary }}>DTR Scanner</h1>
          </div>
          <p className="text-sm" style={{ color: textMuted }}>AI-powered scanner for Ashcol Daily Transactions Report</p>
        </div>

        <div className="flex items-center gap-2">
           <button
             disabled={scanning || !form.branchId}
             onClick={handlePasteClick}
             className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
             style={{ backgroundColor: scanning ? `${inputBg}` : 'rgba(59, 130, 246, 0.1)', border: `1px solid rgba(59, 130, 246, 0.3)`, color: '#3B82F6' }}
             title={!form.branchId ? 'Please select a branch first' : 'Paste Image'}
           >
             <ClipboardPaste size={16} /> Paste Image
           </button>
           <button
             disabled={scanning || !form.branchId}
             onClick={() => fileRef.current?.click()}
             className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
             style={{ backgroundColor: '#3B82F6', color: 'white' }}
             title={!form.branchId ? 'Please select a branch first' : 'Upload DTR'}
           >
             <Upload size={16} /> Upload DTR
           </button>
           <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleScanImage} />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left Col: Image Preview */}
        <div className="lg:w-1/3 flex flex-col gap-4">
          <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="mb-4">
              <label className="text-xs font-semibold tracking-wide uppercase mb-1.5 block" style={{ color: textMuted }}>Select Branch Before Scanning</label>
              <div style={{ position: 'relative' }}>
                <Building2 size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted }} />
                <select
                  value={form.branchId}
                  onChange={(e) => updateForm('branchId', e.target.value)}
                  disabled={isManager && !!user?.branchId}
                  className="w-full rounded-xl pl-8 pr-3 py-2 text-sm appearance-none outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: form.branchId ? textPrimary : textMuted }}
                >
                  <option value="" disabled>Select branch...</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            <h3 className="font-bold text-sm mb-4 flex items-center gap-2 pt-2 border-t" style={{ color: textPrimary, borderColor: border }}>
              <FileSpreadsheet size={16} style={{ color: accent }} /> DTR Document
            </h3>
            
            {scanPreview ? (
              <div style={{ position: 'relative' }}>
                <img
                  src={scanPreview}
                  alt="Scanned DTR"
                  style={{ width: '100%', borderRadius: 12, border: `2px solid ${scanning ? inputBorder : scanBorder}44`, objectFit: 'contain' }}
                />
                {scanning && (
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <Loader2 size={32} className="animate-spin" style={{ color: '#3B82F6' }} />
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>Extracting data with AI...</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setScanPreview(null); setScannedFields(new Set()); setScanError('') }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-red-500/80 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed rounded-xl" style={{ borderColor: inputBorder, backgroundColor: inputBg }}>
                <Scan className="w-10 h-10 mb-3 opacity-20" style={{ color: textMuted }} />
                <p className="text-sm font-semibold text-center mb-1" style={{ color: textPrimary }}>No document loaded</p>
                <p className="text-xs text-center" style={{ color: textMuted }}>Upload or paste a DTR image to begin extraction</p>
              </div>
            )}
            
            {!scanning && scannedFields.size > 0 && !scanError && (
              <div className="mt-4 p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={14} style={{ color: scanBorder, marginTop: 2 }} className="shrink-0" />
                <p className="text-xs font-semibold" style={{ color: scanBorder }}>AI extracted {scannedFields.size} fields. Please review highlighted values for accuracy before submitting.</p>
              </div>
            )}
            
            {scanError && (
              <div className="mt-4 p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle size={14} style={{ color: danger, marginTop: 2 }} className="shrink-0" />
                <p className="text-xs font-semibold" style={{ color: danger }}>{scanError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Extracted Data Form */}
        <div className="lg:w-2/3 flex flex-col gap-4">
          <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 pb-6" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex flex-col gap-1.5 opacity-50 pointer-events-none">
                <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: textMuted }}>Branch (Selected)</label>
                <div style={{ position: 'relative' }}>
                  <Building2 size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted }} />
                  <input
                    value={branches.find(b => b.id === form.branchId)?.name || 'None'}
                    readOnly
                    className="w-full rounded-xl pl-8 pr-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: form.branchId ? textPrimary : textMuted }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold tracking-wide uppercase flex justify-between" style={{ color: textMuted }}>
                  Report Date
                  {scannedFields.has('date') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted }} />
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateForm('date', e.target.value)}
                    className="w-full rounded-xl pl-8 pr-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('date') }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {field('Gross Sales (₱)', 'grossSales')}
              {field('Target Quota (₱)', 'targetDailyQuota')}
              {field('Total Expenses (₱)', 'totalExpenses')}
              
              {field('Cash Collection (₱)', 'totalCashCollection')}
              {field('Online Collection (₱)', 'totalOnlineCollection')}
              {field('Cash Returns (₱)', 'cashReturns')}
              
              {field('COH Prev Day (₱)', 'cohPreviousDay')}
              {field('Fund From HO (₱)', 'fundFromHo')}
              
              {field('For Collection (₱)', 'forCollection')}
              {field('Rebates (₱)', 'rebatesForCollection')}
              
              {field('Units Installed', 'totalUnitsInstalledServiced')}
              {field('Free Install', 'totalUnitsFreeInstall')}
              {field('Cancelled', 'totalCancelled')}
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: textMuted }}>Remarks</label>
                <select
                  value={form.remarks}
                  onChange={(e) => updateForm('remarks', e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('remarks') }}
                >
                  <option value="CHECKED">CHECKED</option>
                  <option value="ABOVE QUOTA">ABOVE QUOTA</option>
                  <option value="NO SCHED">NO SCHED</option>
                  <option value="NO RECORD">NO RECORD</option>
                </select>
              </div>
            </div>
            
            <div className="mt-8 pt-5 flex justify-end" style={{ borderTop: `1px solid ${border}` }}>
              <button
                onClick={handleSubmit}
                disabled={submitting || scanning}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:scale-105 hover:shadow-lg disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save to Audit Table
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
