import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X, Plus, Truck, Building2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import {
  API_BASE_URL, isPortalAdmin, isPortalStaffUser, isSameBaseBranch, findBranchListEntry,
  type BranchListEntry,
} from '../utils/api'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import VehicleDiaryModal from '../components/vehicles/VehicleDiaryModal'
import VehicleFormModal from '../components/vehicles/VehicleFormModal'
import VehicleCard from '../components/vehicles/VehicleCard'
import { errMsg, vehicleTheme } from '../components/vehicles/vehicleUtils'
import { fetchVehicles, deleteVehicle, type Vehicle } from '../utils/vehicleApi'

function authToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

const UNASSIGNED = 'Unassigned'
// Compact cards that wrap as many per row as fit (~5–7 on a wide desktop, 1 on a phone).
const CARD_GRID = 'repeat(auto-fill, minmax(min(100%, 232px), 1fr))'

export default function Vehicles() {
  const { theme: mode } = useTheme()
  const { user } = useAuth()
  const theme = vehicleTheme(mode === 'light')
  const { cardBg, border, textPrimary, textMuted, inputBg, inputBorder, accent } = theme

  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)
  // Anyone on staff can add/edit their own branch's vehicles (the server enforces the branch boundary);
  // removing a vehicle stays with managers.
  const canEdit = isPortalStaffUser(role)
  const canAdd = canEdit && (isAdmin || !!user?.branchId)
  const canDelete = isAdmin || role === 'manager' || role === 'oic'

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [branches, setBranches] = useState<BranchListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [diaryVehicle, setDiaryVehicle] = useState<Vehicle | null>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmDialogState | null>(null)
  const [form, setForm] = useState<{ vehicle: Vehicle | null } | null>(null)

  const loadVehicles = useCallback(async () => {
    setError('')
    try {
      setVehicles(await fetchVehicles())
    } catch (err) {
      setError(errMsg(err, 'Failed to load vehicles'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadVehicles()
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${authToken()}` } })
        if (!res.ok) return
        const data = await res.json()
        setBranches(data?.data || [])
      } catch {
        // branch list is best-effort for display/filter purposes
      }
    })()
  }, [loadVehicles])

  const branchName = useCallback((branchId: string | null) => {
    if (!branchId) return ''
    return findBranchListEntry(branchId, branches)?.name || branchId
  }, [branches])

  // Branch-account users only see their own branch's vehicles; admins/management see the whole fleet.
  const visibleVehicles = useMemo(() => {
    if (isAdmin) return vehicles
    return vehicles.filter(v => isSameBaseBranch(v.branchId, user?.branchId))
  }, [vehicles, isAdmin, user?.branchId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return visibleVehicles.filter(v => {
      if (branchFilter && v.branchId !== branchFilter) return false
      if (!q) return true
      return (
        v.name.toLowerCase().includes(q) ||
        (v.plateNumber || '').toLowerCase().includes(q) ||
        (v.brandModel || '').toLowerCase().includes(q) ||
        (v.driverName || '').toLowerCase().includes(q) ||
        branchName(v.branchId).toLowerCase().includes(q)
      )
    })
  }, [visibleVehicles, search, branchFilter, branchName])

  // Admins looking at several branches get one labelled section per branch, all using the same card grid.
  const groups = useMemo(() => {
    const byBranch = new Map<string, Vehicle[]>()
    for (const v of filtered) {
      const key = branchName(v.branchId) || UNASSIGNED
      byBranch.set(key, [...(byBranch.get(key) || []), v])
    }
    return [...byBranch.entries()]
      .map(([name, list]) => ({ name, list: [...list].sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => (a.name === UNASSIGNED ? 1 : b.name === UNASSIGNED ? -1 : a.name.localeCompare(b.name)))
  }, [filtered, branchName])

  const grouped = isAdmin && !branchFilter && groups.length > 1

  const memberBranchOptions = useMemo(
    () => (isAdmin ? branches : branches.filter(b => isSameBaseBranch(b.id, user?.branchId))),
    [branches, isAdmin, user?.branchId],
  )
  const defaultBranchId = isAdmin ? '' : (findBranchListEntry(user?.branchId, branches)?.id || user?.branchId || '')

  const handleDelete = useCallback((v: Vehicle) => {
    setConfirmModal({
      title: 'Remove Vehicle',
      message: `Remove ${v.name} from the fleet roster? This also deletes its logged expense history.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteVehicle(v.id)
          await loadVehicles()
        } catch (err) {
          setError(errMsg(err, 'Failed to remove vehicle'))
        }
      },
    })
  }, [loadVehicles])

  const openVehicle = useCallback((v: Vehicle) => setDiaryVehicle(v), [])
  const editVehicle = useCallback((v: Vehicle) => setForm({ vehicle: v }), [])

  const grid = (list: Vehicle[]) => (
    <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: CARD_GRID }}>
      {list.map(v => (
        <VehicleCard
          key={v.id}
          vehicle={v}
          branchName={branchName(v.branchId)}
          theme={theme}
          canEdit={canEdit}
          onOpen={openVehicle}
          onEdit={editVehicle}
        />
      ))}
    </div>
  )

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5 max-w-[1800px] mx-auto w-full">
      <ConfirmDialog dialog={confirmModal} onClose={() => setConfirmModal(null)} />

      {diaryVehicle && (
        <VehicleDiaryModal
          vehicle={diaryVehicle}
          branchName={branchName(diaryVehicle.branchId)}
          onEdit={canEdit ? () => { setForm({ vehicle: diaryVehicle }); setDiaryVehicle(null) } : undefined}
          onClose={() => setDiaryVehicle(null)}
        />
      )}

      {form && (
        <VehicleFormModal
          theme={theme}
          vehicle={form.vehicle}
          branches={memberBranchOptions}
          defaultBranchId={defaultBranchId}
          branchLocked={!isAdmin}
          onDelete={canDelete && form.vehicle ? () => { const v = form.vehicle!; setForm(null); handleDelete(v) } : undefined}
          onClose={() => setForm(null)}
          onSaved={async warning => {
            setForm(null)
            if (warning) setError(warning)
            await loadVehicles()
          }}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: textPrimary }}>Vehicles</h1>
          <p className="text-sm mt-1" style={{ color: textMuted }}>
            {isAdmin ? 'Fleet across all branches' : 'Your branch fleet'} · driver assignment, coding days and automated vehicle records.
          </p>
        </div>
        {canAdd && (
          <button
            onClick={() => setForm({ vehicle: null })}
            className="flex items-center gap-2 px-5 h-11 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-md"
            style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
          >
            <Plus className="w-4 h-4" /> ADD VEHICLE
          </button>
        )}
      </div>

      {/* Search / branch filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[240px] max-w-xl rounded-xl px-3.5 h-11 border transition-all focus-within:border-emerald-500" style={{ backgroundColor: cardBg, borderColor: inputBorder }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
          <input
            type="text"
            placeholder="Search name, plate, driver, branch…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm outline-none w-full"
            style={{ color: textPrimary }}
          />
          {search && <button onClick={() => setSearch('')} style={{ color: textMuted }} aria-label="Clear search"><X className="w-4 h-4" /></button>}
        </div>

        {isAdmin && (
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="rounded-xl px-4 h-11 text-xs font-semibold uppercase tracking-wider border outline-none"
            style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
          >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: CARD_GRID }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border overflow-hidden animate-pulse" style={{ backgroundColor: cardBg, borderColor: border }}>
              <div className="aspect-video" style={{ backgroundColor: inputBg }} />
              <div className="p-4 flex flex-col gap-2.5">
                <div className="h-4 w-2/3 rounded" style={{ backgroundColor: inputBg }} />
                <div className="h-3 w-1/2 rounded" style={{ backgroundColor: inputBg }} />
                <div className="h-6 w-24 rounded" style={{ backgroundColor: inputBg }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 rounded-2xl border border-dashed" style={{ borderColor: border }}>
          <Truck className="w-9 h-9 mx-auto mb-2" style={{ color: textMuted }} />
          <p className="text-sm font-semibold" style={{ color: textMuted }}>No vehicles found</p>
          <p className="text-xs mt-1" style={{ color: textMuted }}>
            {visibleVehicles.length === 0 && canAdd ? 'Add your first vehicle to get started.' : 'Try adjusting your search or filters.'}
          </p>
        </div>
      ) : grouped ? (
        <div className="flex flex-col gap-8">
          {groups.map(g => (
            <section key={g.name} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: accent }}>
                  <Building2 className="w-4 h-4" />
                </span>
                <h2 className="text-sm font-black uppercase tracking-wide" style={{ color: textPrimary }}>{g.name}</h2>
                <div className="flex-1 h-px" style={{ backgroundColor: border }} />
              </div>
              {grid(g.list)}
            </section>
          ))}
        </div>
      ) : (
        grid(filtered)
      )}
    </div>
  )
}
