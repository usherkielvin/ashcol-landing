import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Search, X, Edit3, CalendarDays, Loader2, ClipboardList } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, fetchTicketsPage, resolveScopedBranchId } from '../utils/api'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import {
  OFFICE_TICKET_CATEGORIES,
  OFFICE_STATUS_OPTS,
  categoryDefaultServiceType,
  getCategoryLabel,
  inferCategoryFromTicket,
  type TicketCategoryValue,
} from '../constants/ticketCategories'

type OfficeTicket = {
  id: string
  title: string
  description?: string
  status: string
  ticketCategory?: string
  ticket_category?: string
  serviceType?: string
  preferredDate?: string
  preferred_date?: string
  assignedTo?: string
  assignedEmployeeName?: string
  assigned_employee_name?: string
  remarksUpdate?: string
  remarks?: string
  updatedAt?: string
  updated_at?: string
  branchId?: string
}

type StaffUser = { id: string; name: string; role?: string; branchId?: string }

function todayDateKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateToKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getPreferredDate(t: OfficeTicket) {
  return (t.preferredDate || t.preferred_date || '').split('T')[0]
}

function Field({ label, children, required, full }: {
  label: string
  children: React.ReactNode
  required?: boolean
  full?: boolean
}) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 opacity-70">
        {label}{required ? ' *' : ''}
      </label>
      {children}
    </div>
  )
}

