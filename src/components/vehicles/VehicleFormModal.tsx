import { useState } from 'react'
import ReactDOM from 'react-dom'
import { X, Loader2, Truck, Lock, Trash2 } from 'lucide-react'
import { resolveImageUrl, type BranchListEntry } from '../../utils/api'
import { createVehicle, updateVehicle, uploadVehiclePhoto, type Vehicle } from '../../utils/vehicleApi'
import VehiclePhotoUploader, { type PickedPhoto } from './VehiclePhotoUploader'
import { codingDayFromPlate, errMsg, type VehicleTheme } from './vehicleUtils'

interface Props {
  theme: VehicleTheme
  /** Vehicle being edited; null = add a new one. */
  vehicle: Vehicle | null
  branches: BranchListEntry[]
  /** Branch id the form starts on for a new vehicle. */
  defaultBranchId: string
  /** Members can only file vehicles under their own branch — the select is locked to `branches`. */
  branchLocked: boolean
  onClose: () => void
  /** Only passed for managers editing an existing vehicle — shows a Remove button in the footer. */
  onDelete?: () => void
  /** Called once the vehicle is saved (parent refreshes and closes the modal). `warning` is set if only the photo failed. */
  onSaved: (warning?: string) => void
}

const CODING_WEEK = [
  { day: 'Monday', short: 'Mon', digits: '1 · 2' },
  { day: 'Tuesday', short: 'Tue', digits: '3 · 4' },
  { day: 'Wednesday', short: 'Wed', digits: '5 · 6' },
  { day: 'Thursday', short: 'Thu', digits: '7 · 8' },
  { day: 'Friday', short: 'Fri', digits: '9 · 0' },
]

