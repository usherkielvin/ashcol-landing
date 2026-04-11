import { useState, useEffect, useRef } from 'react'
import { Search, Plus, RefreshCw, Shield, Mail, Phone, Building2, X, Pencil, Trash2, CheckCircle, XCircle, MoreVertical } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

interface Manager { id: string; name: string; email: string; personalEmail: string; phone: string; branchId: string | null; branchName: string | null; isActive: boolean; profileImage?: string; createdAt?: string }
interface Branch { id: string; name: string; managerId?: string | null; managerName?: string | null }

const getToken = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
const authH = () => ({ Authorization: `Bearer ${getToken()}` })
const jsonH = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` })
const initials = (n: string) => n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
const avatarColor = (n: string) => ['#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#14B8A6'][n.charCodeAt(0) % 6]

const EMPTY_FORM = { name: '', email: '', personalEmail: '', phone: '', branchId: '' }

export default function Managers() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const isAdmin = user?.role?.toLowerCase() === 'admin'

  const [managers, setManagers] = useState<Manager[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Manager | null>(null)
  const [deleting, setDeleting] = useState<Manager | null>(null)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [loadErr, setLoadErr] = useState('')

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#141C2E'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const theadBg = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const rowHover = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'

  const fetchAll = async () => {
    setLoading(true)
    setLoadErr('')
    try {
      const [mRes, bRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/managers`, { headers: authH() }),
        fetch(`${API_BASE_URL}/branches`, { headers: authH() }),
      ])
      if (mRes.ok) {
        const d = await mRes.json()
        setManagers(d?.data || [])
      }
      if (bRes.ok) {
        const d = await bRes.json()
        setBranches(d?.data || [])
      } else {
        if (bRes.status === 401 || bRes.status === 403) {
          setLoadErr('Session expired or unauthorized. Please log out and log in again.')
        } else {
          const bd = await bRes.json().catch(() => ({}))
          setLoadErr(bd?.message || 'Failed to load branches. Please refresh.')
        }
      }
    } catch {
      setLoadErr('Failed to load manager data. Please refresh.')
    } finally { setLoading(false) }
  }

  useEffect(() => { if (isAdmin) fetchAll() }, [isAdmin])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setErr('')
    setShowModal(true)
    if (branches.length === 0) fetchAll()
  }

  // Auto-generate email from branch name
  const generateEmailFromBranch = (branchName: string) => {
    const clean = branchName
      .toLowerCase()
      .replace(/\bashcol\b/g, '')
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 15)
    return `manager.${clean}@ashcol.com.ph`
  }

  const sanitizeName = (value: string) => value.replace(/[0-9]/g, '').replace(/\s{2,}/g, ' ')
  const sanitizePhone = (value: string) => value.replace(/\D/g, '').slice(0, 11)

  const openEdit = (m: Manager) => { setEditing(m); setForm({ name: m.name, email: m.email, personalEmail: m.personalEmail || '', phone: m.phone, branchId: m.branchId || '' }); setErr(''); setShowModal(true) }

  const handleResetPassword = async () => {
    if (!editing) return
    if (!confirm('Reset password for ' + editing.name + '? A new password will be sent to their personal email.')) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/managers/${editing.id}/reset-password`, { method: 'POST', headers: authH() })
      const data = await res.json()
      if (!res.ok) { setErr(data?.message || 'Failed to reset password.'); return }
      setErr('')
      alert('Password reset. New credentials sent to personal email.')
    } catch { setErr('Network error.') }
    finally { setSaving(false) }
  }

  const handleSave = async () => {
    if (!form.name || !form.email || !form.personalEmail || !form.phone) { setErr('All fields are required.'); return }

    const name = form.name.trim()
    if (!/^[A-Za-z][A-Za-z\s.'-]*$/.test(name)) {
      setErr('Name must contain letters only (no numbers).')
      return
    }

    if (!/^09\d{9}$/.test(form.phone)) {
      setErr('Phone must be 11 digits and start with 09.')
      return
    }

    setSaving(true); setErr('')
    try {
      const url = editing ? `${API_BASE_URL}/admin/managers/${editing.id}` : `${API_BASE_URL}/admin/managers`
      const method = editing ? 'PATCH' : 'POST'
      const body: any = { name: form.name, email: form.email, personalEmail: form.personalEmail, phone: form.phone, branchId: form.branchId || null }
      const res = await fetch(url, { method, headers: jsonH(), body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setErr(data?.message || 'Failed to save.'); return }
      setShowModal(false)
      fetchAll()
    } catch { setErr('Network error.') } finally { setSaving(false) }
  }

  const handleToggleActive = async (m: Manager) => {
    await fetch(`${API_BASE_URL}/admin/managers/${m.id}`, { method: 'PATCH', headers: jsonH(), body: JSON.stringify({ isActive: !m.isActive }) })
    fetchAll()
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const res = await fetch(`${API_BASE_URL}/admin/managers/${deleting.id}`, { method: 'DELETE', headers: authH() })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.message || 'Failed to delete manager')
        return
      }
      setDeleting(null)
      fetchAll()
    } catch (e) {
      alert('Network error while deleting')
    }
  }


  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  const filtered = managers.filter(m => {
    const matchesSearch = !search || 
      m.name.toLowerCase().includes(search.toLowerCase()) || 
      m.email.toLowerCase().includes(search.toLowerCase()) || 
      (m.branchName || '').toLowerCase().includes(search.toLowerCase())
    
    if (filter === 'ACTIVE') return matchesSearch && m.isActive
    if (filter === 'INACTIVE') return matchesSearch && !m.isActive
    return matchesSearch
  })

  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Shield className="w-12 h-12 text-slate-300 mb-4" />
      <h2 className="text-xl font-bold mb-1" style={{ color: textPrimary }}>Admin Only</h2>
      <p style={{ color: textMuted }} className="text-sm">Only administrators can manage managers.</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-1" style={{ color: textPrimary }}>Managers</h2>
          <p className="text-sm" style={{ color: textMuted }}>Create and manage branch managers.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }} className="flex items-center gap-2 border px-4 py-2.5 rounded-xl font-bold text-sm hover:text-[#10B981] hover:border-[#10B981] transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all">
            <Plus className="w-4 h-4" /> Add Manager
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div style={{ backgroundColor: inputBg, borderColor: inputBorder }} className="flex flex-1 max-w-md items-center border rounded-xl px-3 py-2.5 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981]">
          <Search className="w-4 h-4 mr-2 shrink-0" style={{ color: textMuted }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="bg-transparent text-sm outline-none w-full placeholder-slate-400" style={{ color: textPrimary }} />
        </div>

        <div className="flex p-1 rounded-xl border w-full md:w-fit" style={{ backgroundColor: cardBg, borderColor: border }}>
          {[
            { id: 'ALL', label: 'All', color: 'slate' },
            { id: 'ACTIVE', label: 'Active', color: 'emerald' },
            { id: 'INACTIVE', label: 'Inactive', color: 'amber' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id as any)}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === t.id 
                  ? t.id === 'ACTIVE' ? 'bg-emerald-500 text-white shadow-sm' : t.id === 'INACTIVE' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile/Tablet Card View */}
      <div className="lg:hidden flex flex-col gap-3">
        {loading ? (
          <div className="p-8 text-center" style={{ color: textMuted }}>Loading managers...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border" style={{ backgroundColor: cardBg, borderColor: border }}>
            <Shield className="w-10 h-10 opacity-20 mx-auto mb-2" style={{ color: textMuted }} />
            <p style={{ color: textMuted }} className="text-sm">No managers found</p>
          </div>
        ) : filtered.map(m => (
          <div key={m.id} className="rounded-xl border p-4 flex flex-col gap-3" style={{ backgroundColor: cardBg, borderColor: border }}>
            {/* Header: Avatar + Name + Actions */}
            <div className="flex items-start gap-3">
              {m.profileImage ? (
                <img src={m.profileImage} alt={m.name} className="w-12 h-12 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0" style={{ backgroundColor: avatarColor(m.name) }}>{initials(m.name)}</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate" style={{ color: textPrimary }}>{m.name}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button 
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setMenuPosition({
                      top: rect.bottom + window.scrollY + 4,
                      left: rect.right + window.scrollX - 176
                    })
                    setActiveDropdown(activeDropdown === m.id ? null : m.id)
                  }} 
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" 
                  style={{ color: textMuted }}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Contact Info */}
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center gap-2" style={{ color: textMuted }}><Mail className="w-4 h-4 shrink-0" /><span className="truncate">{m.email}</span></div>
              <div className="flex items-center gap-2" style={{ color: textMuted }}><Mail className="w-4 h-4 shrink-0" /><span className="truncate">{m.personalEmail}</span></div>
              {m.phone && <div className="flex items-center gap-2" style={{ color: textMuted }}><Phone className="w-4 h-4 shrink-0" />{m.phone}</div>}
            </div>
            
            {/* Branch & Status Row */}
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: border }}>
              <div>
                {m.branchName ? (
                  <div className="flex items-center gap-2 text-sm font-medium" style={{ color: textPrimary }}>
                    <Building2 className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />{m.branchName}
                  </div>
                ) : <span className="text-xs italic" style={{ color: textMuted }}>Unassigned</span>}
              </div>
              <button onClick={() => handleToggleActive(m)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${m.isActive ? 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800' : 'text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-700'}`}>
                {m.isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {m.isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-hidden rounded-2xl border shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr style={{ backgroundColor: theadBg }}>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[25%]" style={{ color: textMuted }}>Manager</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[25%]" style={{ color: textMuted }}>Contact</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[25%]" style={{ color: textMuted }}>Branch</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[15%]" style={{ color: textMuted }}>Status</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[10%]" style={{ color: textMuted + '80' }}>Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center" style={{ color: textMuted }}>Loading managers...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center">
                <div className="flex flex-col items-center gap-2">
                  <Shield className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
                  <p style={{ color: textMuted }} className="text-sm">No managers found</p>
                </div>
              </td></tr>
            ) : filtered.map(m => (
              <tr key={m.id} className="group transition-colors" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }} onMouseEnter={e => e.currentTarget.style.backgroundColor = rowHover} onMouseLeave={e => e.currentTarget.style.backgroundColor = cardBg}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {m.profileImage ? (
                      <img src={m.profileImage} alt={m.name} className="w-10 h-10 rounded-full object-cover shadow-sm ring-2 ring-slate-100 dark:ring-slate-800" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xs shadow-sm ring-2 ring-slate-100 dark:ring-slate-800" style={{ backgroundColor: avatarColor(m.name) }}>{initials(m.name)}</div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate" style={{ color: textPrimary }}>{m.name}</div>
                      <div className="text-[11px] font-medium opacity-60 truncate" style={{ color: textMuted }}>{m.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: textPrimary }}><Mail className="w-3.5 h-3.5 text-[#10B981]" /> {m.email}</div>
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: textMuted }}><Phone className="w-3.5 h-3.5" /> {m.phone || 'N/A'}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {m.branchName ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold bg-slate-50 dark:bg-slate-900/40" style={{ borderColor: border, color: textPrimary }}>
                      <Building2 className="w-3.5 h-3.5 text-[#10B981]" /> {m.branchName}
                    </div>
                  ) : <span className="text-xs italic" style={{ color: textMuted }}>Unassigned</span>}
                </td>
                <td className="px-6 py-4">
                  <button onClick={() => handleToggleActive(m)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider transition-all hover:scale-105 ${m.isActive ? 'text-emerald-500 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800' : 'text-slate-400 bg-slate-50/50 border-slate-100 dark:text-slate-500 dark:bg-slate-800/30 dark:border-slate-800'}`}>
                    {m.isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {m.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <button 
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setMenuPosition({
                        top: rect.bottom + window.scrollY + 4,
                        left: rect.right + window.scrollX - 176
                      })
                      setActiveDropdown(activeDropdown === m.id ? null : m.id)
                    }} 
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" 
                    style={{ color: textMuted }}
                    title="Actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Popup Menu (rendered outside table) ─────────────────── */}
      {activeDropdown && menuPosition && (() => {
        const manager = managers.find(m => m.id === activeDropdown)
        if (!manager) return null
        
        return (
          <div 
            className="fixed w-44 rounded-lg shadow-2xl z-[100] overflow-hidden"
            style={{ 
              backgroundColor: cardBg, 
              border: `1px solid ${border}`,
              boxShadow: isLight 
                ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' 
                : '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`
            }}
            onMouseLeave={() => {
              setActiveDropdown(null)
              setMenuPosition(null)
            }}
          >
            <button 
              onClick={() => { 
                openEdit(manager)
                setActiveDropdown(null)
                setMenuPosition(null)
              }} 
              className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-all" 
              style={{ color: textPrimary }}
            >
              <Pencil className="w-4 h-4 shrink-0" /> 
              <span>Edit</span>
            </button>
            <button 
              onClick={() => { 
                setDeleting(manager)
                setActiveDropdown(null)
                setMenuPosition(null)
              }} 
              className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 transition-all" 
              style={{ color: '#EF4444', borderTop: `1px solid ${border}` }}
            >
              <Trash2 className="w-4 h-4 shrink-0" /> 
              <span>Delete</span>
            </button>
          </div>
        )
      })()}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold" style={{ color: textPrimary }}>{editing ? 'Edit Manager' : 'Add Manager'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>
            {err && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}
            {!editing && (
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(EMPTY_FORM)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Clear</button>
              </div>
            )}
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Branch</label>
              <select
                value={form.branchId}
                onChange={e => {
                  const branchId = e.target.value
                  if (!editing) {
                    const selectedBranch = branches.find(b => b.id === branchId)
                    const autoEmail = selectedBranch ? generateEmailFromBranch(selectedBranch.name) : ''
                    setForm(p => ({ ...p, branchId, email: autoEmail }))
                  } else {
                    setForm(p => ({ ...p, branchId }))
                  }
                }}
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                <option value="">— Select Branch —</option>
                {branches.map(b => {
                  const isTaken = !!(b.managerId && (!editing || b.managerId !== editing.id))
                  return (
                    <option
                      key={b.id}
                      value={b.id}
                      disabled={isTaken}
                      className={isTaken ? 'opacity-50 italic' : ''}
                    >
                      {b.name} {isTaken ? '(Already Assigned)' : ''}
                    </option>
                  )
                })}
              </select>
              {branches.length === 0 && (
                <p className="text-xs mt-1" style={{ color: loadErr ? '#ef4444' : textMuted }}>
                  {loadErr || 'No branches loaded yet. Click Refresh and try again.'}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>email</label>
              <input
                type="email"
                value={form.email}
                disabled={!!editing}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>personal email</label>
              <input 
                type="email" 
                value={form.personalEmail} 
                onChange={e => setForm(p => ({ ...p, personalEmail: e.target.value }))} 
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all" 
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} 
              />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: sanitizeName(e.target.value) }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>phone</label>
              <input type="tel" autoComplete="off" data-lpignore="true" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: sanitizePhone(e.target.value) }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
            </div>
            {editing && (
              <div>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={saving}
                  className="w-full border border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl py-2.5 text-sm font-bold transition-all disabled:opacity-50"
                >
                  Reset Password
                </button>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 border rounded-xl py-2.5 text-sm font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-800" style={{ borderColor: inputBorder, color: textMuted }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Manager'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5 text-red-500" /></div>
              <div>
                <h3 className="font-bold" style={{ color: textPrimary }}>Delete Manager</h3>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>Remove <strong>{deleting.name}</strong>? This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)} className="flex-1 border rounded-xl py-2.5 text-sm font-bold transition-all" style={{ borderColor: inputBorder, color: textMuted }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
