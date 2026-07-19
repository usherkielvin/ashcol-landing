import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'
import {
  Route, Plus, Search, AlertCircle, Upload, Trash2, Eye, Loader2,
  ChevronLeft, Save, Rows3, MapPin, Menu
} from 'lucide-react'

type ViewMode = 'ledger' | 'sheet'

const SITE_TONES = [
  { bg: 'rgba(16,185,129,0.12)', color: '#10B981', label: '1ST' },
  { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6', label: '2ND' },
  { bg: 'rgba(168,85,247,0.12)', color: '#A855F7', label: '3RD' },
  { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: '4TH' },
  { bg: 'rgba(244,63,94,0.12)', color: '#F43F5E', label: '5TH' },
  { bg: 'rgba(20,184,166,0.12)', color: '#14B8A6', label: '6TH' },
]

function emptySite() {
  return { cxName: '', arrival: '', departure: '', idleTime: '' }
}

/** Parse "10:38AM", "10:38 AM", "10:38", "2:14" → minutes from midnight, or null. */
function parseClockToMinutes(raw: string): number | null {
  const s = (raw || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!s) return null
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(AM|PM)?$/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  const ap = m[3]
  if (min > 59 || h > 23) return null
  if (ap === 'AM' || ap === 'PM') {
    if (h > 12) return null
    if (ap === 'AM') {
      if (h === 12) h = 0
    } else {
      if (h !== 12) h += 12
    }
  } else if (h > 23) {
    return null
  }
  return h * 60 + min
}

/** Idle = DEP − ARR. Formats like "30M", "1H", "3H 32M". */
function computeIdleFromArrivalDeparture(arrival: string, departure: string): string {
  let a = parseClockToMinutes(arrival)
  let d = parseClockToMinutes(departure)
  if (a == null || d == null) return ''

  const arrHasAp = /[AP]M/i.test(arrival)
  const depHasAp = /[AP]M/i.test(departure)
  // Bare times like 10:42 → 2:14: assume departure is later the same day (add 12h if needed)
  if (!arrHasAp && !depHasAp && d < a) {
    d += 12 * 60
  }
  // Cross midnight only if still negative after that
  if (d < a) d += 24 * 60

  const diff = d - a
  if (diff <= 0) return ''
  const hours = Math.floor(diff / 60)
  const mins = diff % 60
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`
  if (hours > 0) return `${hours}h`
  return `${mins}m`
}

function recomputeAllIdleTimes(sheet: any) {
  if (!sheet?.rows) return sheet
  return {
    ...sheet,
    rows: sheet.rows.map((row: any) => ({
      ...row,
      sites: (row.sites || []).map((site: any) => {
        const idle = computeIdleFromArrivalDeparture(site.arrival || '', site.departure || '')
        return idle ? { ...site, idleTime: idle } : site
      }),
    })),
  }
}

function emptyRow() {
  return {
    logDate: '',
    postedSchedule: '',
    bioTimeIn: '',
    bioTimeOut: '',
    departureTime: '',
    arrivalTime: '',
    sites: [],
    remarks: '',
  }
}

function blankSheet() {
  return {
    dateFiled: new Date().toISOString().substring(0, 10),
    filedBy: '',
    driverName: '',
    position: 'Driver',
    branch: '',
    cutOffPeriod: '',
    validatedBy: '',
    totalApprovedOt: '',
    remarksOic: '',
    idleTimeRemarks: '',
    rows: Array.from({ length: 7 }, () => emptyRow()),
  }
}

export default function Ddrm() {
  const { theme } = useTheme()
  const { setSidebarOpen } = useOutletContext<{ setSidebarOpen: (v: boolean) => void }>() || {}
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const pageBg      = isLight ? '#f8fafc' : '#060B18'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#ffffff' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const excelGreen  = '#10B981'
  const softPanel   = isLight ? '#f8fafc' : 'rgba(15,26,46,0.65)'

  const [view, setView] = useState<ViewMode>('ledger')
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [driverSheets, setDriverSheets] = useState<any[]>([])
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingSheet, setLoadingSheet] = useState(false)
  const [editingSheet, setEditingSheet] = useState<any | null>(null)
  const [siteCount, setSiteCount] = useState(3)
  const [driverContextMenu, setDriverContextMenu] = useState<{ x: number; y: number; sheet: any } | null>(null)
  const driverContextMenuRef = useRef<HTMLDivElement>(null)
  const driverFileInputRef = useRef<HTMLInputElement>(null)
  const sheetScrollRef = useRef<HTMLDivElement>(null)
  const dragScrollRef = useRef<{ active: boolean; startX: number; startLeft: number; moved: boolean }>({
    active: false, startX: 0, startLeft: 0, moved: false,
  })

  const getToken = useCallback((): string => {
    return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
  }, [])

  const fetchData = useCallback(async () => {
    setError(null)
    const token = getToken()
    try {
      const sheetsRes = await fetch(`${API_BASE_URL}/hris/driver-routes`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (sheetsRes.ok) setDriverSheets(await sheetsRes.json())
    } catch (err: any) {
      setError(err?.message || 'Failed to sync data with the server.')
    }
  }, [getToken])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!driverContextMenu) return
    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && driverContextMenuRef.current?.contains(target)) return
      setDriverContextMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDriverContextMenu(null)
    }
    const closeMenu = () => setDriverContextMenu(null)
    document.addEventListener('mousedown', closeIfOutside)
    document.addEventListener('contextmenu', closeIfOutside, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)
    return () => {
      document.removeEventListener('mousedown', closeIfOutside)
      document.removeEventListener('contextmenu', closeIfOutside, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
    }
  }, [driverContextMenu])

  useEffect(() => {
    const fontId = 'ddrm-font-dm-sans'
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link')
      link.id = fontId
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap'
      document.head.appendChild(link)
    }

    const id = 'ddrm-sheet-styles'
    let style = document.getElementById(id) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = id
      document.head.appendChild(style)
    }
    style.textContent = `
      .ddrm-page, .ddrm-page input, .ddrm-page button, .ddrm-page select, .ddrm-page textarea {
        font-family: "DM Sans", system-ui, -apple-system, sans-serif !important;
      }
      .excel-table { border-collapse: collapse; width: 100%; font-size: 13px; }
      .excel-table th { font-weight: 700; text-align: left; padding: 8px 12px; border: 1px solid var(--excel-border); background: var(--excel-header-bg); color: var(--excel-header-text); }
      .excel-table td { padding: 6px 12px; border: 1px solid var(--excel-border); color: var(--excel-cell-text); }

      .ddrm-sheet-table.excel-table {
        width: max-content !important;
        table-layout: auto;
        border-collapse: collapse;
        border-spacing: 0;
        font-size: 12px;
        border: 1px solid ${isLight ? '#0f172a' : '#e2e8f0'};
      }
      .ddrm-sheet-table thead th {
        position: sticky; z-index: 5;
        font-size: 10px; font-weight: 800; letter-spacing: 0.05em;
        text-transform: uppercase; white-space: nowrap;
        padding: 8px 10px !important; text-align: center;
        border: 1px solid ${isLight ? '#0f172a' : '#e2e8f0'} !important;
        background: var(--excel-header-bg);
      }
      .ddrm-sheet-table thead tr:first-child th { top: 0; z-index: 6; }
      .ddrm-sheet-table thead tr:nth-child(2) th { top: 32px; z-index: 5; }
      .ddrm-sheet-table td {
        padding: 4px 8px !important; vertical-align: middle;
        overflow: visible;
        height: 48px;
        border: 1px solid ${isLight ? '#0f172a' : '#e2e8f0'} !important;
        white-space: nowrap;
      }
      .ddrm-sheet-table th.ddrm-site-edge-l,
      .ddrm-sheet-table td.ddrm-site-edge-l {
        border-left: 2.5px solid var(--ddrm-site-line) !important;
        padding-left: 12px !important;
      }
      .ddrm-sheet-table th.ddrm-site-edge-r,
      .ddrm-sheet-table td.ddrm-site-edge-r {
        border-right: 2.5px solid var(--ddrm-site-line) !important;
        padding-right: 12px !important;
      }
      .ddrm-sheet-table thead th.ddrm-site-edge-l,
      .ddrm-sheet-table thead th.ddrm-site-edge-r {
        border-top: 1px solid ${isLight ? '#0f172a' : '#e2e8f0'} !important;
        border-bottom: 1px solid ${isLight ? '#0f172a' : '#e2e8f0'} !important;
      }
      .ddrm-sheet-table input {
        display: block; box-sizing: border-box;
        width: auto; min-width: 100%;
        background: transparent; border: 0; outline: none;
        font-family: "DM Sans", system-ui, sans-serif !important;
        font-size: 12px; font-weight: 700; line-height: 1.25;
        padding: 6px 6px; border-radius: 5px;
        text-align: center; min-height: 34px;
        white-space: nowrap; overflow: visible;
      }
      .ddrm-sheet-table input.ddrm-date {
        text-align: left; font-weight: 800;
        min-width: 3.75rem; max-width: 4.75rem;
        padding-left: 2px !important; padding-right: 2px !important;
      }
      .ddrm-sheet-table input.ddrm-cx { text-align: left; font-weight: 800; min-width: 11rem; }
      .ddrm-sheet-table input.ddrm-time { min-width: 3.75rem; max-width: 5rem; }
      .ddrm-sheet-table input.ddrm-base-time {
        min-width: 3.25rem; max-width: 4.5rem;
        padding-left: 2px !important; padding-right: 2px !important;
      }
      .ddrm-sheet-table input.ddrm-idle { min-width: 5.75rem; }
      .ddrm-sheet-table th.ddrm-col-date,
      .ddrm-sheet-table td.ddrm-col-date {
        text-align: left !important;
        padding-left: 4px !important;
        padding-right: 2px !important;
      }
      .ddrm-sheet-table th.ddrm-col-sched,
      .ddrm-sheet-table td.ddrm-col-sched {
        padding-left: 2px !important;
        padding-right: 4px !important;
      }
      .ddrm-sheet-table input:focus {
        background: rgba(16,185,129,0.08);
        box-shadow: 0 0 0 1.5px rgba(16,185,129,0.45);
      }
      .ddrm-sheet-table textarea.ddrm-remarks {
        display: block; box-sizing: border-box;
        width: 100%; min-width: 15rem; min-height: 44px;
        background: transparent; border: 0; outline: none; resize: vertical;
        font-family: "DM Sans", system-ui, sans-serif !important;
        font-size: 12px; font-weight: 600; line-height: 1.3;
        padding: 6px 8px; border-radius: 5px;
        text-align: left;
      }
      .ddrm-sheet-table textarea.ddrm-remarks:focus {
        background: rgba(16,185,129,0.08);
        box-shadow: 0 0 0 1.5px rgba(16,185,129,0.45);
      }
      .ddrm-scroll-x {
        overflow: auto;
        cursor: grab;
        scrollbar-gutter: stable;
        scrollbar-width: auto;
        scrollbar-color: #64748b #e2e8f0;
      }
      .ddrm-scroll-x.is-dragging,
      .ddrm-scroll-x:active { cursor: grabbing; }
      .ddrm-scroll-x::-webkit-scrollbar {
        height: 22px;
        width: 22px;
      }
      .ddrm-scroll-x::-webkit-scrollbar-track {
        background: ${isLight ? '#cbd5e1' : '#0F1A2E'};
        border-radius: 12px;
        margin: 0 4px;
      }
      .ddrm-scroll-x::-webkit-scrollbar-thumb {
        background: ${isLight ? '#475569' : '#7A95B8'};
        border-radius: 12px;
        border: 3px solid ${isLight ? '#cbd5e1' : '#0F1A2E'};
        min-width: 80px;
      }
      .ddrm-scroll-x::-webkit-scrollbar-thumb:hover {
        background: #10B981;
      }
      .ddrm-scroll-x::-webkit-scrollbar-thumb:active {
        background: #059669;
      }
      .ddrm-ledger-table.excel-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid ${isLight ? '#0f172a' : '#e2e8f0'};
      }
      .ddrm-ledger-table thead th {
        font-size: 11px; font-weight: 800; letter-spacing: 0.06em;
        text-transform: uppercase; padding: 14px 16px !important;
        border: 1px solid ${isLight ? '#0f172a' : '#e2e8f0'} !important;
        background: ${isLight ? '#f8fafc' : '#0F1A2E'} !important;
        color: ${isLight ? '#64748b' : '#7A95B8'} !important;
        position: sticky; top: 0; z-index: 2;
      }
      .ddrm-ledger-table tbody td {
        font-size: 14px; font-weight: 600;
        padding: 18px 16px !important;
        height: 64px;
        border: 1px solid ${isLight ? '#0f172a' : '#e2e8f0'} !important;
        vertical-align: middle;
      }
      .ddrm-ledger-table tbody tr:last-child td {
        border-bottom: 1px solid ${isLight ? '#0f172a' : '#e2e8f0'} !important;
      }
      .ddrm-meta-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 12px 16px;
      }
      @media (max-width: 1280px) {
        .ddrm-meta-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }
      @media (max-width: 768px) {
        .ddrm-meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .ddrm-meta-field label {
        display: block; margin-bottom: 6px;
        font-size: 11px; font-weight: 800; letter-spacing: 0.08em;
        text-transform: uppercase; opacity: 0.65;
      }
      .ddrm-meta-field input {
        width: 100%; box-sizing: border-box;
        border: none !important; border-radius: 0 !important;
        border-bottom: 2px solid var(--excel-border) !important;
        background: transparent !important;
        padding: 8px 2px 10px !important;
        font-size: 16px !important; font-weight: 700 !important;
        min-height: 44px; outline: none;
      }
      .ddrm-meta-field input:focus {
        border-bottom-color: #10B981 !important;
      }
      .ddrm-footer-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px 16px;
      }
      @media (max-width: 900px) {
        .ddrm-footer-grid { grid-template-columns: 1fr; }
      }
    `
  }, [isLight])

  const openSheet = (sheet: any) => {
    const rows = sheet.rows || []
    const maxSites = Math.max(
      3,
      ...rows.map((r: any) => (Array.isArray(r.sites) ? r.sites.length : 0)),
    )
    setSiteCount(Math.min(6, maxSites))
    setEditingSheet(recomputeAllIdleTimes(sheet))
    setView('sheet')
  }

  const closeSheet = () => {
    setEditingSheet(null)
    setView('ledger')
  }

  const handleScanDriverSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setScanning(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)

    try {
      const token = getToken()
      const res = await fetch(`${API_BASE_URL}/hris/driver-routes/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (res.ok) {
        const data = await res.json()
        if (data.error) {
          alert(data.error)
        } else {
          openSheet({
            dateFiled: data.dateFiled || new Date().toISOString().substring(0, 10),
            filedBy: data.filedBy || '',
            driverName: (data.driverName || '').toUpperCase(),
            position: data.position || 'Driver',
            branch: (data.branch || '').toUpperCase(),
            cutOffPeriod: data.cutOffPeriod || '',
            validatedBy: data.validatedBy || '',
            totalApprovedOt: data.totalApprovedOt || '',
            remarksOic: data.remarksOic || '',
            idleTimeRemarks: data.idleTimeRemarks || '',
            rows: (data.rows || []).map((r: any) => ({
              logDate: r.logDate || '',
              postedSchedule: r.postedSchedule || '',
              bioTimeIn: r.bioTimeIn || '',
              bioTimeOut: r.bioTimeOut || '',
              departureTime: r.departureTime || '',
              arrivalTime: r.arrivalTime || '',
              sites: r.sites || [],
              remarks: r.remarks || '',
            })),
          })
        }
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || err.message || `Scan failed (HTTP ${res.status})`)
      }
    } catch (err: any) {
      alert('Error scanning sheet: ' + err.message)
    } finally {
      setScanning(false)
      if (driverFileInputRef.current) driverFileInputRef.current.value = ''
    }
  }

  const handleSaveDriverSheet = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!editingSheet) return

    setSaving(true)
    const token = getToken()
    const url = editingSheet.id
      ? `${API_BASE_URL}/hris/driver-routes/${editingSheet.id}`
      : `${API_BASE_URL}/hris/driver-routes/save`
    const method = editingSheet.id ? 'PUT' : 'POST'
    const payload = {
      ...editingSheet,
      driverName: (editingSheet.driverName || '').toUpperCase(),
      branch: (editingSheet.branch || '').toUpperCase(),
    }

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        closeSheet()
        fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || err.message || 'Failed to save sheet')
      }
    } catch (err: any) {
      alert('Error saving sheet: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDriverSheet = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this driver route sheet and all its logs?')) return
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/driver-routes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        fetchData()
      } else {
        alert('Failed to delete sheet')
      }
    } catch (err: any) {
      alert('Error deleting sheet: ' + err.message)
    }
  }

  const handleViewSheetDetails = async (id: string) => {
    setLoadingSheet(true)
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/driver-routes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const sheetData = data.sheet
        const logs = data.logs.map((l: any) => {
          try {
            return {
              ...l,
              sites: l.sitesJson ? JSON.parse(l.sitesJson) : [],
            }
          } catch {
            return { ...l, sites: [] }
          }
        })
        sheetData.rows = logs
        openSheet(sheetData)
      } else {
        alert('Failed to fetch details')
      }
    } catch (err: any) {
      alert('Error fetching details: ' + err.message)
    } finally {
      setLoadingSheet(false)
    }
  }

  const updateField = (key: string, value: string) => {
    if (!editingSheet) return
    setEditingSheet({ ...editingSheet, [key]: value })
  }

  const updateRowField = (rIdx: number, key: string, value: string) => {
    if (!editingSheet) return
    const newRows = [...editingSheet.rows]
    newRows[rIdx] = { ...newRows[rIdx], [key]: value }
    setEditingSheet({ ...editingSheet, rows: newRows })
  }

  const updateSiteField = (rIdx: number, sIdx: number, key: string, value: string) => {
    if (!editingSheet) return
    const newRows = [...editingSheet.rows]
    const sites = [...(newRows[rIdx].sites || [])]
    while (sites.length <= sIdx) sites.push(emptySite())
    const next = { ...sites[sIdx], [key]: value }
    if (key === 'arrival' || key === 'departure') {
      next.idleTime = computeIdleFromArrivalDeparture(next.arrival, next.departure)
    }
    sites[sIdx] = next
    newRows[rIdx] = { ...newRows[rIdx], sites }
    setEditingSheet({ ...editingSheet, rows: newRows })
  }

  const addDayRow = () => {
    if (!editingSheet) return
    setEditingSheet({ ...editingSheet, rows: [...(editingSheet.rows || []), emptyRow()] })
  }

  const removeDayRow = (rIdx: number) => {
    if (!editingSheet) return
    if ((editingSheet.rows || []).length <= 1) return
    const newRows = editingSheet.rows.filter((_: any, i: number) => i !== rIdx)
    setEditingSheet({ ...editingSheet, rows: newRows })
  }

  const onSheetScrollPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = sheetScrollRef.current
    if (!el) return
    const target = e.target as HTMLElement
    if (target.closest('input, button, textarea, select, a, label')) return
    dragScrollRef.current = {
      active: true,
      startX: e.clientX,
      startLeft: el.scrollLeft,
      moved: false,
    }
    el.classList.add('is-dragging')
    el.setPointerCapture?.(e.pointerId)
  }

  const onSheetScrollPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = sheetScrollRef.current
    const drag = dragScrollRef.current
    if (!el || !drag.active) return
    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > 3) drag.moved = true
    el.scrollLeft = drag.startLeft - dx
  }

  const onSheetScrollPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = sheetScrollRef.current
    const drag = dragScrollRef.current
    if (!el) return
    drag.active = false
    el.classList.remove('is-dragging')
    try { el.releasePointerCapture?.(e.pointerId) } catch { /* ignore */ }
  }

  const filteredSheets = driverSheets.filter(s => {
    const q = searchQuery.toLowerCase()
    return (s.driverName || '').toLowerCase().includes(q) ||
      (s.branch && s.branch.toLowerCase().includes(q)) ||
      (s.cutOffPeriod && s.cutOffPeriod.toLowerCase().includes(q))
  })

  const siteLabels = useMemo(() => SITE_TONES.slice(0, siteCount), [siteCount])

  const fieldStyle = {
    backgroundColor: inputBg,
    border: `1px solid ${inputBorder}`,
    color: textPrimary,
  }

  return (
    <div
      className="ddrm-page flex flex-col gap-1 flex-1 min-h-0 h-full w-full"
      style={{
        fontFamily: '"DM Sans", system-ui, sans-serif',
        backgroundColor: pageBg,
        color: textPrimary,
        ['--excel-border' as any]: border,
        ['--excel-header-bg' as any]: isLight ? '#f1f5f9' : '#0F1A2E',
        ['--excel-header-text' as any]: textPrimary,
        ['--excel-cell-text' as any]: textPrimary,
      }}
    >
      {/* ── Page header (ledger only) ── */}
      {view === 'ledger' && (
      <div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-2 py-1.5 shrink-0"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 8 }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="md:hidden p-2 rounded-lg"
            style={{ color: textMuted, backgroundColor: softPanel }}
            onClick={() => setSidebarOpen?.(true)}
          >
            <Menu className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-2 leading-none">
              <Route className="w-6 h-6" style={{ color: excelGreen }} />
              DDRM
            </h2>
            <p className="text-sm mt-1 font-semibold" style={{ color: textMuted }}>
              Drivers Daily Route Monitoring &amp; Overtime
            </p>
          </div>
        </div>
      </div>
      )}

      {error && (
        <div
          className="flex items-center gap-3 p-3 rounded-lg shrink-0"
          style={{
            backgroundColor: isLight ? '#fef2f2' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${isLight ? '#fecaca' : '#7f1d1d'}`,
            color: isLight ? '#dc2626' : '#f87171',
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm font-bold">{error}</span>
        </div>
      )}

      {/* ══ LEDGER VIEW ═══════════════════════════════════════════ */}
      {view === 'ledger' && (
        <div className="overflow-hidden flex flex-col flex-1 min-h-0" style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 8 }}>
          <div className="px-2 py-2 flex flex-col md:flex-row items-center justify-between gap-2 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3.5 top-3 w-4 h-4" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search driver, branch, cut-off…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]/40"
                style={fieldStyle}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={driverFileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleScanDriverSheet}
              />
              <button
                onClick={() => driverFileInputRef.current?.click()}
                disabled={scanning || loadingSheet}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/25 transition-all disabled:opacity-50"
              >
                {scanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Scanning…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Import Scan
                  </>
                )}
              </button>
              <button
                onClick={() => openSheet(blankSheet())}
                disabled={loadingSheet}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-[#10B981] text-white hover:opacity-90 transition-all shadow-md disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Add Sheet
              </button>
            </div>
          </div>

          <div className="overflow-x-auto flex-1 ddrm-scroll-x">
            <table className="excel-table ddrm-ledger-table">
              <thead>
                <tr>
                  <th>Driver Name</th>
                  <th>Branch</th>
                  <th>Position</th>
                  <th>Cut-Off Period</th>
                  <th>Date Filed</th>
                  <th>Validated By</th>
                  <th>Total OT</th>
                </tr>
              </thead>
              <tbody>
                {loadingSheet && (
                  <tr>
                    <td colSpan={7} className="text-center py-10">
                      <Loader2 className="w-5 h-5 animate-spin inline mr-2" style={{ color: excelGreen }} />
                      <span className="text-sm font-semibold" style={{ color: textMuted }}>Opening sheet…</span>
                    </td>
                  </tr>
                )}
                {!loadingSheet && filteredSheets.map((s, idx) => {
                  const isMenuOpen = driverContextMenu?.sheet?.id === s.id
                  const rowBg = isMenuOpen
                    ? (isLight ? '#ecfdf5' : '#111827')
                    : (idx % 2 === 0 ? (isLight ? '#ffffff' : '#0A1120') : (isLight ? '#f8fafc' : '#0d1626'))
                  const rowHoverBg = isLight ? '#f0fdf4' : '#0f1e36'
                  return (
                    <tr
                      key={s.id}
                      onContextMenu={e => {
                        e.preventDefault()
                        setDriverContextMenu({ x: e.clientX, y: e.clientY, sheet: s })
                      }}
                      onDoubleClick={() => handleViewSheetDetails(s.id)}
                      style={{ backgroundColor: rowBg, cursor: 'pointer' }}
                      onMouseEnter={e => {
                        e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => {
                          td.style.backgroundColor = rowHoverBg
                        })
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => {
                          td.style.backgroundColor = rowBg
                        })
                      }}
                      className="transition-colors"
                      title="Double-click to open · Right-click for actions"
                    >
                      <td className="font-extrabold uppercase tracking-wide" style={{ color: textPrimary }}>
                        {(s.driverName || '—').toUpperCase()}
                      </td>
                      <td className="font-extrabold uppercase tracking-wide" style={{ color: excelGreen }}>
                        {(s.branch || '—').toUpperCase()}
                      </td>
                      <td style={{ color: textMuted }}>{(s.position || '—')}</td>
                      <td className="font-bold" style={{ color: textPrimary }}>{s.cutOffPeriod || '—'}</td>
                      <td style={{ color: textMuted }}>
                        {s.dateFiled ? new Date(s.dateFiled).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ color: textMuted }}>{s.validatedBy || '—'}</td>
                      <td className="font-extrabold" style={{ color: textPrimary }}>
                        {s.totalApprovedOt || '—'}
                      </td>
                    </tr>
                  )
                })}
                {!loadingSheet && driverSheets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-14" style={{ color: textMuted }}>
                      <div className="flex flex-col items-center gap-2">
                        <MapPin className="w-8 h-8 opacity-40" />
                        <span className="text-base font-bold">No driver sheets yet</span>
                        <span className="text-sm">Import a scan or add a blank sheet to get started.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ FULL SHEET VIEW ═══════════════════════════════════════ */}
      {view === 'sheet' && editingSheet && (
        <form
          onSubmit={handleSaveDriverSheet}
          className="overflow-hidden flex flex-col flex-1 min-h-0"
          style={{ backgroundColor: cardBg, borderRadius: 10 }}
        >
          {/* Clean top bar */}
          <div
            className="shrink-0 px-3 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3"
            style={{ borderBottom: `1px solid ${border}` }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="md:hidden p-2 rounded-lg shrink-0"
                style={{ color: textMuted, backgroundColor: softPanel }}
                onClick={() => setSidebarOpen?.(true)}
              >
                <Menu className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={closeSheet}
                className="p-2 rounded-lg shrink-0 transition-colors"
                style={{ backgroundColor: softPanel, color: textPrimary }}
                title="Back to ledger"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest"
                    style={{ backgroundColor: `${excelGreen}18`, color: excelGreen }}
                  >
                    {editingSheet.id ? 'Editing' : 'New'}
                  </span>
                  <h3 className="text-xl font-extrabold uppercase tracking-tight truncate" style={{ color: textPrimary }}>
                    {(editingSheet.driverName || 'UNNAMED DRIVER').toUpperCase()}
                  </h3>
                </div>
                <p className="text-sm font-semibold mt-0.5 truncate" style={{ color: textMuted }}>
                  {[editingSheet.branch ? String(editingSheet.branch).toUpperCase() : null, editingSheet.cutOffPeriod, editingSheet.position]
                    .filter(Boolean)
                    .join('  ·  ') || 'Route sheet details'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                style={{ backgroundColor: softPanel }}
              >
                <MapPin className="w-4 h-4" style={{ color: textMuted }} />
                <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: textMuted }}>Sites</span>
                <button
                  type="button"
                  disabled={siteCount <= 1}
                  onClick={() => setSiteCount(c => Math.max(1, c - 1))}
                  className="w-7 h-7 rounded-md text-sm font-extrabold disabled:opacity-30"
                  style={{ color: textPrimary, backgroundColor: cardBg }}
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-extrabold">{siteCount}</span>
                <button
                  type="button"
                  disabled={siteCount >= SITE_TONES.length}
                  onClick={() => setSiteCount(c => Math.min(SITE_TONES.length, c + 1))}
                  className="w-7 h-7 rounded-md text-sm font-extrabold disabled:opacity-30"
                  style={{ color: textPrimary, backgroundColor: cardBg }}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={addDayRow}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-sm font-extrabold"
                style={{ backgroundColor: softPanel, color: textPrimary }}
              >
                <Rows3 className="w-4 h-4" /> Add Day
              </button>
              <button
                type="button"
                onClick={closeSheet}
                className="px-3.5 py-2.5 rounded-lg text-sm font-extrabold"
                style={{ color: textMuted }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-extrabold text-white bg-[#10B981] hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>

          {/* Clean meta headers */}
          <div className="shrink-0 px-4 py-4" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="ddrm-meta-grid">
              {[
                { key: 'driverName', label: 'Driver Name', upper: true, required: true },
                { key: 'branch', label: 'Branch', upper: true },
                { key: 'position', label: 'Position' },
                { key: 'filedBy', label: 'Filed By' },
                { key: 'dateFiled', label: 'Date Filed', type: 'date' },
                { key: 'cutOffPeriod', label: 'Cut-Off Period', placeholder: 'July 1 – July 15' },
                { key: 'validatedBy', label: 'Validated By' },
              ].map(f => (
                <div key={f.key} className="ddrm-meta-field">
                  <label style={{ color: textMuted }}>{f.label}</label>
                  <input
                    type={f.type || 'text'}
                    required={!!f.required}
                    placeholder={f.placeholder}
                    value={f.upper ? (editingSheet[f.key] || '').toUpperCase() : (editingSheet[f.key] || '')}
                    onChange={e => updateField(f.key, f.upper ? e.target.value.toUpperCase() : e.target.value)}
                    className={f.upper ? 'uppercase tracking-wide' : ''}
                    style={{ color: textPrimary }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Route table — thick scrollbar + drag to scroll */}
          <div
            ref={sheetScrollRef}
            className="ddrm-scroll-x flex-1 min-h-0"
            onPointerDown={onSheetScrollPointerDown}
            onPointerMove={onSheetScrollPointerMove}
            onPointerUp={onSheetScrollPointerUp}
            onPointerCancel={onSheetScrollPointerUp}
          >
            <table className="excel-table ddrm-sheet-table">
              <colgroup>
                <col style={{ width: 32, minWidth: 32 }} />
                <col style={{ width: 58, minWidth: 58 }} />
                <col style={{ width: 56, minWidth: 56 }} />
                <col style={{ width: 52, minWidth: 52 }} />
                <col style={{ width: 52, minWidth: 52 }} />
                <col style={{ width: 52, minWidth: 52 }} />
                <col style={{ width: 52, minWidth: 52 }} />
                {siteLabels.flatMap((_, i) => [
                  <col key={`cx-${i}`} style={{ minWidth: 180 }} />,
                  <col key={`arr-${i}`} style={{ minWidth: 88 }} />,
                  <col key={`dep-${i}`} style={{ minWidth: 88 }} />,
                  <col key={`idle-${i}`} style={{ minWidth: 96 }} />,
                ])}
                <col style={{ minWidth: 240 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E' }} />
                  <th className="ddrm-col-date" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted }}>Date</th>
                  <th className="ddrm-col-sched" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted }}>Sched</th>
                  <th style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted }}>In</th>
                  <th style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted }}>Out</th>
                  <th style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted }}>Dep</th>
                  <th style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted }}>Arr</th>
                  {siteLabels.map((tone) => (
                    <th
                      key={tone.label}
                      colSpan={4}
                      className="ddrm-site-edge-l ddrm-site-edge-r"
                      style={{
                        backgroundColor: tone.bg,
                        color: tone.color,
                        ['--ddrm-site-line' as any]: tone.color,
                      }}
                    >
                      {tone.label} SITE
                    </th>
                  ))}
                  <th
                    rowSpan={2}
                    style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted }}
                  >
                    Remarks
                  </th>
                </tr>
                <tr>
                  <th style={{ backgroundColor: isLight ? '#ffffff' : '#0A1120' }} />
                  <th colSpan={6} style={{ backgroundColor: isLight ? '#ffffff' : '#0A1120' }} />
                  {siteLabels.map(tone => (
                    <Fragment key={`${tone.label}-sub`}>
                      <th
                        className="ddrm-site-edge-l"
                        style={{ backgroundColor: tone.bg, color: tone.color, ['--ddrm-site-line' as any]: tone.color }}
                      >
                        CX
                      </th>
                      <th style={{ backgroundColor: tone.bg, color: tone.color }}>Arr</th>
                      <th style={{ backgroundColor: tone.bg, color: tone.color }}>Dep</th>
                      <th
                        className="ddrm-site-edge-r"
                        style={{ backgroundColor: tone.bg, color: tone.color, ['--ddrm-site-line' as any]: tone.color }}
                      >
                        Idle
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(editingSheet.rows || []).map((row: any, rIdx: number) => {
                  const rowBg = rIdx % 2 === 0
                    ? (isLight ? '#ffffff' : '#0A1120')
                    : (isLight ? '#fafbfc' : '#0c1422')
                  return (
                    <tr key={rIdx} style={{ backgroundColor: rowBg }}>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => removeDayRow(rIdx)}
                          className="p-1.5 rounded-md opacity-35 hover:opacity-100 transition-opacity"
                          style={{ color: isLight ? '#dc2626' : '#f87171' }}
                          title="Remove day"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="ddrm-col-date">
                        <input
                          className="ddrm-date"
                          value={row.logDate || ''}
                          onChange={e => updateRowField(rIdx, 'logDate', e.target.value)}
                          style={{ color: textPrimary }}
                          placeholder="Date"
                        />
                      </td>
                      <td className="ddrm-col-sched">
                        <input
                          className="ddrm-base-time"
                          value={row.postedSchedule || ''}
                          onChange={e => updateRowField(rIdx, 'postedSchedule', e.target.value)}
                          style={{ color: textPrimary }}
                          placeholder="7:00"
                        />
                      </td>
                      <td>
                        <input
                          className="ddrm-base-time"
                          value={row.bioTimeIn || ''}
                          onChange={e => updateRowField(rIdx, 'bioTimeIn', e.target.value)}
                          style={{ color: textPrimary }}
                        />
                      </td>
                      <td>
                        <input
                          className="ddrm-base-time"
                          value={row.bioTimeOut || ''}
                          onChange={e => updateRowField(rIdx, 'bioTimeOut', e.target.value)}
                          style={{ color: textPrimary }}
                        />
                      </td>
                      <td>
                        <input
                          className="ddrm-base-time"
                          value={row.departureTime || ''}
                          onChange={e => updateRowField(rIdx, 'departureTime', e.target.value)}
                          style={{ color: textPrimary }}
                        />
                      </td>
                      <td>
                        <input
                          className="ddrm-base-time"
                          value={row.arrivalTime || ''}
                          onChange={e => updateRowField(rIdx, 'arrivalTime', e.target.value)}
                          style={{ color: textPrimary }}
                        />
                      </td>
                      {siteLabels.map((tone, sIdx) => {
                        const site = row.sites?.[sIdx] || emptySite()
                        const line = { ['--ddrm-site-line' as any]: tone.color }
                        return (
                          <Fragment key={sIdx}>
                            <td className="ddrm-site-edge-l" style={line}>
                              <input
                                className="ddrm-cx"
                                value={site.cxName || ''}
                                onChange={e => updateSiteField(rIdx, sIdx, 'cxName', e.target.value)}
                                style={{ color: textPrimary }}
                                placeholder="CX"
                                size={Math.max(12, (site.cxName || '').length + 2)}
                              />
                            </td>
                            <td>
                              <input
                                className="ddrm-time"
                                value={site.arrival || ''}
                                onChange={e => updateSiteField(rIdx, sIdx, 'arrival', e.target.value)}
                                style={{ color: textPrimary }}
                                size={Math.max(6, (site.arrival || '').length + 1)}
                              />
                            </td>
                            <td>
                              <input
                                className="ddrm-time"
                                value={site.departure || ''}
                                onChange={e => updateSiteField(rIdx, sIdx, 'departure', e.target.value)}
                                style={{ color: textPrimary }}
                                size={Math.max(6, (site.departure || '').length + 1)}
                              />
                            </td>
                            <td className="ddrm-site-edge-r" style={line}>
                              <input
                                className="ddrm-idle"
                                value={site.idleTime || ''}
                                readOnly
                                title="Auto: DEP − ARR"
                                placeholder="—"
                                style={{ color: textMuted, cursor: 'default' }}
                                size={Math.max(7, (site.idleTime || '').length + 2)}
                              />
                            </td>
                          </Fragment>
                        )
                      })}
                      <td>
                        <textarea
                          className="ddrm-remarks"
                          value={row.remarks || ''}
                          onChange={e => updateRowField(rIdx, 'remarks', e.target.value)}
                          style={{ color: textPrimary }}
                          placeholder="Installer name, reason for delay, etc."
                          rows={2}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Clean footer */}
          <div className="shrink-0 px-4 py-4" style={{ borderTop: `1px solid ${border}` }}>
            <div className="ddrm-footer-grid">
              {[
                { key: 'totalApprovedOt', label: 'Total Approved OT' },
                { key: 'remarksOic', label: 'Remarks of OIC/BC' },
                { key: 'idleTimeRemarks', label: 'Idle Time Remarks' },
              ].map(f => (
                <div key={f.key} className="ddrm-meta-field">
                  <label style={{ color: textMuted }}>{f.label}</label>
                  <input
                    type="text"
                    value={editingSheet[f.key] || ''}
                    onChange={e => updateField(f.key, e.target.value)}
                    style={{ color: textPrimary }}
                  />
                </div>
              ))}
            </div>
          </div>
        </form>
      )}

      {/* Ledger context menu */}
      {view === 'ledger' && driverContextMenu && (() => {
        const menuW = 180
        const menuH = 96
        const leftPos = driverContextMenu.x + menuW > window.innerWidth
          ? Math.max(10, window.innerWidth - menuW - 10)
          : driverContextMenu.x
        const topPos = driverContextMenu.y + menuH > window.innerHeight
          ? Math.max(10, window.innerHeight - menuH - 10)
          : driverContextMenu.y
        return (
          <div
            ref={driverContextMenuRef}
            className="fixed z-[200]"
            style={{ top: topPos, left: leftPos }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            >
              <div
                className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider truncate"
                style={{ color: textMuted, borderBottom: `1px solid ${border}` }}
              >
                {(driverContextMenu.sheet.driverName || 'Driver').toUpperCase()}
              </div>
              <button
                className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors"
                style={{ color: textPrimary }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = inputBg }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
                onClick={() => {
                  handleViewSheetDetails(driverContextMenu.sheet.id)
                  setDriverContextMenu(null)
                }}
              >
                <Eye className="w-3.5 h-3.5" style={{ color: textMuted }} /> Open sheet
              </button>
              <button
                className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors"
                style={{ color: isLight ? '#dc2626' : '#f87171' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = inputBg }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
                onClick={() => {
                  const id = driverContextMenu.sheet.id
                  setDriverContextMenu(null)
                  handleDeleteDriverSheet(id)
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete sheet
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
