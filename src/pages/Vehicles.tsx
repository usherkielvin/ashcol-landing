import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X, Plus, Truck, Building2, User as UserIcon, Loader2, Pencil, Trash2, Camera } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, resolveImageUrl, isPortalAdmin, isCoordinatorOrOicUser, isSameBaseBranch, findBranchListEntry, type BranchListEntry } from '../utils/api'
import ImageCropModal from '../components/ImageCropModal'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import VehicleDiaryModal from '../components/vehicles/VehicleDiaryModal'
import {
  fetchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  uploadVehiclePhoto,
  type Vehicle,
} from '../utils/vehicleApi'

const CODING_DAYS = ['None', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function authToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

interface VehicleFormState {
  id: string | null
  name: string
  plateNumber: string
  brandModel: string
  branchId: string
  driverName: string
  codingDay: string
}

const emptyForm: VehicleFormState = { id: null, name: '', plateNumber: '', brandModel: '', branchId: '', driverName: '', codingDay: 'None' }

export default function Vehicles() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'

  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)
  const canManage = isAdmin || role === 'manager' || isCoordinatorOrOicUser(user)

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [branches, setBranches] = useState<BranchListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [diaryVehicle, setDiaryVehicle] = useState<Vehicle | null>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmDialogState | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<VehicleFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [pendingPhotoVehicleId, setPendingPhotoVehicleId] = useState<string | null>(null)

  const loadVehicles = async () => {
    setLoading(true)
    setError('')
    try {
      setVehicles(await fetchVehicles())
    } catch (err) {
      setError(errMsg(err, 'Failed to load vehicles'))
    } finally {
      setLoading(false)
    }
  }

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
  }, [])

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

  const openCreateForm = () => {
    setForm({ ...emptyForm, branchId: isAdmin ? '' : (user?.branchId || '') })
    setShowForm(true)
  }
  const openEditForm = (v: Vehicle) => {
    setForm({
      id: v.id,
      name: v.name,
      plateNumber: v.plateNumber || '',
      brandModel: v.brandModel || '',
      branchId: v.branchId || '',
      driverName: v.driverName || '',
      codingDay: v.codingDay || 'None',
    })
    setShowForm(true)
  }

  const handleSaveForm = async () => {
    if (!form.name.trim()) { setError('Vehicle name is required'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        plateNumber: form.plateNumber.trim(),
        brandModel: form.brandModel.trim(),
        branchId: form.branchId,
        driverName: form.driverName.trim(),
        codingDay: form.codingDay,
      }
      if (form.id) {
        await updateVehicle(form.id, payload)
      } else {
        await createVehicle(payload)
      }
      setShowForm(false)
      await loadVehicles()
    } catch (err) {
      setError(errMsg(err, 'Failed to save vehicle'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (v: Vehicle) => {
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
  }

  const handlePhotoPick = (vehicleId: string, file?: File) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('Image must be under 10MB.'); return }
    setPendingPhotoVehicleId(vehicleId)
    setCropSrc(URL.createObjectURL(file))
  }

  const handleCropConfirm = async (blob: Blob) => {
    const vehicleId = pendingPhotoVehicleId
    setCropSrc(null)
    setPendingPhotoVehicleId(null)
    if (!vehicleId) return
    try {
      await uploadVehiclePhoto(vehicleId, blob, 'vehicle.jpg')
      await loadVehicles()
    } catch (err) {
      setError(errMsg(err, 'Failed to upload photo'))
    }
  }

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <ConfirmDialog dialog={confirmModal} onClose={() => setConfirmModal(null)} />
      {cropSrc && <ImageCropModal imageSrc={cropSrc} isDark={!isLight} cropShape="rect" aspectRatio={16 / 9} onCancel={() => setCropSrc(null)} onConfirm={handleCropConfirm} />}
      {diaryVehicle && (
        <VehicleDiaryModal
          vehicle={diaryVehicle}
          branchName={branchName(diaryVehicle.branchId)}
          canManage={canManage}
          onClose={() => setDiaryVehicle(null)}
        />
      )}

      <div>
        <h1 className="text-xl font-bold" style={{ color: textPrimary }}>Vehicles</h1>
        <p className="text-sm mt-1" style={{ color: textMuted }}>Fleet roster, branch/driver assignment, and per-vehicle expense diary.</p>
      </div>

      {/* Search / filter / add bar */}
      <div className="rounded-2xl shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="flex items-center gap-2.5 min-w-[260px] max-w-sm rounded-xl px-3.5 py-2 border transition-all focus-within:border-emerald-500" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search name, plate, driver, branch…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent text-sm outline-none w-full"
                style={{ color: textPrimary }}
              />
              {search && <button onClick={() => setSearch('')} style={{ color: textMuted }}><X className="w-4 h-4" /></button>}
            </div>

            {isAdmin && (
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                className="rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-wider border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                <option value="">All Branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
              </select>
            )}
          </div>

          {canManage && (
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm"
              style={{ backgroundColor: '#10B981' }}
            >
              <Plus className="w-4 h-4" /> ADD VEHICLE
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          {error}
        </div>
      )}

      {/* Card grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: textMuted }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 rounded-2xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <Truck className="w-8 h-8 mx-auto mb-2" style={{ color: textMuted }} />
          <p className="text-sm font-medium" style={{ color: textMuted }}>No vehicles found</p>
          <p className="text-xs mt-1" style={{ color: textMuted }}>Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(v => (
            <div
              key={v.id}
              className="rounded-xl shadow-sm flex flex-row cursor-pointer overflow-hidden"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}`, transition: 'box-shadow 150ms ease, transform 150ms ease' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ''}              
              onClick={() => setDiaryVehicle(v)}
            >
              {/* Square photo — left */}
              <div
                className="relative shrink-0 w-[89px] h-[89px] self-center m-2.5 rounded-lg overflow-hidden"
                style={{ backgroundColor: inputBg }}
              >
                {v.photoUrl ? (
                  <img
                    src={resolveImageUrl(v.photoUrl)}
                    alt={v.name}
                    className="w-full h-full object-cover"
                    style={{ transform: 'none', transition: 'none' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Truck className="w-7 h-7" style={{ color: textMuted }} />
                  </div>
                )}
                {/* Coding day strip */}
                {v.codingDay && v.codingDay !== 'None' && (
                  <span
                    className="absolute bottom-0 left-0 right-0 text-center text-[8px] font-black uppercase tracking-wider text-white py-0.5"
                    style={{ backgroundColor: '#F59E0B' }}
                  >
                    {v.codingDay}
                  </span>
                )}
                {/* Camera hover overlay */}
                {canManage && (
                  <label
                    className="absolute inset-0 flex items-center justify-center cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: 'rgba(0,0,0,0.62)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <Camera className="w-5 h-5 text-white" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handlePhotoPick(v.id, e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>

              {/* Info — centre */}
              <div className="flex-1 min-w-0 flex flex-col justify-center py-3 pr-2 gap-0.5">
                <div className="text-sm font-bold truncate" style={{ color: textPrimary }}>{v.name}</div>
                {v.brandModel && (
                  <div className="text-[12px] truncate" style={{ color: textMuted }}>{v.brandModel}</div>
                )}
                <div className="text-[11px] font-mono" style={{ color: textMuted }}>{v.plateNumber || 'No plate'}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                  <span className="flex items-center gap-1 text-[11px]" style={{ color: textMuted }}>
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[100px]">{branchName(v.branchId) || 'Unassigned'}</span>
                  </span>
                  <span className="flex items-center gap-1 text-[11px]" style={{ color: textMuted }}>
                    <UserIcon className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[100px]">{v.driverName || 'Unassigned'}</span>
                  </span>
                </div>
              </div>

              {/* Edit / Delete — right */}
              {canManage && (
                <div
                  className="flex flex-col items-center justify-center gap-1 px-3 shrink-0"
                  style={{ borderLeft: `1px solid ${border}` }}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => openEditForm(v)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-slate-500/10"
                    style={{ color: textMuted }}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(v)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                    style={{ color: '#EF4444' }}
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Vehicle modal */}
      {showForm && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={() => setShowForm(false)}>
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl border p-6 flex flex-col gap-4"
            style={{ backgroundColor: cardBg, borderColor: border }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold" style={{ color: textPrimary }}>{form.id ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
              <button onClick={() => setShowForm(false)} style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Vehicle Name</label>
              <input
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Plate Number</label>
              <input
                value={form.plateNumber} onChange={e => setForm(f => ({ ...f, plateNumber: e.target.value }))}
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Brand / Model</label>
              <input
                value={form.brandModel} onChange={e => setForm(f => ({ ...f, brandModel: e.target.value }))}
                placeholder="e.g. Mitsubishi L300"
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Assigned Branch</label>
              <select
                value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                <option value="">Unassigned</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Assigned Driver</label>
              <input
                value={form.driverName} onChange={e => setForm(f => ({ ...f, driverName: e.target.value }))}
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Coding Day</label>
              <select
                value={form.codingDay} onChange={e => setForm(f => ({ ...f, codingDay: e.target.value }))}
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                {CODING_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {error && <div className="text-xs font-medium text-red-500">{error}</div>}

            <div className="flex justify-end gap-2 mt-1">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold border"
                style={{ borderColor: border, color: textMuted }}
              >
                CANCEL
              </button>
              <button
                onClick={handleSaveForm}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: '#10B981' }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
