import { useState, useRef, useEffect } from 'react'
import {
  Upload, Scan, FileSpreadsheet, Check, X,
  AlertTriangle, Loader2, ClipboardPaste, Save,
  Calendar, Sparkles, Building2
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

interface BranchOption { id: string; name: string }

// Fields fetched from the backend scan — NO target quota
const SCAN_FIELDS = [
  { key: 'totalCashCollection',      label: 'Total Cash Collection',          prefix: '₱' },
  { key: 'cashReturns',              label: 'Total Cash Return',               prefix: '₱' },
  { key: 'fundFromHo',               label: 'Fund from H.O.',                  prefix: '₱' },
  { key: 'cohPreviousDay',           label: 'Cash on Hand (Prev Day)',         prefix: '₱' },
  { key: 'totalOnlineCollection',    label: 'Total Online + Remit Check',      prefix: '₱' },
  { key: 'totalUnitsInstalledServiced', label: 'Unit Sales',                   prefix: ''  },
  { key: 'forCollection',            label: 'For Collection',                  prefix: '₱' },
  { key: 'rebatesForCollection',     label: 'Rebates for Collection',          prefix: '₱' },
  { key: 'totalExpenses',            label: 'Total Expenses',                  prefix: '₱' },
] as const

type ScanKey = typeof SCAN_FIELDS[number]['key']

type FormState = {
  branchId: string
  branchName: string
  date: string
} & Record<ScanKey, string>

const emptyForm = (): FormState => ({
  branchId: '',
  branchName: '',
  date: new Date().toISOString().split('T')[0],
  totalCashCollection: '',
  cashReturns: '',
  fundFromHo: '',
  cohPreviousDay: '',
  totalOnlineCollection: '',
  totalUnitsInstalledServiced: '',
  forCollection: '',
  rebatesForCollection: '',
  totalExpenses: '',
})

// ── Number formatting helpers ─────────────────────────────────────────────
const formatNumber = (raw: string): string => {
  if (raw === '' || raw === null || raw === undefined) return ''
  const num = parseFloat(raw)
  if (isNaN(num)) return raw
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num)
}

const parseRawNumber = (display: string): string => {
  // Strip commas, keep digits and single decimal point
  const stripped = display.replace(/,/g, '')
  if (stripped === '' || stripped === '-') return stripped
  if (!/^-?\d*\.?\d*$/.test(stripped)) return stripped.replace(/[^0-9.]/g, '')
  return stripped
}

