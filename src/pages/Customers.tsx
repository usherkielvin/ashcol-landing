import { useState, useEffect, useRef } from 'react'
import { Search, MoreVertical, Building, User as UserIcon, Mail, Phone, RefreshCw, CheckCircle, XCircle, Pencil, Trash2, Power, X } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

interface Customer {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  region?: string
  city?: string
  isActive: boolean
  profileImage?: string
}

export default function Customers() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const MENU_WIDTH = 176

  const openCustomerActions = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (activeDropdown === id) {
      setActiveDropdown(null)
      setMenuPosition(null)
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const left = Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8)
    setMenuPosition({ top: rect.bottom + 4, left })
    setActiveDropdown(id)
  }
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState<Customer | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', city: '', region: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleToggleActive = async (cust: Customer) => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      await fetch(`${apiUrl}/admin/users/${cust.id}/toggle-active`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      })
      fetchCustomers()
    } catch {}
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      await fetch(`${apiUrl}/admin/users/${deleting.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      setDeleting(null)
      fetchCustomers()
    } catch {}
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    setSaving(true)
    setErr('')
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      const res = await fetch(`${apiUrl}/admin/users/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      })
      if (!res.ok) {
        const d = await res.json().catch(()=>({}))
        setErr(d.message || 'Failed to update')
        return
      }
      setEditing(null)
      fetchCustomers()
    } catch {
      setErr('Network error')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (cust: Customer) => {
    setEditing(cust)
    setForm({ name: cust.name, email: cust.email, phone: cust.phone || '', city: cust.city || '', region: cust.region || '' })
    setErr('')
  }

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      
      const res = await fetch(`${apiUrl}/user/all?role=CUSTOMER`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      const customersList = data?.data || data || []
      
      setCustomers(customersList.map((c: any) => ({
        id: c.id,
        name: c.name || 'Unknown',
        email: c.email || '',
        phone: c.phone || '',
        role: c.role || 'CUSTOMER',
        isActive: c.isActive !== false,
        profileImage: c.profileImage,
        region: c.region,
        city: c.city
      })))
    } catch (err) {
      console.error('Error fetching customers:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCustomers() }, [])

  useEffect(() => {
    if (!activeDropdown) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (actionMenuRef.current?.contains(t)) return
      if ((e.target as HTMLElement).closest('[data-customer-action-trigger="true"]')) return
      setActiveDropdown(null)
      setMenuPosition(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [activeDropdown])

  useEffect(() => {
    if (!activeDropdown) return
    const close = () => {
      setActiveDropdown(null)
      setMenuPosition(null)
    }
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [activeDropdown])

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg       = isLight ? '#ffffff' : '#0A1120'
  const border       = isLight ? '#e2e8f0' : '#141C2E'
  const textPrimary  = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted    = isLight ? '#64748b' : '#7A95B8'
  const rowHover     = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const theadBg      = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const inputBg      = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder  = isLight ? '#cbd5e1' : '#243452'

  const filteredCustomers = customers.filter(c => {
    if (activeTab === 'active' && !c.isActive) return false
    if (activeTab === 'inactive' && c.isActive) return false

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return c.name.toLowerCase().includes(q) ||
             c.email.toLowerCase().includes(q) ||
             c.id.toLowerCase().includes(q)
    }
    return true
  })

  const getInitialsColor = (name: string) => {
    const colors = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6']
    return colors[name.charCodeAt(0) % colors.length]
  }

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 style={{ color: textPrimary }} className="text-2xl font-bold tracking-tight mb-1">Customers</h2>
          <p style={{ color: textMuted }} className="text-sm">
            {loading ? 'Loading...' : `${customers.length} total registered customers`}
          </p>
        </div>
        <button
          onClick={fetchCustomers}
          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
          className="flex items-center gap-2 border px-4 py-2.5 rounded-xl font-bold transition-all hover:text-[#10B981] hover:border-[#10B981] text-sm shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ borderColor: border }} className="flex flex-col md:flex-row justify-between items-stretch md:items-center p-5 border rounded-2xl bg-white dark:bg-[#0A1120] gap-4 shadow-sm">
        <div style={{ backgroundColor: inputBg, borderColor: inputBorder }} className="flex flex-1 max-w-md items-center border rounded-xl px-3 py-2.5 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981]">
          <Search className="w-4 h-4 mr-2" style={{ color: textMuted }} />
          <input type="text" placeholder="Search customers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ color: textPrimary }} className="bg-transparent border-none text-sm focus:outline-none w-full placeholder-slate-400" />
        </div>

        <div className="flex p-1 rounded-xl border w-full md:w-fit" style={{ backgroundColor: cardBg, borderColor: border }}>
          {[
            { id: 'all', label: 'All', color: 'slate' },
            { id: 'active', label: 'Active', color: 'emerald' },
            { id: 'inactive', label: 'Inactive', color: 'amber' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 uppercase tracking-widest ${
                activeTab === t.id 
                  ? t.id === 'active' ? 'bg-emerald-500 text-white shadow-sm' : t.id === 'inactive' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-600 text-white shadow-sm'
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
          <div className="p-8 text-center" style={{ color: textMuted }}>Loading customers...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border" style={{ backgroundColor: cardBg, borderColor: border }}>
            <UserIcon className="w-10 h-10 opacity-20 mx-auto mb-2" style={{ color: textMuted }} />
            <p style={{ color: textMuted }} className="text-sm">No customers found</p>
          </div>
        ) : filteredCustomers.map(cust => (
          <div key={cust.id} className="rounded-xl border p-4 flex flex-col gap-3" style={{ backgroundColor: cardBg, borderColor: border }}>
            {/* Header: Avatar + Name + ID */}
            <div className="flex items-start gap-3">
              {cust.profileImage ? (
                <img src={cust.profileImage} alt={cust.name} className="w-12 h-12 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0" style={{ backgroundColor: getInitialsColor(cust.name) }}>{getInitials(cust.name)}</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate" style={{ color: textPrimary }}>{cust.name}</div>
                <div className="text-[10px] font-medium opacity-60" style={{ color: textMuted }}>ID: {cust.id}</div>
              </div>
              <button
                type="button"
                data-customer-action-trigger="true"
                onClick={(ev) => openCustomerActions(ev, cust.id)}
                style={{ color: textMuted }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
            
            {/* Contact Info */}
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center gap-2" style={{ color: textMuted }}><Mail className="w-4 h-4 shrink-0" /><span className="truncate">{cust.email}</span></div>
              {cust.phone && <div className="flex items-center gap-2" style={{ color: textMuted }}><Phone className="w-4 h-4 shrink-0" />{cust.phone}</div>}
            </div>
            
            {/* Location & Status Row */}
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: border }}>
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: textPrimary }}>
                {cust.city || cust.region ? (
                  <><Building className="w-4 h-4 shrink-0 text-blue-400" /> <span className="truncate max-w-[150px]">{[cust.city, cust.region].filter(Boolean).join(', ')}</span></>
                ) : <span className="text-xs italic" style={{ color: textMuted }}>Location not set</span>}
              </div>
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${cust.isActive ? 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800' : 'text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-700'}`}>
                {cust.isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {cust.isActive ? 'Active' : 'Inactive'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="hidden lg:block border rounded-2xl overflow-x-auto shadow-sm">
        <div className="min-w-0">
          <table className="w-full text-left">
            <thead>
              <tr style={{ backgroundColor: theadBg, color: textMuted, borderBottom: `1px solid ${border}` }} className="text-xs uppercase tracking-wider font-bold">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[25%]" style={{ color: textMuted }}>Customer</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[25%]" style={{ color: textMuted }}>Contact</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[20%]" style={{ color: textMuted }}>Location</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[15%]" style={{ color: textMuted }}>Status</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[15%] text-right" style={{ color: textMuted }}>Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center" style={{ color: textMuted }}>Loading customers...</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center" style={{ color: textMuted }}>No customers found.</td></tr>
              ) : filteredCustomers.map((cust) => (
                <tr key={cust.id} style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }} className="group transition-colors" onMouseEnter={el => el.currentTarget.style.backgroundColor = rowHover} onMouseLeave={el => el.currentTarget.style.backgroundColor = cardBg}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {cust.profileImage ? (
                        <img src={cust.profileImage} alt={cust.name} className="w-10 h-10 rounded-full object-cover shadow-sm ring-1 ring-slate-100 dark:ring-slate-800" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xs shadow-sm ring-1 ring-slate-100 dark:ring-slate-800" style={{ backgroundColor: getInitialsColor(cust.name) }}>{getInitials(cust.name)}</div>
                      )}
                      <div className="min-w-0">
                        <div style={{ color: textPrimary }} className="font-bold truncate">{cust.name}</div>
                        <div className="text-[11px] font-medium opacity-60 truncate" style={{ color: textMuted }}>ID: {cust.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5 text-xs">
                      <div className="flex items-center gap-1.5 font-semibold" style={{ color: textPrimary }}>
                        <Mail className="w-3.5 h-3.5 text-emerald-500" /> {cust.email}
                      </div>
                      <div className="flex items-center gap-1.5 font-medium" style={{ color: textMuted }}>
                        <Phone className="w-3.5 h-3.5" /> {cust.phone || 'N/A'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-bold bg-slate-50 dark:bg-slate-900/40" style={{ borderColor: border, color: textPrimary }}>
                      <Building className="w-3.5 h-3.5 text-[#10B981]" />
                      <span className="truncate">{cust.city || cust.region || '—'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleToggleActive(cust)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider transition-all hover:scale-105 ${cust.isActive ? 'text-emerald-500 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800 shadow-sm shadow-emerald-500/10' : 'text-slate-400 bg-slate-50 border-slate-100 dark:text-slate-500 dark:bg-slate-800/30 dark:border-slate-800'}`}>
                      {cust.isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {cust.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      data-customer-action-trigger="true"
                      onClick={(ev) => openCustomerActions(ev, cust.id)}
                      style={{ color: textMuted }}
                      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Footer */}
        {!loading && filteredCustomers.length > 0 && (
          <div style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : 'rgba(15,26,46,0.3)' }} className="p-4 border-t flex justify-between items-center rounded-b-2xl">
            <span style={{ color: textMuted }} className="text-[10px] font-black uppercase tracking-widest">
              {filteredCustomers.length} of {customers.length} customers listed
            </span>
          </div>
        )}
      </div>

      {activeDropdown && menuPosition && (() => {
        const cust = customers.find(c => c.id === activeDropdown)
        if (!cust) return null
        const close = () => {
          setActiveDropdown(null)
          setMenuPosition(null)
        }
        return (
          <div
            ref={actionMenuRef}
            className="fixed w-44 rounded-xl shadow-2xl z-[100] py-1 border border-slate-200 dark:border-[#243452]"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              backgroundColor: isLight ? '#ffffff' : '#0F1A2E',
              boxShadow: isLight
                ? '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)'
                : '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.4)',
            }}
          >
            <button
              type="button"
              onClick={() => { openEdit(cust); close() }}
              className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
              style={{ color: textPrimary }}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Profile
            </button>
            <button
              type="button"
              onClick={() => { handleToggleActive(cust); close() }}
              className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
              style={{ color: textPrimary }}
            >
              <Power className="w-3.5 h-3.5" /> {cust.isActive ? 'Disable' : 'Enable'}
            </button>
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
            <button
              type="button"
              onClick={() => { setDeleting(cust); close() }}
              className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete User
            </button>
          </div>
        )
      })()}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold" style={{ color: textPrimary }}>Edit Customer</h3>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>
            {err && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}
            
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Email</label>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Phone</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Region</label>
                <input value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>City</label>
                <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditing(null)} className="flex-1 border rounded-xl py-2.5 text-sm font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-800" style={{ borderColor: inputBorder, color: textMuted }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving} className="flex-1 bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                {saving ? 'Saving...' : 'Save Changes'}
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
                <h3 className="font-bold" style={{ color: textPrimary }}>Delete Customer</h3>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>Remove <strong>{deleting.name}</strong>? This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)} className="flex-1 border rounded-xl py-2.5 text-sm font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-800" style={{ borderColor: inputBorder, color: textMuted }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
