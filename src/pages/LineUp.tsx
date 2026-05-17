import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Trash2, Edit3, X, Printer, ClipboardList, Upload, Download, Building2,
  ScanLine, ClipboardPaste, Loader2,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import * as XLSX from 'xlsx'

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  branchId: string        // Added branchId for separate branch schedules
  service: string         // truck/vehicle code e.g. T3, FB19
  driverName: string
  driverTime: string      // e.g. 8:00AM
  installerName: string
  installerTime: string   // e.g. 7:00AM
  route: string
  remarks: string
  sortOrder: number
}

const BLANK_ROW = (date: string, branchId: string): Partial<LineUpRow> => ({
  lineupDate: date,
  branchId: branchId,
  service: '',
  driverName: '',
  driverTime: '8:00AM',
  installerName: '',
  installerTime: '7:00AM',
  route: '',
  remarks: '',
  sortOrder: 0,
})

const LS_KEY = 'ashcol_lineup_v2' // Upgrade LS key to isolate branch mapping

function lsLoad(): LineUpRow[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function lsSave(rows: LineUpRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows))
}
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
  const rowHover    = isLight ? '#f8fafc'  : '#101B30'
  
  const headerBg    = isLight ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #064e3b, #022c22)'
  const subHeaderBg = isLight ? '#10b981'  : '#065f46'
  const colHeaderBg = isLight ? '#f8fafc'  : '#0F172A'
  const rowStripBg  = isLight ? '#fcfdfd'  : '#09101E'

  const role = (user?.role || '').toLowerCase()
  const isManager = role === 'manager'
  const canEdit = role === 'admin' || role === 'manager' || role === 'staff'

  const [date, setDate]       = useState(tomorrowStr)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState('')
  const [rows, setRows]       = useState<LineUpRow[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Partial<LineUpRow> | null>(null)
  const [saving, setSaving]   = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scanFileRef  = useRef<HTMLInputElement>(null)
  const [scanning, setScanning]     = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scanError, setScanError]   = useState('')

  const branchName = branches.find((b) => b.id === branchId)?.name ?? ''

  // ── Load Branches ──────────────────────────────────────────────────────────

  const loadBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list = (data?.data || data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))
      setBranches(list)
      if (isManager && user?.branchId) setBranchId(user.branchId)
      else if (list.length > 0) setBranchId(list[0].id)
    } catch (e) { console.error(e) }
  }, [isManager, user?.branchId])

  useEffect(() => { void loadBranches() }, [loadBranches])

  // ── Data Loaders ──────────────────────────────────────────────────────────
  // Always load from localStorage immediately; date+branchId drive reload
  useEffect(() => {
    // LocalStorage always works immediately
    const all = lsLoad()
    const filtered = branchId
      ? all.filter(r => r.lineupDate === date && r.branchId === branchId).sort((a, b) => a.sortOrder - b.sortOrder)
      : []
    setRows(filtered)

    // Then try backend (optional, no await-gate on branchId empty)
    if (!branchId) return
    setLoading(true)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    fetch(`${API_BASE_URL}/v1/lineup?date=${date}&branchId=${branchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      if (res.ok) return res.json().then(data => { if (Array.isArray(data)) setRows(data) })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [date, branchId])

  const loadRows = useCallback(() => {
    const all = lsLoad()
    const filtered = branchId
      ? all.filter(r => r.lineupDate === date && r.branchId === branchId).sort((a, b) => a.sortOrder - b.sortOrder)
      : []
    setRows(filtered)
  }, [date, branchId])

  // ── Save (create / update) ────────────────────────────────────────────────

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

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (row: LineUpRow) => {
    if (!window.confirm(`Remove ${row.service} — ${row.installerName} from the line-up?`)) return
    let deleted = false
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/lineup/${row.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) deleted = true
    } catch { /* fall through */ }

    if (!deleted) {
      const all = lsLoad().filter(r => r.id !== row.id)
      lsSave(all)
    }
    void loadRows()
  }

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalUnits = rows.reduce((acc, r) => {
    const m = r.remarks?.match(/\((\d+)\s*UNIT/i)
    return acc + (m ? parseInt(m[1]) : 0)
  }, 0)

  const totalSurvey = rows.filter(r =>
    /SURVEY/i.test(r.remarks || '') || /SURVEY/i.test(r.route || '')
  ).length

  const totalBackJob = rows.filter(r =>
    /BACK\s*JOB/i.test(r.remarks || '')
  ).length

  const totalDismantle = rows.filter(r =>
    /DISMANTLE/i.test(r.remarks || '') || /DISMANTLE/i.test(r.route || '')
  ).length

  // ── Scan Image (lineup table) ─────────────────────────────────────────────

  const processLineupImage = async (file: File) => {
    setScanPreview(URL.createObjectURL(file))
    setScanning(true)
    setScanError('')
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`${API_BASE_URL}/v1/lineup/scan`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      // Backend returns a single object; for lineup we ask it to return rows[] via the raw text
      const data = await res.json() as Record<string, unknown>
      // Try to parse a 'rows' key or fall back to raw
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
    } catch (err) {
      setScanError('Scan failed. Make sure the backend is running.')
    } finally {
      setScanning(false)
      if (scanFileRef.current) scanFileRef.current.value = ''
    }
  }

  const handleScanFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) processLineupImage(f)
  }

  const handlePasteScan = async () => {
    if (scanning) return
    setScanError('')
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith('image/'))
        if (imgType) {
          const blob = await item.getType(imgType)
          await processLineupImage(new File([blob], 'pasted.png', { type: imgType }))
          return
        }
      }
      setScanError('No image found in clipboard. Copy a screenshot first.')
    } catch { setScanError('Clipboard access denied. Use the file button instead.') }
  }

  // ── Export Excel ──────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    if (rows.length === 0) {
      alert('No data to export!')
      return
    }
    const data = rows.map((r, index) => ({
      '#': index + 1,
      'SERVICE': r.service,
      'DRIVER': r.driverName,
      'SCHEDULED TIME - IN OF DRIVER': r.driverTime,
      'INSTALLER': r.installerName,
      'SCHEDULED TIME - IN OF INSTALLER': r.installerTime,
      'ROUTE': r.route,
      'REMARKS': r.remarks
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'LineUp')
    XLSX.writeFile(wb, `Ashcol_LineUp_${branchName.replace(/\s+/g, '_')}_${date}.xlsx`)
  }

  // ── Import Excel ──────────────────────────────────────────────────────────

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !branchId) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const rawData = XLSX.utils.sheet_to_json<any>(ws)

        if (!rawData || rawData.length === 0) {
          alert('The selected sheet appears to be empty.')
          return
        }

        const parsedRows: LineUpRow[] = []
        rawData.forEach((row: any, index: number) => {
          const serviceKey = Object.keys(row).find(k => /service/i.test(k))
          const driverKey = Object.keys(row).find(k => /driver/i.test(k) && !/time/i.test(k))
          const driverTimeKey = Object.keys(row).find(k => /driver/i.test(k) && /time/i.test(k)) || Object.keys(row).find(k => /scheduled/i.test(k) && /driver/i.test(k))
          const installerKey = Object.keys(row).find(k => /installer/i.test(k) && !/time/i.test(k))
          const installerTimeKey = Object.keys(row).find(k => /installer/i.test(k) && /time/i.test(k)) || Object.keys(row).find(k => /scheduled/i.test(k) && /installer/i.test(k))
          const routeKey = Object.keys(row).find(k => /route/i.test(k))
          const remarksKey = Object.keys(row).find(k => /remark/i.test(k))

          const service = serviceKey ? String(row[serviceKey] || '').trim() : ''
          const driverName = driverKey ? String(row[driverKey] || '').trim() : ''
          const driverTime = driverTimeKey ? String(row[driverTimeKey] || '').trim() : '8:00AM'
          const installerName = installerKey ? String(row[installerKey] || '').trim() : ''
          const installerTime = installerTimeKey ? String(row[installerTimeKey] || '').trim() : '7:00AM'
          const route = routeKey ? String(row[routeKey] || '').trim() : ''
          const remarks = remarksKey ? String(row[remarksKey] || '').trim() : ''

          if (service || route || driverName || installerName) {
            parsedRows.push({
              id: `imported-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
              lineupDate: date,
              branchId: branchId,
              service,
              driverName,
              driverTime,
              installerName,
              installerTime,
              route,
              remarks,
              sortOrder: index
            })
          }
        })

        if (parsedRows.length === 0) {
          alert('No valid lineup rows found in the Excel sheet.')
          return
        }

        const confirmReplace = window.confirm(`Import ${parsedRows.length} lineup entries? This will replace current entries for this date and branch.`)
        if (!confirmReplace) return

        const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId))
        const newAll = [...all, ...parsedRows]
        lsSave(newAll)
        setRows(parsedRows)
        alert(`Successfully imported ${parsedRows.length} rows for ${branchName}!`)
      } catch (err) {
        console.error(err)
        alert('Error parsing Excel file. Please ensure the column names match.')
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  // ── Render Helpers ────────────────────────────────────────────────────────

  const th = (label: string, wide?: boolean) => (
    <th
      style={{
        border: `1px solid ${border}`,
        padding: '12px 16px',
        fontSize: '11px',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        textAlign: 'center',
        backgroundColor: colHeaderBg,
        color: textMuted,
        whiteSpace: wide ? undefined : 'nowrap',
      }}
    >
      {label}
    </th>
  )

  return (
    <div className="flex flex-col gap-6 pb-8" style={{ backgroundColor: pageBg, minHeight: '100%' }}>

      {/* ── Top Control Bar ── */}
      <div className="rounded-2xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 transition-all"
           style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#10B981' }}>
            Scheduling
          </p>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
            Team Line-Up
          </h2>
          <p className="text-sm" style={{ color: textMuted }}>
            Manage and view tomorrow's field deployment schedule by branch.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0 w-full lg:w-auto justify-start lg:justify-end">
          {/* Branch Dropdown */}
          <div style={{ position: 'relative' }} className="flex items-center">
            <Building2 className="w-3.5 h-3.5" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              disabled={isManager && !!user?.branchId}
              className="rounded-xl pl-8 pr-7 py-2 text-xs font-bold appearance-none outline-none cursor-pointer"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
              {branches.length === 0 && <option value="">Loading branches…</option>}
              {branches.map(b => <option key={b.id} value={b.id} style={{ color: '#000' }}>{b.name}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px]" style={{ color: textMuted }}>▼</span>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
               style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
            <ClipboardList className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
                   className="bg-transparent outline-none text-xs font-bold" style={{ color: textPrimary }} />
          </div>

          {/* Import Excel */}
          {canEdit && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                      style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.25)', color: '#10B981' }}>
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
            </>
          )}

          {/* Export Excel */}
          <button type="button" onClick={handleExportExcel}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                  style={{ backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.25)', color: '#3B82F6' }}>
            <Download className="w-3.5 h-3.5" /> Export
          </button>

          {/* Paste/Scan Image */}
          {canEdit && (
            <>
              <input ref={scanFileRef} type="file" accept="image/*" className="hidden" onChange={handleScanFile} />
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

          {/* Print */}
          <button type="button" onClick={() => window.print()}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
            <Printer className="w-3.5 h-3.5" style={{ color: '#10B981' }} /> Print
          </button>

          {/* Add Row */}
          {canEdit && (
            <button type="button" onClick={() => setEditing({ ...BLANK_ROW(date, branchId), sortOrder: rows.length })}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/10 transition-all hover:scale-105">
              <Plus className="w-4 h-4" /> Add Row
            </button>
          )}
        </div>
      </div>

      {/* ── Line-Up Sheet ── */}
      <div className="rounded-2xl overflow-hidden print-area shadow-xl shadow-slate-900/5"
           style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

        {/* Scan error banner */}
        {scanError && (
          <div className="px-4 py-2 flex items-center justify-between gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderBottom: `1px solid rgba(239,68,68,0.2)` }}>
            <span className="text-xs font-semibold" style={{ color: '#EF4444' }}>{scanError}</span>
            <button onClick={() => setScanError('')} className="text-xs" style={{ color: '#EF4444' }}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {scanPreview && (
          <div className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: `1px solid ${border}`, backgroundColor: inputBg }}>
            <img src={scanPreview} alt="Scanned lineup" className="h-14 w-24 object-cover rounded-lg border" style={{ borderColor: inputBorder }} />
            <span className="text-xs font-semibold" style={{ color: textMuted }}>Scanned image preview</span>
            <button onClick={() => setScanPreview(null)} className="ml-auto" style={{ color: textMuted }}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Banners */}
        <div style={{ background: headerBg, padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 950, fontSize: '20px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            TEAM {branchName ? branchName.toUpperCase() : '—'} LINE UP
          </div>
        </div>
        <div style={{ backgroundColor: subHeaderBg, padding: '8px 20px', textAlign: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '13px', letterSpacing: '0.08em' }}>
            {englishLabel(date)}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {th('SERVICE')}
                {th('DRIVER')}
                {th('SCHEDULED TIME – IN OF DRIVER')}
                {th('INSTALLER')}
                {th('SCHEDULED TIME – IN OF INSTALLER')}
                {th('ROUTE', true)}
                {th('REMARKS', true)}
                {canEdit && th('ACTIONS')}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} style={{ textAlign: 'center', padding: '48px', color: textMuted, fontSize: '13px' }}>
                    Loading deployment schedule…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} style={{ textAlign: 'center', padding: '64px', color: textMuted, fontSize: '13px' }}>
                    No entries scheduled for {branchName || 'this branch'} on {englishLabel(date)}.<br />
                    {canEdit && (
                      <button
                        onClick={() => setEditing({ ...BLANK_ROW(date, branchId), sortOrder: 0 })}
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
                      style={{ backgroundColor: idx % 2 === 0 ? rowStripBg : 'transparent', borderBottom: `1px solid ${border}` }}
                      className="transition-colors"
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = rowHover)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? rowStripBg : 'transparent')}>
                    <td style={{ borderRight: `1px solid ${border}`, padding: '12px 16px', textAlign: 'center', fontWeight: 900, fontSize: '13px', color: textPrimary }}>
                      {row.service || '—'}
                    </td>
                    <td style={{ borderRight: `1px solid ${border}`, padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: textPrimary }}>
                      {row.driverName || '—'}
                    </td>
                    <td style={{ borderRight: `1px solid ${border}`, padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: textPrimary }}>
                      {row.driverTime || '—'}
                    </td>
                    <td style={{ borderRight: `1px solid ${border}`, padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: textPrimary }}>
                      {row.installerName || '—'}
                    </td>
                    <td style={{ borderRight: `1px solid ${border}`, padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: textPrimary }}>
                      {row.installerTime || '—'}
                    </td>
                    <td style={{ borderRight: `1px solid ${border}`, padding: '12px 16px', fontSize: '12px', color: textPrimary, fontWeight: 600 }}>
                      {row.route || '—'}
                    </td>
                    <td style={{ borderRight: `1px solid ${border}`, padding: '12px 16px', fontSize: '12px', color: textPrimary }}>
                      {row.remarks || '—'}
                    </td>
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

        {/* Footer NOTE */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${border}`, backgroundColor: inputBg }}>
          <p style={{ fontSize: '11px', fontStyle: 'italic', color: textMuted, fontWeight: 500 }}>
            NOTE: Installers must report earlier than drivers to handle returns and log out.
          </p>
        </div>

        {/* Summary Boxes */}
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${border}` }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '360px' }}>
            <tbody>
              <tr style={{ backgroundColor: isLight ? '#e8f5e9' : 'rgba(16,185,129,0.1)' }}>
                <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#10B981' }}>
                  TOTAL UNITS INSTALLATION
                </td>
                <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#10B981' }}>
                  {totalUnits}
                </td>
              </tr>
              <tr style={{ backgroundColor: isLight ? '#fef9c3' : 'rgba(234,179,8,0.1)' }}>
                <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: isLight ? '#854d0e' : '#facc15' }}>
                  TOTAL UNITS FOR SURVEY
                </td>
                <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: isLight ? '#854d0e' : '#facc15' }}>
                  {totalSurvey}
                </td>
              </tr>
              <tr style={{ backgroundColor: isLight ? '#fee2e2' : 'rgba(239,68,68,0.1)' }}>
                <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#EF4444' }}>
                  TOTAL BACK JOB
                </td>
                <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#EF4444' }}>
                  {totalBackJob}
                </td>
              </tr>
              <tr style={{ backgroundColor: isLight ? '#fecdd3' : 'rgba(244,63,94,0.1)' }}>
                <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#F43F5E' }}>
                  SERVICE / DISMANTLE
                </td>
                <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#F43F5E' }}>
                  {totalDismantle}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Edit / Create Modal ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
             onClick={() => setEditing(null)}>
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col shadow-2xl transition-all"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
               onClick={e => e.stopPropagation()}>

            {/* Modal Header */}
            <div className="px-5 py-4 flex items-center justify-between"
                 style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="font-black text-sm" style={{ color: textPrimary }}>
                {editing.id ? 'Edit Line-Up Entry' : 'New Line-Up Entry'}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Fields */}
            <div className="overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <F label="Date" required>
                <input type="date" value={editing.lineupDate || date}
                       onChange={e => setEditing({ ...editing, lineupDate: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>

              <F label="Branch" required>
                <select
                  value={editing.branchId || branchId}
                  onChange={(e) => setEditing({ ...editing, branchId: e.target.value })}
                  disabled={isManager && !!user?.branchId}
                  className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id} style={{ color: '#000' }}>{b.name}</option>
                  ))}
                </select>
              </F>

              <F label="Service (Vehicle Code)" required>
                <input value={editing.service || ''} placeholder="e.g. T3, T2, FB19, STRADA"
                       onChange={e => setEditing({ ...editing, service: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>

              <F label="Driver Name">
                <input value={editing.driverName || ''} placeholder="Driver's name"
                       onChange={e => setEditing({ ...editing, driverName: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>

              <F label="Driver Sched Time In">
                <input value={editing.driverTime || ''} placeholder="e.g. 8:00AM"
                       onChange={e => setEditing({ ...editing, driverTime: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>

              <F label="Installer Name">
                <input value={editing.installerName || ''} placeholder="Installer's name"
                       onChange={e => setEditing({ ...editing, installerName: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>

              <F label="Installer Sched Time In">
                <input value={editing.installerTime || ''} placeholder="e.g. 7:00AM"
                       onChange={e => setEditing({ ...editing, installerTime: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>

              <F label="Route" full>
                <input value={editing.route || ''} placeholder="e.g. VALENZUELA – MALABON – MANILA"
                       onChange={e => setEditing({ ...editing, route: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>

              <F label="Remarks" full>
                <textarea value={editing.remarks || ''}
                          placeholder="e.g. INSTALL – INSTALL – INSTALL (3UNITS)"
                          onChange={e => setEditing({ ...editing, remarks: e.target.value })}
                          rows={3}
                          className="w-full rounded-lg px-3 py-2 text-xs font-semibold resize-none"
                          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>

              <F label="Sort Order">
                <input type="number" value={editing.sortOrder ?? 0}
                       onChange={e => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </F>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 flex items-center justify-end gap-2"
                 style={{ borderTop: `1px solid ${border}` }}>
              <button onClick={() => setEditing(null)}
                      className="px-4 py-2 rounded-xl text-xs font-bold border"
                      style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:scale-105"
                      style={{ backgroundColor: '#10B981', opacity: saving ? 0.6 : 1 }}>
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

function F({ label, children, required, full }: {
  label: string; children: React.ReactNode; required?: boolean; full?: boolean
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-[10px] font-black uppercase tracking-wider mb-1"
             style={{ color: '#7A95B8' }}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