export default function DTRScanner() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const fileRef = useRef<HTMLInputElement>(null)

  const bg         = isLight ? '#f0f4f8'  : '#060D1A'
  const cardBg     = isLight ? '#ffffff'  : '#0A1120'
  const border     = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary= isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted  = isLight ? '#64748b'  : '#7A95B8'
  const inputBg    = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder= isLight ? '#cbd5e1'  : '#243452'
  const accent     = '#10B981'
  const scanBorder = '#F59E0B'
  const danger     = '#EF4444'

  const role      = (user?.role || '').toLowerCase()
  const isBranchRestricted = role !== 'admin' && !!user?.branchId

  const [branches,      setBranches]      = useState<BranchOption[]>([])
  const [scanning,      setScanning]      = useState(false)
  const [scanPreview,   setScanPreview]   = useState<string | null>(null)
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set())
  const [scanError,     setScanError]     = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [success,       setSuccess]       = useState(false)
  const [form,          setForm]          = useState<FormState>(emptyForm)
  const [focusedField,  setFocusedField]  = useState<string | null>(null)

  // Load branches (used to pre-fill manager's branch, and for manual override)
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data = await res.json()
          const list: BranchOption[] = (data?.data || data || []).map((b: any) => ({ id: b.id, name: b.name }))
          setBranches(list)
          // For branch-restricted users, pre-fill branch automatically
          if (isBranchRestricted && user?.branchId) {
            const myBranch = list.find(b => b.id === user.branchId)
            setForm(f => ({ ...f, branchId: user.branchId || '', branchName: myBranch?.name || '' }))
          }
        }
      } catch (e) { console.error(e) }
    }
    loadBranches()
  }, [isBranchRestricted, user?.branchId])

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
      // Send branchId only if known (manager) — scanner can detect it from image
      if (form.branchId) formData.append('branchId', form.branchId)

      const res = await fetch(`${API_BASE_URL}/v1/reports/scan-dtr`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) throw new Error('Scan endpoint unavailable — using simulation')

      const data = await res.json()
      if (data.error) { setScanError(`Scan failed: ${data.error}`); return }

      applyScannedData(data)
    } catch (err) {
      console.warn('Scan error/fallback', err)
      // Simulate realistic scan result
      setTimeout(() => {
        applyScannedData({
          branchId:   form.branchId || branches[0]?.id || '',
          branchName: form.branchName || branches[0]?.name || 'ASHCOL DASMA',
          totalCashCollection:         27049,
          cashReturns:                  3040,
          fundFromHo:                 111286,
          cohPreviousDay:              50000,
          totalOnlineCollection:           0,
          totalUnitsInstalledServiced:     4,
          forCollection:               10500,
          rebatesForCollection:        52950,
          totalExpenses:              122086,
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
    const filled = new Set<string>()
    setForm(prev => {
      const next = { ...prev }

      // Auto-detected branch from scanner
      if (isBranchRestricted && user?.branchId) {
        next.branchId = user.branchId
        const myBranch = branches.find(b => b.id === user.branchId)
        next.branchName = myBranch?.name || prev.branchName
      } else {
        if (data.branchId)   { next.branchId   = String(data.branchId);   filled.add('branchId') }
        if (data.branchName) { next.branchName = String(data.branchName); filled.add('branchName') }
      }
      if (data.date)       { next.date        = String(data.date);       filled.add('date') }

      SCAN_FIELDS.forEach(({ key }) => {
        if (data[key] !== undefined && data[key] !== null) {
          next[key] = String(data[key])
          filled.add(key)
        }
      })
      return next
    })
    setScannedFields(filled)
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
      setScanError('Clipboard button is disabled on HTTP. Please press Ctrl+V (or Cmd+V) anywhere on the page to paste the image.')
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

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setScannedFields(prev => { const s = new Set(prev); s.delete(key); return s })
  }

  const updateNumericField = (key: string, display: string) => {
    const raw = parseRawNumber(display)
    updateField(key, raw)
  }

  const handleBranchChange = (branchId: string) => {
    const found = branches.find(b => b.id === branchId)
    setForm(prev => ({ ...prev, branchId, branchName: found?.name || '' }))
  }

  const handleSubmit = async () => {
    if (!form.branchId) {
      alert('Branch could not be detected. Please scan a valid DTR image or select a branch manually.')
      return
    }
    setSubmitting(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const payload = {
        branchId:                   form.branchId,
        date:                       form.date,
        totalCashCollection:        parseFloat(form.totalCashCollection)        || 0,
        cashReturns:                parseFloat(form.cashReturns)                || 0,
        fundFromHo:                 parseFloat(form.fundFromHo)                 || 0,
        cohPreviousDay:             parseFloat(form.cohPreviousDay)             || 0,
        totalOnlineCollection:      parseFloat(form.totalOnlineCollection)      || 0,
        totalUnitsInstalledServiced:parseInt(form.totalUnitsInstalledServiced)  || 0,
        forCollection:              parseFloat(form.forCollection)              || 0,
        rebatesForCollection:       parseFloat(form.rebatesForCollection)       || 0,
        totalExpenses:              parseFloat(form.totalExpenses)              || 0,
        remarks: 'CHECKED',
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
      alert('Failed to submit DTR audit report.')
    } finally {
      setSubmitting(false)
    }
  }

  const scannedStyle = (key: string): React.CSSProperties =>
    scannedFields.has(key)
      ? { borderColor: scanBorder, boxShadow: `0 0 0 2px ${scanBorder}33` }
      : {}

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5" style={{ backgroundColor: bg }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
          <Check className="w-10 h-10" style={{ color: '#10B981' }} />
        </div>
        <h2 className="text-2xl font-black" style={{ color: textPrimary }}>Branch Audit Saved!</h2>
        <p className="text-sm" style={{ color: textMuted }}>The scanned DTR data has been added to the audit summary table.</p>
        <p className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: accent }}>
          {form.branchName || 'Branch'} · {form.date}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => { setSuccess(false); setScanPreview(null); setScannedFields(new Set()); setForm(emptyForm()) }}
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
            Go to Audit Summary Table
          </a>
        </div>
      </div>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg }} className="flex flex-col gap-5 pb-12 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div
        className="rounded-2xl p-5 md:p-7 relative overflow-hidden flex flex-col sm:flex-row justify-between sm:items-center gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}
      >
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-[0.05] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #3B82F6, transparent)' }} />

        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="rounded-xl p-2" style={{ backgroundColor: 'rgba(59,130,246,0.15)' }}>
              <Scan size={20} style={{ color: '#3B82F6' }} />
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight" style={{ color: textPrimary }}>DTR Scanner</h1>
          </div>
          <p className="text-sm" style={{ color: textMuted }}>
            Upload or paste a DTR image — branch and values extracted automatically
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={scanning}
            onClick={handlePasteClick}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            style={{ backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3B82F6' }}
          >
            <ClipboardPaste size={16} /> Paste Image
          </button>
          <button
            disabled={scanning}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            style={{ backgroundColor: '#3B82F6', color: 'white' }}
          >
            <Upload size={16} /> Upload DTR
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleScanImage} />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">

        {/* ── Left: Image Preview ── */}
        <div className="lg:w-1/3 flex flex-col gap-4">
          <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

            {/* Branch Selector — always visible, pre-filled by scan, overridable */}
            <div className="mb-4">
              <label className="text-xs font-semibold tracking-wide uppercase mb-1.5 flex items-center gap-1.5" style={{ color: textMuted }}>
                <Building2 size={12} />
                Branch
                {scannedFields.has('branchId') && <span style={{ color: scanBorder, fontSize: 10, marginLeft: 'auto' }}>✦ from scan</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <Building2 size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none' }} />
                <select
                  value={form.branchId}
                  onChange={e => handleBranchChange(e.target.value)}
                  disabled={isBranchRestricted}
                  className="w-full rounded-xl py-2 text-sm outline-none appearance-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                  style={{
                    backgroundColor: inputBg,
                    border: `1px solid ${scannedFields.has('branchId') ? scanBorder : inputBorder}`,
                    boxShadow: scannedFields.has('branchId') ? `0 0 0 2px ${scanBorder}33` : undefined,
                    color: form.branchId ? textPrimary : textMuted,
                    paddingLeft: 30,
                    paddingRight: 12,
                    cursor: isBranchRestricted ? 'not-allowed' : 'pointer',
                    opacity: isBranchRestricted ? 0.7 : 1,
                  }}
                >
                  <option value="" disabled>— Select branch —</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
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
              <div
                className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed rounded-xl cursor-pointer hover:border-blue-400 transition-colors"
                style={{ borderColor: inputBorder, backgroundColor: inputBg }}
                onClick={() => fileRef.current?.click()}
              >
                <Scan className="w-10 h-10 mb-3 opacity-20" style={{ color: textMuted }} />
                <p className="text-sm font-semibold text-center mb-1" style={{ color: textPrimary }}>No document loaded</p>
                <p className="text-xs text-center" style={{ color: textMuted }}>Upload or paste a DTR image to begin</p>
              </div>
            )}

            {!scanning && scannedFields.size > 0 && !scanError && (
              <div className="mt-4 p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={14} style={{ color: scanBorder, marginTop: 2 }} className="shrink-0" />
                <p className="text-xs font-semibold" style={{ color: scanBorder }}>
                  AI extracted {scannedFields.size} fields. Review highlighted values before submitting.
                </p>
              </div>
            )}

            {scanError && (
              <div className="mt-4 p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle size={14} style={{ color: danger, marginTop: 2 }} className="shrink-0" />
                <p className="text-xs" style={{ color: danger }}>{scanError}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Extracted Fields ── */}
        <div className="lg:w-2/3 flex flex-col gap-4">
          <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

            {/* Date row */}
            <div className="mb-5 pb-5" style={{ borderBottom: `1px solid ${border}` }}>
              <label className="text-xs font-semibold tracking-wide uppercase mb-1.5 flex justify-between" style={{ color: textMuted }}>
                Report Date
                {scannedFields.has('date') && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <Calendar size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted }} />
                <input
                  type="date"
                  value={form.date}
                  onChange={e => updateField('date', e.target.value)}
                  className="w-full rounded-xl pl-8 pr-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...scannedStyle('date') }}
                />
              </div>
            </div>

            {/* Scanned fields grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SCAN_FIELDS.map(({ key, label, prefix }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold tracking-wide uppercase flex justify-between" style={{ color: textMuted }}>
                    {label}
                    {scannedFields.has(key) && <span style={{ color: scanBorder, fontSize: 10 }}>✦ from scan</span>}
                  </label>
                  <div style={{ position: 'relative' }}>
                    {prefix && (
                      <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: textMuted, fontSize: 13, fontWeight: 600, pointerEvents: 'none' }}>
                        {prefix}
                      </span>
                    )}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={focusedField === key ? form[key] : formatNumber(form[key])}
                      onFocus={() => setFocusedField(key)}
                      onBlur={() => setFocusedField(null)}
                      onChange={e => updateNumericField(key, e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                      style={{
                        backgroundColor: inputBg,
                        border: `1px solid ${inputBorder}`,
                        color: textPrimary,
                        paddingLeft: prefix ? 22 : 12,
                        paddingRight: 12,
                        ...scannedStyle(key),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Info banner — formulae applied on backend */}
            <div className="mt-5 p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
              <Sparkles size={13} style={{ color: '#3B82F6', marginTop: 2 }} className="shrink-0" />
              <p className="text-xs" style={{ color: textMuted }}>
                <span className="font-semibold" style={{ color: '#3B82F6' }}>Backend-computed: </span>
                Gross Sales, Target Quota, COH/CFD totals, difference vs quota, and remarks are all calculated server-side and applied when the audit report is generated.
              </p>
            </div>

            {/* Submit */}
            <div className="mt-6 pt-5 flex items-center justify-between" style={{ borderTop: `1px solid ${border}` }}>
              {form.branchName && (
                <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: accent }}>
                  {form.branchName}
                </span>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting || scanning}
                className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:scale-105 hover:shadow-lg disabled:opacity-50"
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