export default function VehicleFormModal({ theme, vehicle, branches, defaultBranchId, branchLocked, onClose, onDelete, onSaved }: Props) {
  const [name, setName] = useState(vehicle?.name || '')
  const [plateNumber, setPlateNumber] = useState(vehicle?.plateNumber || '')
  const [brandModel, setBrandModel] = useState(vehicle?.brandModel || '')
  const [branchId, setBranchId] = useState(vehicle ? (vehicle.branchId || '') : defaultBranchId)
  const [driverName, setDriverName] = useState(vehicle?.driverName || '')
  const [photo, setPhoto] = useState<PickedPhoto | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const codingDay = codingDayFromPlate(plateNumber)

  const field = 'rounded-xl px-3.5 py-2.5 text-sm border outline-none transition-colors focus:border-emerald-500'
  const fieldStyle = { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.textPrimary }
  const label = 'text-[10px] font-bold uppercase tracking-wider'

  const save = async () => {
    if (!name.trim()) { setError('Vehicle name is required'); return }
    if (branchLocked && !branchId) { setError('Your account has no branch assigned, so a vehicle cannot be filed.'); return }
    setSaving(true)
    setError('')
    let saved: Vehicle | null = null
    try {
      const payload = {
        name: name.trim(),
        plateNumber: plateNumber.trim().toUpperCase(),
        brandModel: brandModel.trim(),
        branchId,
        driverName: driverName.trim(),
        codingDay,
      }
      saved = vehicle ? await updateVehicle(vehicle.id, payload) : await createVehicle(payload)
      if (photo) await uploadVehiclePhoto(saved.id, photo.blob, photo.filename)
      onSaved()
    } catch (err) {
      if (saved) {
        // The vehicle itself went through — only the photo failed. Close (a retry here would create a duplicate)
        // and let the page tell the user to re-attach the photo from Edit.
        onSaved(`Vehicle saved, but the photo upload failed: ${errMsg(err, 'unknown error')}. Open Edit to attach it again.`)
      } else {
        setError(errMsg(err, 'Failed to save vehicle'))
      }
    } finally {
      setSaving(false)
    }
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[15000] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[94vh] rounded-3xl shadow-2xl border flex flex-col overflow-hidden"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 py-4 shrink-0 border-b" style={{ borderColor: theme.border }}>
          <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: theme.accent }}>
            <Truck className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black" style={{ color: theme.textPrimary }}>{vehicle ? 'Edit vehicle' : 'Add a vehicle'}</h2>
            <p className="text-xs" style={{ color: theme.textMuted }}>{vehicle ? vehicle.name : 'Attach a photo and fill in the details.'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-500/10" style={{ color: theme.textMuted }} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-6">
          <div className="flex flex-col gap-2">
            <span className={label} style={{ color: theme.textMuted }}>Photo</span>
            <VehiclePhotoUploader
              theme={theme}
              existingUrl={vehicle?.photoUrl ? resolveImageUrl(vehicle.photoUrl) : null}
              picked={photo}
              onPick={setPhoto}
            />
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <label className={label} style={{ color: theme.textMuted }}>Vehicle name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mirage" className={field} style={fieldStyle} autoFocus />
            </div>
            <div className="flex flex-col gap-1">
              <label className={label} style={{ color: theme.textMuted }}>Brand / model</label>
              <input value={brandModel} onChange={e => setBrandModel(e.target.value)} placeholder="e.g. Mitsubishi Mirage 2016" className={field} style={fieldStyle} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={label} style={{ color: theme.textMuted }}>Plate number</label>
              <input value={plateNumber} onChange={e => setPlateNumber(e.target.value)} placeholder="NBV 3261" className={`${field} font-mono uppercase tracking-widest`} style={fieldStyle} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={`${label} flex items-center gap-1`} style={{ color: theme.textMuted }}>
                Branch {branchLocked && <Lock className="w-3 h-3" />}
              </label>
              <select value={branchId} onChange={e => setBranchId(e.target.value)} className={field} style={fieldStyle}>
                {!branchLocked && <option value="">Unassigned</option>}
                {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                {branchId && !branches.some(b => b.id === branchId) && <option value={branchId}>{branchId}</option>}
              </select>
              {branchLocked && <span className="text-[11px]" style={{ color: theme.textMuted }}>Members can manage vehicles of their own branch only.</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className={label} style={{ color: theme.textMuted }}>Assigned driver</label>
              <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver name" className={field} style={fieldStyle} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={label} style={{ color: theme.textMuted }}>Coding day · automatic from plate</label>
              <div className="grid grid-cols-5 gap-1.5" aria-live="polite">
                {CODING_WEEK.map(d => {
                  const on = codingDay === d.day
                  return (
                    <div
                      key={d.day}
                      className="rounded-lg border py-1.5 text-center transition-colors"
                      style={on
                        ? { backgroundColor: '#F59E0B', borderColor: 'transparent', color: '#fff' }
                        : { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.textMuted }}
                    >
                      <div className="text-xs font-black leading-tight">{d.short}</div>
                      <div className="text-[10px] font-semibold opacity-80 leading-tight">{d.digits}</div>
                    </div>
                  )
                })}
              </div>
              <span className="text-[11px]" style={{ color: theme.textMuted }}>
                {codingDay === 'None' ? 'Enter a plate ending in a digit to set the coding day.' : `Plate ends in ${plateNumber.trim().slice(-1)} → coding on ${codingDay}.`}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 shrink-0 border-t flex items-center gap-3" style={{ borderColor: theme.border }}>
          {vehicle && onDelete && (
            <button
              onClick={onDelete}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-colors hover:bg-red-500/10 disabled:opacity-50"
              style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#EF4444' }}
            >
              <Trash2 className="w-3.5 h-3.5" /> REMOVE
            </button>
          )}
          <div className="flex-1 text-xs font-medium text-red-500 min-w-0">{error}</div>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold border" style={{ borderColor: theme.border, color: theme.textMuted }}>
            CANCEL
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-60 shadow-sm"
            style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {vehicle ? 'SAVE CHANGES' : 'ADD VEHICLE'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
