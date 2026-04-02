import { useState, useEffect } from 'react'
import { Search, Filter, MoreVertical, Building, User as UserIcon, Mail, Phone, RefreshCw } from 'lucide-react'
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

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      const token = sessionStorage.getItem('ashcol-token')
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
        profileImage: c.profileImage
      })))
    } catch (err) {
      console.error('Error fetching customers:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCustomers() }, [])

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg       = isLight ? '#ffffff' : '#0A1120'
  const border       = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary  = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted    = isLight ? '#64748b' : '#7A95B8'
  const rowHover     = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const theadBg      = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const inputBg      = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder  = isLight ? '#cbd5e1' : '#243452'
  const tabActiveBg  = isLight ? '#e2e8f0' : '#1E2D48'
  const tabActiveText= isLight ? '#0f172a' : '#ffffff'

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

      {/* Main Card */}
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="border rounded-2xl flex flex-col overflow-hidden shadow-sm">
        
        {/* Toolbar */}
        <div style={{ borderColor: border }} className="flex flex-col lg:flex-row justify-between items-start lg:items-center p-5 border-b gap-4">
          
          {/* Tabs */}
          <div style={{ borderColor: border, backgroundColor: inputBg }} className="flex p-1 border rounded-xl w-full lg:w-auto overflow-x-auto">
            {['all', 'active', 'inactive'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={activeTab === tab
                  ? { backgroundColor: tabActiveBg, color: tabActiveText }
                  : { color: textMuted }
                }
                className="px-5 py-2 text-sm font-bold capitalize rounded-lg transition-all shrink-0"
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div
              style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              className="flex flex-1 lg:w-64 items-center border rounded-xl px-3 py-2.5 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981] transition-all"
            >
              <Search className="w-4 h-4 mr-2" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ color: textPrimary }}
                className="bg-transparent border-none text-sm focus:outline-none w-full placeholder-slate-400"
              />
            </div>
            <button
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
              className="p-2.5 border rounded-xl hover:text-[#10B981] hover:border-[#10B981] transition-colors"
              title="Filter"
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr style={{ backgroundColor: theadBg, color: textMuted }} className="text-xs uppercase tracking-wider font-bold">
                <th style={{ borderColor: border }} className="p-4 pl-6 border-b">Customer</th>
                <th style={{ borderColor: border }} className="p-4 border-b">Contact</th>
                <th style={{ borderColor: border }} className="p-4 border-b">Location</th>
                <th style={{ borderColor: border }} className="p-4 border-b">Status</th>
                <th style={{ borderColor: border }} className="p-4 pr-6 border-b text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[#7A95B8]">Loading customers...</td>
                </tr>
              ) : filteredCustomers.length > 0 ? filteredCustomers.map((cust) => (
                <tr
                  key={cust.id}
                  style={{ borderColor: border }}
                  className="border-b transition-colors"
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = rowHover}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                >
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      {cust.profileImage ? (
                        <img
                          src={cust.profileImage}
                          alt={cust.name}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-black text-sm"
                          style={{ backgroundColor: getInitialsColor(cust.name) }}
                        >
                          {getInitials(cust.name)}
                        </div>
                      )}
                      <div>
                        <div style={{ color: textPrimary }} className="font-bold mb-0.5">{cust.name}</div>
                        <div style={{ color: textMuted }} className="text-xs font-mono">{cust.id.substring(0, 12)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      {cust.email && (
                        <div style={{ color: textMuted }} className="flex items-center gap-2 text-[13px]">
                          <Mail className="w-3.5 h-3.5" />
                          <a href={`mailto:${cust.email}`} className="hover:text-[#10B981] transition-colors">{cust.email}</a>
                        </div>
                      )}
                      {cust.phone && (
                        <div style={{ color: textMuted }} className="flex items-center gap-2 text-[13px]">
                          <Phone className="w-3.5 h-3.5" />
                          <a href={`tel:${cust.phone}`} className="hover:text-[#10B981] transition-colors">{cust.phone}</a>
                        </div>
                      )}
                      {!cust.email && !cust.phone && (
                        <span style={{ color: textMuted }} className="text-xs italic">No contact info</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div style={{ color: textPrimary }} className="font-semibold text-sm flex items-center gap-1.5">
                      {cust.city || cust.region ? (
                        <><Building className="w-3.5 h-3.5 text-blue-400" /> {[cust.city, cust.region].filter(Boolean).join(', ')}</>
                      ) : (
                        <span style={{ color: textMuted }} className="italic text-xs">Not set</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div
                      style={cust.isActive
                        ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.2)' }
                        : { color: '#64748b', backgroundColor: 'rgba(148,163,184,0.1)', borderColor: 'rgba(148,163,184,0.2)' }
                      }
                      className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold rounded-full border w-fit"
                    >
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: cust.isActive ? '#10B981' : '#64748b' }} />
                      {cust.isActive ? 'Active' : 'Inactive'}
                    </div>
                  </td>
                  <td className="p-4 pr-6 text-right">
                    <button style={{ color: textMuted }} className="p-2 hover:bg-[#10B981]/10 hover:text-[#10B981] rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <UserIcon className="w-12 h-12 text-slate-300 dark:text-[#3A5070] mb-3" />
                      <h3 style={{ color: textPrimary }} className="text-lg font-bold">No customers found</h3>
                      <p style={{ color: textMuted }} className="text-sm mt-1">Try adjusting your search or filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filteredCustomers.length > 0 && (
          <div style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : 'rgba(15,26,46,0.3)' }} className="p-4 border-t flex justify-between items-center">
            <span style={{ color: textMuted }} className="text-sm font-semibold">
              Showing {filteredCustomers.length} of {customers.length} customers
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
