import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Plus, Truck, Building2 } from 'lucide-react'
import FilterChipMenu from '../components/directory/FilterChipMenu'
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
// Compact cards: 2 per row on a phone, then as many as fit (~5–7 on a wide desktop).
const CARD_GRID_CLS = 'grid grid-cols-2 gap-2.5 sm:gap-3 sm:[grid-template-columns:repeat(auto-fill,minmax(min(100%,232px),1fr))]'

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

  const filtered = useMemo(
    () => visibleVehicles.filter(v => !branchFilter || v.branchId === branchFilter),
    [visibleVehicles, branchFilter],
  )

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
    <div className={`${CARD_GRID_CLS} items-stretch`}>
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
    <div className="p-3 sm:p-6 flex flex-col gap-3 sm:gap-5 max-w-[1800px] mx-auto w-full">
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

      {/* Toolbar — branch chip and Add button share one aligned row */}
      {(isAdmin || canAdd) && (
        <div className="flex items-center justify-between gap-3">
          {isAdmin ? (
            <FilterChipMenu
              icon={Building2}
              title="Filter by branch"
              value={branchFilter}
              onChange={setBranchFilter}
              tokens={{ cardBg, border, textPrimary, textMuted, inputBg, inputBorder }}
              options={[{ value: '', label: 'All Branches' }, ...branches.map(b => ({ value: b.id, label: b.name }))]}
            />
          ) : <span />}
          {canAdd && (
            <button
              onClick={() => setForm({ vehicle: null })}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-bold text-white transition-all active:scale-95 hover:opacity-90 shadow-sm shrink-0"
              style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
              aria-label="Add vehicle"
            >
              <Plus className="w-4 h-4" />
              <span>Add<span className="hidden sm:inline"> Vehicle</span></span>
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className={CARD_GRID_CLS}>
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
            {visibleVehicles.length === 0 && canAdd ? 'Add your first vehicle to get started.' : 'Try a different branch filter.'}
          </p>
        </div>
      ) : grouped ? (
        <div className="flex flex-col gap-5 sm:gap-8">
          {groups.map(g => (
            <section key={g.name} className="flex flex-col gap-2.5 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: accent }}>
                  <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </span>
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-wide" style={{ color: textPrimary }}>{g.name}</h2>
                <span className="text-[10px] font-bold" style={{ color: textMuted }}>{g.list.length}</span>
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
