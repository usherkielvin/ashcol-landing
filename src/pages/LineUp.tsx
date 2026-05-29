import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Trash2, Edit3, X, Printer, ClipboardList, Upload, Download, Building2,
  ScanLine, ClipboardPaste, Loader2, Truck, User, Clock, MapPin, MessageSquare,
  ChevronDown, MoreVertical,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import * as XLSX from 'xlsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toLocalDateStr(d)
}
function englishLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  return `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`.toUpperCase()
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineUpRow {
  id: string
  lineupDate: string
  branchId: string
  service: string
  driverName: string
  driverTime: string
  installerName: string
  installerTime: string
  route: string
  remarks: string
  sortOrder: number
}

const BLANK_ROW = (date: string, branchId: string): Partial<LineUpRow> => ({
  lineupDate: date, branchId, service: '', driverName: '', driverTime: '8:00AM',
  installerName: '', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 0,
})

const LS_KEY = 'ashcol_lineup_v2'
function lsLoad(): LineUpRow[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function lsSave(rows: LineUpRow[]) { localStorage.setItem(LS_KEY, JSON.stringify(rows)) }
function lsNextId() { return `local-${Date.now()}-${Math.random().toString(36).slice(2)}` }

// ── Component ─────────────────────────────────────────────────────────────────

export default function LineUp() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const pageBg      = isLight ? '#f1f5f9'  : '#060B18'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#F0F6FF'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'

  const role      = (user?.role || '').toLowerCase()
  const isManager = role === 'manager'
  const canEdit   = role === 'admin' || role === 'manager' || role === 'staff'

  const [date, setDate]         = useState(tomorrowStr)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState('')
  const [rows, setRows]         = useState<LineUpRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [editing, setEditing]   = useState<Partial<LineUpRow> | null>(null)
  const [saving, setSaving]     = useState(false)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef  = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scanFileRef  = useRef<HTMLInputElement>(null)
  const [scanning, setScanning]       = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scanError, setScanError]     = useState('')

  const branchName = branches.find(b => b.id === branchId)?.name ?? ''

  // ── Load Branches ────────────────────────────────────────────────────────

  const loadBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list = (data?.data || data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))
      setBranches(list)
      if (user?.branchId) setBranchId(user.branchId)
      else if (list.length > 0) setBranchId(list[0].id)
    } catch (e) { console.error(e) }
  }, [user?.branchId])

  useEffect(() => { void loadBranches() }, [loadBranches])

  // ── Data ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const all = lsLoad()
    const filtered = branchId
      ? all.filter(r => r.lineupDate === date && r.branchId === branchId).sort((a, b) => a.sortOrder - b.sortOrder)
      : []
    setRows(filtered)
    if (!branchId) return
    setLoading(true)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    fetch(`${API_BASE_URL}/v1/lineup?date=${date}&branchId=${branchId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => { if (res.ok) return res.json().then(data => { if (Array.isArray(data)) setRows(data) }) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [date, branchId])

  const loadRows = useCallback(() => {
    const all = lsLoad()
    const filtered = branchId
      ? all.filter(r => r.lineupDate === date && r.branchId === branchId).sort((a, b) => a.sortOrder - b.sortOrder)
      : []
    setRows(filtered)
  }, [date, branchId])

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!editing || !branchId) return
    setSaving(true)
    const payload: LineUpRow = {
      id: editing.id || lsNextId(),
      lineupDate: editing.lineupDate || date,
      branchId: editing.branchId || branchId,
      service: editing.service || '',
      driverName: editing.driverName || '',
      driverTime: editing.driverTime || '8:00AM',
      installerName: editing.installerName || '',
      installerTime: editing.installerTime || '7:00AM',
      route: editing.route || '',
      remarks: editing.remarks || '',
      sortOrder: editing.sortOrder ?? rows.length,
    }
    let saved = false
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const isNew = !editing.id
      const url = isNew ? `${API_BASE_URL}/v1/lineup` : `${API_BASE_URL}/v1/lineup/${editing.id}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) saved = true
    } catch { /* fall through */ }
    if (!saved) {
      const all = lsLoad()
      const idx = all.findIndex(r => r.id === payload.id)
      if (idx >= 0) all[idx] = payload; else all.push(payload)
      lsSave(all)
    }
    setEditing(null)
    setSaving(false)
    void loadRows()
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async (row: LineUpRow) => {
    if (!window.confirm(`Remove ${row.service} — ${row.installerName} from the line-up?`)) return
    let deleted = false
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/lineup/${row.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) deleted = true
    } catch { /* fall through */ }
    if (!deleted) { const all = lsLoad().filter(r => r.id !== row.id); lsSave(all) }
    void loadRows()
  }

  // ── Totals ───────────────────────────────────────────────────────────────

  const totalUnits    = rows.reduce((acc, r) => { const m = r.remarks?.match(/\((\d+)\s*UNIT/i); return acc + (m ? parseInt(m[1]) : 0) }, 0)
  const totalSurvey   = rows.filter(r => /SURVEY/i.test(r.remarks || '') || /SURVEY/i.test(r.route || '')).length
  const totalBackJob  = rows.filter(r => /BACK\s*JOB/i.test(r.remarks || '')).length
  const totalDismantle = rows.filter(r => /DISMANTLE/i.test(r.remarks || '') || /DISMANTLE/i.test(r.route || '')).length

  // ── Scan Image ───────────────────────────────────────────────────────────

  const processLineupImage = async (file: File) => {
    setScanPreview(URL.createObjectURL(file))
    setScanning(true)
    setScanError('')
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`${API_BASE_URL}/v1/lineup/scan`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json() as Record<string, unknown>
      let parsedRows: LineUpRow[] = []
      if (Array.isArray(data.rows)) {
        parsedRows = (data.rows as any[]).map((r: any, i: number) => ({
          id: lsNextId(), lineupDate: date, branchId,
          service: r.service || r.SERVICE || '',
          driverName: r.driver || r.driverName || r.DRIVER || '',
          driverTime: r.driverTime || r.driverScheduledTime || '8:00AM',
          installerName: r.installer || r.installerName || r.INSTALLER || '',
          installerTime: r.installerTime || r.installerScheduledTime || '7:00AM',
          route: r.route || r.ROUTE || '',
          remarks: r.remarks || r.REMARKS || '',
          sortOrder: i,
        }))
      }
      if (parsedRows.length > 0) {
        if (window.confirm(`Scanner found ${parsedRows.length} row(s). Replace current lineup for this date?`)) {
          const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId))
          lsSave([...all, ...parsedRows])
          setRows(parsedRows)
        }
      } else {
        setScanError('Scanner could not extract lineup rows. Check the image or add rows manually.')
      }
    } catch { setScanError('Scan failed. Make sure the backend is running.') }
    finally { setScanning(false); if (scanFileRef.current) scanFileRef.current.value = '' }
  }

  const handleScanFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) processLineupImage(f) }
  const processLineupImageRef = useRef(processLineupImage)
  useEffect(() => { processLineupImageRef.current = processLineupImage })

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (scanning) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) { void processLineupImageRef.current(new File([blob], 'pasted.png', { type: item.type })); return }
        }
      }
    }
    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [scanning])

  const handlePasteScan = async () => {
    if (scanning) return
    setScanError('')
    if (!navigator.clipboard || !navigator.clipboard.read) {
      setScanError('Clipboard button is disabled on HTTP. Press Ctrl+V anywhere on the page to paste.')
      return
    }
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith('image/'))
        if (imgType) { await processLineupImage(new File([await item.getType(imgType)], 'pasted.png', { type: imgType })); return }
      }
      setScanError('No image found in clipboard. Copy a screenshot first.')
    } catch { setScanError('Clipboard access denied. Use the file button instead.') }
  }

  // ── Excel ────────────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    if (rows.length === 0) { alert('No data to export!'); return }
    const data = rows.map((r, i) => ({ '#': i + 1, SERVICE: r.service, DRIVER: r.driverName, 'SCHEDULED TIME – IN OF DRIVER': r.driverTime, INSTALLER: r.installerName, 'SCHEDULED TIME – IN OF INSTALLER': r.installerTime, ROUTE: r.route, REMARKS: r.remarks }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'LineUp')
    XLSX.writeFile(wb, `ASHCOL_LineUp_${branchName.replace(/\s+/g, '_')}_${date}.xlsx`)
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !branchId) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' })
        const rawData = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]])
        if (!rawData || rawData.length === 0) { alert('The selected sheet appears to be empty.'); return }
        const parsedRows: LineUpRow[] = []
        rawData.forEach((row: any, index: number) => {
          const k = (re: RegExp, ex?: RegExp) => Object.keys(row).find(k => re.test(k) && (!ex || !ex.test(k)))
          const service = k(/service/i) ? String(row[k(/service/i)!] || '').trim() : ''
          const driverName = k(/driver/i, /time/i) ? String(row[k(/driver/i, /time/i)!] || '').trim() : ''
          const driverTime = k(/driver/i, undefined) && k(/time/i) ? String(row[k(/driver/i)!] || '').trim() : '8:00AM'
          const installerName = k(/installer/i, /time/i) ? String(row[k(/installer/i, /time/i)!] || '').trim() : ''
          const installerTime = k(/installer/i) && k(/time/i) ? '7:00AM' : '7:00AM'
          const route = k(/route/i) ? String(row[k(/route/i)!] || '').trim() : ''
          const remarks = k(/remark/i) ? String(row[k(/remark/i)!] || '').trim() : ''
          if (service || route || driverName || installerName) {
            parsedRows.push({ id: `imported-${Date.now()}-${index}`, lineupDate: date, branchId, service, driverName, driverTime, installerName, installerTime, route, remarks, sortOrder: index })
          }
        })
        if (parsedRows.length === 0) { alert('No valid lineup rows found.'); return }
        if (!window.confirm(`Import ${parsedRows.length} lineup entries? This will replace current entries.`)) return
        const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId))
        lsSave([...all, ...parsedRows])
        setRows(parsedRows)
        alert(`Successfully imported ${parsedRows.length} rows for ${branchName}!`)
      } catch { alert('Error parsing Excel file.') }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  // ── Remark badge ─────────────────────────────────────────────────────────

  const getRemarkBadge = (row: LineUpRow) => {
    const txt = (row.remarks + ' ' + row.route).toUpperCase()
    if (/BACK\s*JOB/i.test(txt)) return { label: 'BACK JOB', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' }
    if (/DISMANTLE/i.test(txt)) return { label: 'DISMANTLE', color: '#F43F5E', bg: 'rgba(244,63,94,0.1)' }
    if (/SURVEY/i.test(txt)) return { label: 'SURVEY', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' }
    const m = txt.match(/\((\d+)\s*UNIT/i)
    if (m) return { label: `${m[1]} UNIT${parseInt(m[1]) > 1 ? 'S' : ''}`, color: '#10B981', bg: 'rgba(16,185,129,0.1)' }
    return null
  }

  // ── Desktop th helper ─────────────────────────────────────────────────────

  const thOrig = (label: string, wide?: boolean) => (
    <th style={{
      border: `1px solid ${border}`, padding: '12px 16px', fontSize: '11px', fontWeight: 800,
      textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' as const,
      backgroundColor: isLight ? '#f8fafc' : '#0F172A', color: textMuted,
      whiteSpace: wide ? undefined : 'nowrap',
    }}>{label}</th>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ backgroundColor: pageBg, minHeight: '100%' }}>

      {/* Always-in-DOM hidden inputs */}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
      <input ref={scanFileRef}  type="file" accept="image/*"    className="hidden" onChange={handleScanFile} />

      {/* ═══════════════════════════════════════════════════════
          MOBILE VIEW  — cards + 3-dot menu  (hidden on md+)
          ═══════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col gap-4 pb-8">

        {/* Mobile Header */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div style={{ background: 'linear-gradient(135deg, #059669, #047857)', padding: '16px 20px' }}>
            <div className="mb-3">
              <p className="text-[10px] font-black uppercase tracking-[3px] text-emerald-200 mb-0.5">Scheduling</p>
              <h2 className="text-xl font-black text-white tracking-tight">Team Line-Up</h2>
            </div>

            <div className="lineup-toolbar">
              {/* Date picker */}
              <div className="lineup-date-control">
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 border border-white/20 text-white w-full">
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="bg-transparent outline-none text-xs font-bold text-white w-full" />
                </div>
              </div>

              {/* + and ⋯ buttons */}
              <div className="lineup-actions">
                {canEdit && (
                  <button onClick={() => setEditing({ ...BLANK_ROW(date, branchId), sortOrder: rows.length })}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 border border-white/25 text-white active:scale-95">
                    <Plus className="w-4 h-4" />
                  </button>
                )}
                <div className="relative" ref={moreMenuRef}>
                  <button onClick={() => setMoreMenuOpen(o => !o)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 active:scale-95">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {moreMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                      <div className="absolute right-0 top-11 z-50 w-48 rounded-2xl overflow-hidden shadow-2xl"
                        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                        <div className="py-1.5">
                          {canEdit && (
                            <>
                              <DropdownItem
                                icon={scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                                label="Scan Image" color="#F59E0B" disabled={scanning}
                                onClick={() => { scanFileRef.current?.click(); setMoreMenuOpen(false) }} />
                              <DropdownItem icon={<ClipboardPaste className="w-3.5 h-3.5" />} label="Paste Image" color="#F59E0B" disabled={scanning}
                                onClick={() => { handlePasteScan(); setMoreMenuOpen(false) }} />
                            </>
                          )}
                          <DropdownItem icon={<Printer className="w-3.5 h-3.5" />} label="Print" color={textMuted}
                            onClick={() => { window.print(); setMoreMenuOpen(false) }} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Branch — full width row */}
              <div className="lineup-branch-control">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 border border-white/20 text-white w-full">
                  <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#6ee7b7' }} />
                  <select value={branchId} onChange={e => setBranchId(e.target.value)}
                    className="bg-transparent outline-none text-xs font-bold w-full text-white cursor-pointer">
                    {branches.length === 0 && <option value="">Loading…</option>}
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Import + Export — 2-column grid row */}
              <div className="lineup-import-export-actions">
                {canEdit && (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-white/10 border border-white/20 text-emerald-300">
                    <Upload className="w-3.5 h-3.5" /> Import
                  </button>
                )}
                <button onClick={handleExportExcel}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-white/10 border border-white/20 text-blue-300">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            </div>
            <p className="text-[10px] font-semibold text-emerald-200 mt-3 tracking-wider">{englishLabel(date)}</p>
          </div>

          {/* Stat pills */}
          {rows.length > 0 && (
            <div className="px-4 py-2.5 flex flex-wrap gap-2" style={{ borderBottom: `1px solid ${border}` }}>
              <StatPill label="Trucks" value={rows.length} color="#10B981" />
              <StatPill label="Units"  value={totalUnits}  color="#3B82F6" />
              {totalSurvey   > 0 && <StatPill label="Survey"    value={totalSurvey}    color="#F59E0B" />}
              {totalBackJob  > 0 && <StatPill label="Back Job"  value={totalBackJob}   color="#EF4444" />}
              {totalDismantle > 0 && <StatPill label="Dismantle" value={totalDismantle} color="#F43F5E" />}
            </div>
          )}

          {/* Scan alerts */}
          {scanError && (
            <div className="mx-4 mt-2 mb-1 px-3 py-2 rounded-xl flex items-center justify-between gap-2"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="text-xs font-semibold text-red-400">{scanError}</span>
              <button onClick={() => setScanError('')}><X className="w-3.5 h-3.5 text-red-400" /></button>
            </div>
          )}
          {scanPreview && (
            <div className="mx-4 mt-2 mb-1 px-3 py-2 rounded-xl flex items-center gap-3"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
              <img src={scanPreview} alt="Scanned" className="h-10 w-16 object-cover rounded-lg" />
              <span className="text-xs font-semibold flex-1" style={{ color: textMuted }}>Scanned preview</span>
              <button onClick={() => setScanPreview(null)}><X className="w-3.5 h-3.5" style={{ color: textMuted }} /></button>
            </div>
          )}
        </div>

        {/* Mobile content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#10B981' }} />
              <p className="text-sm font-semibold" style={{ color: textMuted }}>Loading schedule…</p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl flex flex-col items-center justify-center py-20 gap-4"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.08)' }}>
              <Truck className="w-7 h-7" style={{ color: '#10B981' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-black mb-1" style={{ color: textPrimary }}>No Schedule Yet</p>
              <p className="text-xs" style={{ color: textMuted }}>{branchName ? `${branchName} — ` : ''}{englishLabel(date)}</p>
            </div>
            {canEdit && (
              <button onClick={() => setEditing({ ...BLANK_ROW(date, branchId), sortOrder: 0 })}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                <Plus className="w-4 h-4" /> Add First Entry
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row, idx) => {
              const badge = getRemarkBadge(row)
              const isExpanded = expandedCard === row.id
              return (
                <div key={row.id} className="rounded-2xl overflow-hidden"
                  style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                  <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                    onClick={() => setExpandedCard(isExpanded ? null : row.id)}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-black text-xs text-white"
                      style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black" style={{ color: textPrimary }}>{row.service || '—'}</span>
                        {badge && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                            style={{ color: badge.color, backgroundColor: badge.bg }}>{badge.label}</span>
                        )}
                      </div>
                      <p className="text-xs truncate mt-0.5" style={{ color: textMuted }}>
                        {row.installerName || row.driverName || 'No name set'} · {row.route ? row.route.slice(0, 40) + (row.route.length > 40 ? '…' : '') : 'No route'}
                      </p>
                    </div>
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} style={{ color: textMuted }} />
                  </button>
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${border}` }}>
                      <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: border }}>
                        <InfoCell icon={<Truck   className="w-3 h-3" />} label="Driver"       value={row.driverName} />
                        <InfoCell icon={<Clock   className="w-3 h-3" />} label="Driver In"    value={row.driverTime} />
                        <InfoCell icon={<User    className="w-3 h-3" />} label="Installer"    value={row.installerName} />
                        <InfoCell icon={<Clock   className="w-3 h-3" />} label="Installer In" value={row.installerTime} />
                        <InfoCell icon={<MapPin  className="w-3 h-3" />} label="Route"        value={row.route}   full />
                        <InfoCell icon={<MessageSquare className="w-3 h-3" />} label="Remarks" value={row.remarks} full />
                      </div>
                      {canEdit && (
                        <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: `1px solid ${border}` }}>
                          <button onClick={() => setEditing(row)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                            style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.2)' }}>
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => handleDelete(row)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          DESKTOP VIEW  — original design  (hidden below md)
          ═══════════════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col gap-6 pb-8">

        {/* Original Top Control Bar */}
        <div className="rounded-2xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#10B981' }}>Scheduling</p>
            <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>Team Line-Up</h2>
            <p className="text-sm" style={{ color: textMuted }}>Manage and view tomorrow's field deployment schedule by branch.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0 w-full lg:w-auto justify-start lg:justify-end">
            {/* Branch */}
            <div style={{ position: 'relative' }} className="flex items-center">
              <Building2 className="w-3.5 h-3.5" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
              <select value={branchId} onChange={e => setBranchId(e.target.value)}
                className="rounded-xl pl-8 pr-7 py-2 text-xs font-bold appearance-none outline-none cursor-pointer"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                {branches.length === 0 && <option value="">Loading branches…</option>}
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px]" style={{ color: textMuted }}>▼</span>
            </div>
            {/* Date */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
              <ClipboardList className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="bg-transparent outline-none text-xs font-bold" style={{ color: textPrimary }} />
            </div>
            {canEdit && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.25)', color: '#10B981' }}>
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
            )}
            <button type="button" onClick={handleExportExcel}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
              style={{ backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.25)', color: '#3B82F6' }}>
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {canEdit && (
              <>
                <button type="button" onClick={() => scanFileRef.current?.click()} disabled={scanning}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                  style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.25)', color: '#F59E0B' }}>
                  {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />} Scan
                </button>
                <button type="button" onClick={handlePasteScan} disabled={scanning}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                  style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.25)', color: '#F59E0B' }}>
                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste Image
                </button>
              </>
            )}
            <button type="button" onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
              <Printer className="w-3.5 h-3.5" style={{ color: '#10B981' }} /> Print
            </button>
            {canEdit && (
              <button type="button" onClick={() => setEditing({ ...BLANK_ROW(date, branchId), sortOrder: rows.length })}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/10 transition-all hover:scale-105">
                <Plus className="w-4 h-4" /> Add Row
              </button>
            )}
          </div>
        </div>



        {/* Original Line-Up Sheet */}
        <div className="rounded-2xl overflow-hidden print-area shadow-xl shadow-slate-900/5"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

          {/* Scan error / preview banners */}
          {scanError && (
            <div className="px-4 py-2 flex items-center justify-between gap-2"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderBottom: `1px solid rgba(239,68,68,0.2)` }}>
              <span className="text-xs font-semibold" style={{ color: '#EF4444' }}>{scanError}</span>
              <button onClick={() => setScanError('')} style={{ color: '#EF4444' }}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {scanPreview && (
            <div className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: `1px solid ${border}`, backgroundColor: inputBg }}>
              <img src={scanPreview} alt="Scanned lineup" className="h-14 w-24 object-cover rounded-lg border" style={{ borderColor: inputBorder }} />
              <span className="text-xs font-semibold" style={{ color: textMuted }}>Scanned image preview</span>
              <button onClick={() => setScanPreview(null)} className="ml-auto" style={{ color: textMuted }}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Green banner */}
          <div style={{ background: isLight ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #064e3b, #022c22)', padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 950, fontSize: '20px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              TEAM {branchName ? branchName.toUpperCase() : '—'} LINE UP
            </div>
          </div>
          <div style={{ backgroundColor: isLight ? '#10b981' : '#065f46', padding: '8px 20px', textAlign: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '13px', letterSpacing: '0.08em' }}>{englishLabel(date)}</div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {thOrig('SERVICE')}
                  {thOrig('DRIVER')}
                  {thOrig('SCHEDULED TIME – IN OF DRIVER')}
                  {thOrig('INSTALLER')}
                  {thOrig('SCHEDULED TIME – IN OF INSTALLER')}
                  {thOrig('ROUTE', true)}
                  {thOrig('REMARKS', true)}
                  {canEdit && thOrig('ACTIONS')}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canEdit ? 8 : 7} style={{ textAlign: 'center', padding: '48px', color: textMuted, fontSize: '13px' }}>Loading deployment schedule…</td></tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7} style={{ textAlign: 'center', padding: '64px', color: textMuted, fontSize: '13px' }}>
                      No entries scheduled for {branchName || 'this branch'} on {englishLabel(date)}.<br />
                      {canEdit && (
                        <button onClick={() => setEditing({ ...BLANK_ROW(date, branchId), sortOrder: 0 })}
                          style={{ color: '#10B981', fontWeight: 700, marginTop: '12px', fontSize: '12px' }}
                          className="hover:underline">
                          + Add the first entry
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr key={row.id}
                      style={{ backgroundColor: idx % 2 === 0 ? (isLight ? '#fcfdfd' : '#09101E') : 'transparent', borderBottom: `1px solid ${border}` }}
                      className="transition-colors"
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = isLight ? '#f8fafc' : '#101B30')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? (isLight ? '#fcfdfd' : '#09101E') : 'transparent')}>
                      <td style={{ border: `1px solid ${border}`, padding: '12px 16px', textAlign: 'center', fontWeight: 900, fontSize: '13px', color: textPrimary }}>{row.service || '—'}</td>
                      <td style={{ border: `1px solid ${border}`, padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: textPrimary }}>{row.driverName || '—'}</td>
                      <td style={{ border: `1px solid ${border}`, padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: textPrimary }}>{row.driverTime || '—'}</td>
                      <td style={{ border: `1px solid ${border}`, padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: textPrimary }}>{row.installerName || '—'}</td>
                      <td style={{ border: `1px solid ${border}`, padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: textPrimary }}>{row.installerTime || '—'}</td>
                      <td style={{ border: `1px solid ${border}`, padding: '12px 16px', fontSize: '12px', color: textPrimary, fontWeight: 600 }}>{row.route || '—'}</td>
                      <td style={{ border: `1px solid ${border}`, padding: '12px 16px', fontSize: '12px', color: textPrimary }}>{row.remarks || '—'}</td>
                      {canEdit && (
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => setEditing(row)} title="Edit"
                              className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10 text-blue-400">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(row)} title="Delete"
                              className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 text-red-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${border}`, backgroundColor: inputBg }}>
            <p style={{ fontSize: '11px', fontStyle: 'italic', color: textMuted, fontWeight: 500 }}>
              NOTE: Installers must report earlier than drivers to handle returns and log out.
            </p>
          </div>

          {/* Summary boxes */}
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${border}` }}>
            <table style={{ borderCollapse: 'collapse', minWidth: '360px' }}>
              <tbody>
                <tr style={{ backgroundColor: isLight ? '#e8f5e9' : 'rgba(16,185,129,0.1)' }}>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#10B981' }}>TOTAL UNITS INSTALLATION</td>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#10B981' }}>{totalUnits}</td>
                </tr>
                <tr style={{ backgroundColor: isLight ? '#fef9c3' : 'rgba(234,179,8,0.1)' }}>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: isLight ? '#854d0e' : '#facc15' }}>TOTAL UNITS FOR SURVEY</td>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: isLight ? '#854d0e' : '#facc15' }}>{totalSurvey}</td>
                </tr>
                <tr style={{ backgroundColor: isLight ? '#fee2e2' : 'rgba(239,68,68,0.1)' }}>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#EF4444' }}>TOTAL BACK JOB</td>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#EF4444' }}>{totalBackJob}</td>
                </tr>
                <tr style={{ backgroundColor: isLight ? '#fecdd3' : 'rgba(244,63,94,0.1)' }}>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#F43F5E' }}>SERVICE / DISMANTLE</td>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#F43F5E' }}>{totalDismantle}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Edit / Create Modal (shared) ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
          onClick={() => setEditing(null)}>
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}>

            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <div>
                <h3 className="font-black text-sm" style={{ color: textPrimary }}>{editing.id ? 'Edit Entry' : 'New Line-Up Entry'}</h3>
                <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>{branchName} · {date}</p>
              </div>
              <button onClick={() => setEditing(null)} className="p-2 rounded-xl" style={{ color: textMuted, backgroundColor: inputBg }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <F label="Service (Vehicle Code)" required>
                <input value={editing.service || ''} placeholder="e.g. T3, T2, FB19, STRADA"
                  onChange={e => setEditing({ ...editing, service: e.target.value })}
                  className="w-full rounded-xl px-3 py-3 text-sm font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>
              <F label="Branch" required>
                <select value={editing.branchId || branchId} onChange={e => setEditing({ ...editing, branchId: e.target.value })}
                  disabled={isManager && !!user?.branchId}
                  className="w-full rounded-xl px-3 py-3 text-sm font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </F>
              <F label="Driver Name">
                <input value={editing.driverName || ''} placeholder="Driver's name"
                  onChange={e => setEditing({ ...editing, driverName: e.target.value })}
                  className="w-full rounded-xl px-3 py-3 text-sm font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>
              <F label="Driver Time In">
                <input value={editing.driverTime || ''} placeholder="e.g. 8:00AM"
                  onChange={e => setEditing({ ...editing, driverTime: e.target.value })}
                  className="w-full rounded-xl px-3 py-3 text-sm font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>
              <F label="Installer Name">
                <input value={editing.installerName || ''} placeholder="Installer's name"
                  onChange={e => setEditing({ ...editing, installerName: e.target.value })}
                  className="w-full rounded-xl px-3 py-3 text-sm font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>
              <F label="Installer Time In">
                <input value={editing.installerTime || ''} placeholder="e.g. 7:00AM"
                  onChange={e => setEditing({ ...editing, installerTime: e.target.value })}
                  className="w-full rounded-xl px-3 py-3 text-sm font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>
              <F label="Date">
                <input type="date" value={editing.lineupDate || date}
                  onChange={e => setEditing({ ...editing, lineupDate: e.target.value })}
                  className="w-full rounded-xl px-3 py-3 text-sm font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>
              <F label="Sort Order">
                <input type="number" value={editing.sortOrder ?? 0}
                  onChange={e => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                  className="w-full rounded-xl px-3 py-3 text-sm font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>
              <F label="Route" full>
                <input value={editing.route || ''} placeholder="e.g. VALENZUELA – MALABON – MANILA"
                  onChange={e => setEditing({ ...editing, route: e.target.value })}
                  className="w-full rounded-xl px-3 py-3 text-sm font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>
              <F label="Remarks" full>
                <textarea value={editing.remarks || ''} placeholder="e.g. INSTALL – INSTALL – INSTALL (3UNITS)"
                  onChange={e => setEditing({ ...editing, remarks: e.target.value })}
                  rows={3} className="w-full rounded-xl px-3 py-3 text-sm font-semibold resize-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>
            </div>

            <div className="px-5 py-4 flex items-center gap-2" style={{ borderTop: `1px solid ${border}` }}>
              <button onClick={() => setEditing(null)}
                className="flex-1 py-3 rounded-xl text-sm font-bold border"
                style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: fixed; inset: 0; margin: 0; padding: 0; border: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DropdownItem({ icon, label, color, onClick, disabled }: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-bold transition-colors hover:bg-black/5 disabled:opacity-40"
      style={{ color }}>
      {icon} {label}
    </button>
  )
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
      style={{ backgroundColor: color + '18', border: `1px solid ${color}30`, color }}>
      <span className="font-black text-sm leading-none">{value}</span>
      <span className="uppercase tracking-wide text-[9px]">{label}</span>
    </div>
  )
}

function InfoCell({ icon, label, value, full }: {
  icon: React.ReactNode; label: string; value: string; full?: boolean
}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const inputBg    = isLight ? '#f8fafc' : '#0F1A2E'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  return (
    <div className={`p-3 ${full ? 'col-span-2' : ''}`} style={{ backgroundColor: inputBg }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ color: textMuted }}>
        <span className="w-3 h-3">{icon}</span>
        <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xs font-semibold truncate" style={{ color: textPrimary }}>{value || '—'}</p>
    </div>
  )
}

function F({ label, children, required, full }: {
  label: string; children: React.ReactNode; required?: boolean; full?: boolean
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: '#7A95B8' }}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