export default function OfficeTasks() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { user } = useAuth()

  const green = '#16A34A'
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1a2844'
  const inputBg = isLight ? '#f8fafc' : '#060C18'
  const inputBorder = isLight ? '#cbd5e1' : '#1e3254'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#6B90BE'

  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const canEdit = isAdmin || isManager || role === 'staff' || role === 'employee' || role === 'oic'

  const [tickets, setTickets] = useState<OfficeTicket[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [dateFilter, setDateFilter] = useState(() => todayDateKey())
  const [modalOpen, setModalOpen] = useState(false)
  const [formSnapshot, setFormSnapshot] = useState('')
  const [form, setForm] = useState({
    id: '',
    ticketCategory: 'ADMIN_TASK' as TicketCategoryValue,
    title: '',
    description: '',
    preferredDate: todayDateKey(),
    assignedTo: '',
    status: 'PENDING',
    remarks: '',
  })

  const token = useCallback(() =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || '', [])

  const weeklyTabs = useMemo(() => {
    const tabs: { key: string; label: string; sub: string }[] = []
    const base = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      const key = formatDateToKey(d)
      const label = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })
      const sub = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      tabs.push({ key, label, sub })
    }
    return tabs
  }, [])

  const fetchTickets = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setFetchError(null)
    try {
      const ep = isAdmin ? '/tickets' : '/tickets/branch'
      const list = await fetchTicketsPage(ep, token(), { size: 300 })
      setTickets(list as OfficeTicket[])
    } catch {
      setFetchError('Failed to load office tasks.')
    } finally {
      setLoading(false)
    }
  }, [user, isAdmin, token])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  useEffect(() => {
    if (!canEdit) return
    fetch(`${API_BASE_URL}/user/all`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data || [])
        if (!Array.isArray(list)) return
        setStaff(list
          .filter((u: any) => (u.role || '').toUpperCase() !== 'CUSTOMER')
          .map((u: any) => ({
            id: u.id,
            name: u.name || u.email,
            role: u.role,
            branchId: u.branchId || u.branch_id,
          }))
          .sort((a: StaffUser, b: StaffUser) => a.name.localeCompare(b.name)))
      })
      .catch(() => {})
  }, [canEdit, token])

  const visible = useMemo(() => {
    let list = tickets.filter(t => {
      const cat = inferCategoryFromTicket(t)
      if (OFFICE_TICKET_CATEGORIES.every(c => c.value !== cat)) return false
      if (typeFilter !== 'ALL' && cat !== typeFilter) return false
      if (dateFilter && getPreferredDate(t) !== dateFilter) return false
      return true
    })
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t =>
        [t.title, t.description, t.remarks, t.remarksUpdate, t.assignedEmployeeName, t.assigned_employee_name]
          .some(v => v?.toLowerCase().includes(q)),
      )
    }
    return list
  }, [tickets, typeFilter, dateFilter, searchQuery])

  const openCreate = () => {
    const next = {
      id: '',
      ticketCategory: 'ADMIN_TASK' as TicketCategoryValue,
      title: '',
      description: '',
      preferredDate: dateFilter || todayDateKey(),
      assignedTo: '',
      status: 'PENDING',
      remarks: '',
    }
    setForm(next)
    setFormSnapshot(JSON.stringify(next))
    setModalOpen(true)
  }

  const openEdit = (t: OfficeTicket) => {
    const next = {
      id: t.id,
      ticketCategory: inferCategoryFromTicket(t) as TicketCategoryValue,
      title: t.title || '',
      description: t.description || '',
      preferredDate: getPreferredDate(t) || todayDateKey(),
      assignedTo: t.assignedTo || '',
      status: t.status || 'PENDING',
      remarks: t.remarksUpdate || t.remarks || '',
    }
    setForm(next)
    setFormSnapshot(JSON.stringify(next))
    setModalOpen(true)
  }

  const requestCloseModal = () => {
    if (JSON.stringify(form) !== formSnapshot && !confirm('Discard unsaved changes?')) return
    setModalOpen(false)
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      alert('Title is required')
      return
    }
    if (!form.preferredDate) {
      alert('Due date is required')
      return
    }
    const action = form.id ? 'Save changes to this task?' : 'Create this office task?'
    if (!confirm(action)) return

    setSaving(true)
    try {
      const category = form.ticketCategory
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || form.title.trim(),
        ticketCategory: category,
        serviceType: categoryDefaultServiceType(category),
        preferredDate: form.preferredDate,
        status: form.status,
        remarksUpdate: form.remarks.trim() || undefined,
        assignedTo: form.assignedTo || undefined,
        branchId: resolveScopedBranchId(user?.branchId || localStorage.getItem('ashcol-global-branch-id') || ''),
      }
      if (!form.id) {
        body.customerName = form.title.trim()
        body.location = 'Office task'
        body.contactPhone = 'N/A'
      }

      const res = await fetch(`${API_BASE_URL}/tickets${form.id ? `/${form.id}` : ''}`, {
        method: form.id ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(err || 'Save failed')
      }
      setModalOpen(false)
      await fetchTickets()
    } catch (e: any) {
      alert(e.message || 'Could not save task')
    } finally {
      setSaving(false)
    }
  }

  const statusStyle = (s: string) => {
    switch (s.toUpperCase()) {
      case 'COMPLETED': return { text: '#16A34A', bg: isLight ? '#f0fdf4' : 'rgba(22,163,74,0.15)' }
      case 'IN_PROGRESS': return { text: '#2563EB', bg: isLight ? '#eff6ff' : 'rgba(37,99,235,0.15)' }
      case 'CANCELLED': return { text: '#EF4444', bg: isLight ? '#fef2f2' : 'rgba(239,68,68,0.12)' }
      default: return { text: '#F59E0B', bg: isLight ? '#fffbeb' : 'rgba(245,158,11,0.12)' }
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="rounded-2xl px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm"
           style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5" style={{ color: green }} />
          <div>
            <h1 className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>Office Tasks</h1>
            <p className="text-[10px] font-semibold" style={{ color: textMuted }}>Admin, HR, payroll, claims, and other back-office work</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button type="button" onClick={openCreate}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: green }}>
              <Plus className="w-3.5 h-3.5" /> Add Task
            </button>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border min-w-[140px]"
               style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5" style={{ color: green }} />
            <input type="text" placeholder="Search..." value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   className="bg-transparent outline-none text-xs flex-1 font-medium"
                   style={{ color: textPrimary }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {weeklyTabs.map(tab => {
          const active = dateFilter === tab.key
          return (
            <button key={tab.key} type="button" onClick={() => setDateFilter(tab.key)}
                    className="flex flex-col items-center px-3 py-1.5 rounded-xl border min-w-[72px] text-[10px] font-bold"
                    style={{
                      backgroundColor: active ? green : inputBg,
                      borderColor: active ? green : inputBorder,
                      color: active ? '#fff' : textPrimary,
                    }}>
              <span>{tab.label}</span>
              <span className="opacity-80">{tab.sub}</span>
            </button>
          )
        })}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border"
             style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
          <CalendarDays className="w-3.5 h-3.5" style={{ color: textMuted }} />
          <input type="date" value={dateFilter}
                 onChange={e => setDateFilter(e.target.value)}
                 className="bg-transparent outline-none text-xs font-semibold"
                 style={{ color: textPrimary }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="text-xs font-bold rounded-lg px-2.5 py-1.5 border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
          <option value="ALL">All types</option>
          {OFFICE_TICKET_CATEGORIES.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2" style={{ color: textMuted }}>
            <Loader2 className="w-5 h-5 animate-spin" /> Loading tasks…
          </div>
        ) : fetchError ? (
          <div className="py-12 text-center text-sm font-semibold" style={{ color: '#EF4444' }}>{fetchError}</div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center text-sm font-semibold" style={{ color: textMuted }}>
            No office tasks for {dateFilter}{typeFilter !== 'ALL' ? ` · ${getCategoryLabel(typeFilter)}` : ''}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#060C18', borderBottom: `1px solid ${border}` }}>
                  {['#', 'Type', 'Title', 'Assigned To', 'Status', 'Due Date', 'Update', ''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider"
                        style={{ color: textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((t, idx) => {
                  const sc = statusStyle(t.status)
                  const assignee = t.assignedEmployeeName || t.assigned_employee_name
                  return (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${border}` }}>
                      <td className="px-3 py-2.5 text-xs font-bold" style={{ color: textMuted }}>{idx + 1}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: textPrimary }}>
                        {getCategoryLabel(inferCategoryFromTicket(t))}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold max-w-[200px]" style={{ color: textPrimary }}>
                        <span className="line-clamp-2">{t.title}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: textPrimary }}>
                        {assignee ? <EmployeeNameLink nameOrId={assignee} /> : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black"
                              style={{ color: sc.text, backgroundColor: sc.bg }}>
                          {(t.status || 'PENDING').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: textPrimary }}>
                        {getPreferredDate(t) || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-[180px] line-clamp-2" style={{ color: textMuted }}>
                        {t.remarksUpdate || t.remarks || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {canEdit && (
                          <button type="button" onClick={() => openEdit(t)}
                                  className="p-1.5 rounded-lg hover:opacity-80" style={{ color: '#6366F1' }}>
                            <Edit3 className="w-3.5 h-3.5" />
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

      {modalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
             onClick={e => e.stopPropagation()}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
               onClick={e => e.stopPropagation()}
               onMouseDown={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: textPrimary }}>
                {form.id ? 'Edit Office Task' : 'Add Office Task'}
              </h3>
              <button type="button" onClick={requestCloseModal} className="p-1.5 rounded-lg" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Task Type" required>
                  <select value={form.ticketCategory}
                          onChange={e => setForm({ ...form, ticketCategory: e.target.value as TicketCategoryValue })}
                          className="w-full rounded-lg px-3 py-2 text-xs font-semibold outline-none border"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                    {OFFICE_TICKET_CATEGORIES.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Due Date" required>
                  <input type="date" value={form.preferredDate}
                         onChange={e => setForm({ ...form, preferredDate: e.target.value })}
                         className="w-full rounded-lg px-3 py-2 text-xs font-semibold outline-none border"
                         style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                </Field>
                <Field label="Title / Summary" required full>
                  <input type="text" value={form.title}
                         onChange={e => setForm({ ...form, title: e.target.value })}
                         className="w-full rounded-lg px-3 py-2 text-xs font-semibold outline-none border"
                         style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                </Field>
                <Field label="Description" full>
                  <textarea value={form.description} rows={2}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            className="w-full rounded-lg px-3 py-2 text-xs font-semibold outline-none border resize-none"
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                </Field>
                <Field label="Assigned To">
                  <select value={form.assignedTo}
                          onChange={e => setForm({ ...form, assignedTo: e.target.value })}
                          className="w-full rounded-lg px-3 py-2 text-xs font-semibold outline-none border"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                    <option value="">— Unassigned —</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ''}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status" required>
                  <select value={form.status}
                          onChange={e => setForm({ ...form, status: e.target.value })}
                          className="w-full rounded-lg px-3 py-2 text-xs font-semibold outline-none border"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                    {OFFICE_STATUS_OPTS.map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Remarks / Update" full>
                  <textarea value={form.remarks} rows={2}
                            onChange={e => setForm({ ...form, remarks: e.target.value })}
                            className="w-full rounded-lg px-3 py-2 text-xs font-semibold outline-none border resize-none"
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                </Field>
              </div>
            </div>
            <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: `1px solid ${border}` }}>
              <button type="button" onClick={requestCloseModal}
                      className="px-4 py-2 rounded-xl text-xs font-bold border"
                      style={{ borderColor: inputBorder, color: textMuted }}>Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                      style={{ backgroundColor: green }}>
                {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
