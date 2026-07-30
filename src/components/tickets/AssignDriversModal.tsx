import ReactDOM from 'react-dom'
import { X, UsersRound, Loader2, Trash2 } from 'lucide-react'
import { API_BASE_URL } from '../../utils/api'
import { writeSchedulesTabCache } from '../../utils/ticketTabCache'
import {
  type Ticket,
  todayDateKey,
  isScheduleGhostOnDate,
  mergeAcMeta,
} from '../../utils/ticketHelpers'

export function AssignDriversModal({
  isLight,
  installer,
  driver,
  vehicle,
  saving,
  clearSaving,
  visible,
  dateFilter,
  activeBranchId,
  driverOnlyNames,
  onClose,
  onInstallerChange,
  onDriverChange,
  onVehicleChange,
  onSetSaving,
  setTickets,
  schedulesCacheKeyForTab,
  onShowToast,
  onClearAll,
}: {
  isLight: boolean
  installer: string
  driver: string
  vehicle: string
  saving: boolean
  clearSaving: boolean
  visible: Ticket[]
  dateFilter: string
  activeBranchId: string
  driverOnlyNames: string[]
  onClose: () => void
  onInstallerChange: (value: string) => void
  onDriverChange: (value: string) => void
  onVehicleChange: (value: string) => void
  onSetSaving: (value: boolean) => void
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>
  schedulesCacheKeyForTab: (dateOverride?: string) => string
  onShowToast: (msg: string) => void
  onClearAll: () => void
}) {
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const green = '#16A34A'

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-sm border overflow-hidden"
        style={{ backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{
            borderColor: border,
            backgroundColor: isLight ? '#f8fafc' : '#0d1b2e',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{ backgroundColor: isLight ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.18)' }}
            >
              <UsersRound className="w-4 h-4" style={{ color: green }} strokeWidth={2.1} />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wide" style={{ color: textPrimary }}>Assign Drivers</div>
              <div className="text-[10px] font-medium" style={{ color: textMuted }}>Bulk update driver &amp; vehicle for an installer</div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ color: textMuted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form
          id="bulk-assign-form"
          className="px-5 py-4 flex flex-col gap-3"
          onSubmit={async e => {
            e.preventDefault()
            if (!installer.trim()) { alert('Select an installer.'); return }
            if (!driver.trim() && !vehicle.trim()) {
              alert('Provide at least a driver or vehicle.'); return
            }
            onSetSaving(true)

            const installerVal = installer.trim()
            const driverVal = driver.trim()
            const vehicleVal = vehicle.trim()
            const targetDate = dateFilter || todayDateKey()
            const targetInstaller = installerVal.toLowerCase()

            const matchesAssignTarget = (t: Ticket) => {
              const rawInstaller = (t.installerName || '').trim().toLowerCase()
              const cleanInstaller = rawInstaller.split(/\s*[-–—]\s*|\s+\d+/)[0].trim()
              if (cleanInstaller !== targetInstaller) return false
              // visible is already scoped to the current schedule date
              if (targetDate && isScheduleGhostOnDate(t, targetDate)) return false
              return true
            }

            const targets = visible.filter(matchesAssignTarget)
            if (targets.length === 0) {
              onSetSaving(false)
              alert(`No schedule rows found for installer "${installerVal}" on ${targetDate}.`)
              return
            }
            const applyLocal = (list: Ticket[]) => list.map(t => {
              if (!matchesAssignTarget(t)) return t
              return {
                ...t,
                ...(driverVal ? { driverName: driverVal, driver_name: driverVal } : {}),
                ...(vehicleVal ? { serviceVehicle: vehicleVal, service_vehicle: vehicleVal } : {}),
                acDetails: mergeAcMeta(t, {
                  ...(driverVal ? { driverName: driverVal, driver_name: driverVal } : {}),
                  ...(vehicleVal ? { serviceVehicle: vehicleVal, service_vehicle: vehicleVal } : {}),
                }),
              }
            })

            // Instant UI update
            setTickets(prev => {
              const next = applyLocal(prev)
              writeSchedulesTabCache(schedulesCacheKeyForTab(), next, 'local')
              return next
            })
            onClose()
            onInstallerChange('')
            onDriverChange('')
            onVehicleChange('')
            onShowToast(`Assigning ${installerVal}…`)

            void (async () => {
              const tokenStr = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
              const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tokenStr}`,
              }
              try {
                let usedBulk = false
                try {
                  const res = await fetch(`${API_BASE_URL}/tickets/bulk-assign-driver`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      installerName: installerVal,
                      driverName: driverVal || undefined,
                      serviceVehicle: vehicleVal || undefined,
                      scheduleDate: targetDate,
                      branchId: activeBranchId && activeBranchId !== 'ALL_BRANCHES' ? activeBranchId : undefined,
                    }),
                  })
                  if (res.ok) {
                    usedBulk = true
                    const data = await res.json().catch(() => ({}))
                    const count: number = data?.data?.updatedCount ?? targets.length
                    onShowToast(`Updated ${count} ticket${count !== 1 ? 's' : ''} for ${installerVal}`)
                  } else {
                    console.warn('[Schedules] bulk-assign failed, falling back to sequential PATCH', res.status)
                  }
                } catch {
                  // fall through
                }

                if (!usedBulk) {
                  let failures = 0
                  for (const t of targets) {
                    if (String(t.id || '').startsWith('temp-') || String(t.id || '').startsWith('tmp-')) continue
                    const body: Record<string, unknown> = {
                      acDetails: mergeAcMeta(t, {
                        ...(driverVal ? { driverName: driverVal, driver_name: driverVal } : {}),
                        ...(vehicleVal ? { serviceVehicle: vehicleVal, service_vehicle: vehicleVal } : {}),
                      }),
                    }
                    if (driverVal) body.driverName = driverVal
                    if (vehicleVal) body.serviceVehicle = vehicleVal
                    try {
                      const res = await fetch(`${API_BASE_URL}/tickets/${t.id}`, {
                        method: 'PATCH',
                        headers,
                        body: JSON.stringify(body),
                      })
                      if (!res.ok) failures += 1
                    } catch {
                      failures += 1
                    }
                    await new Promise<void>(r => setTimeout(r, 40))
                  }
                  if (failures > 0) {
                    onShowToast(`Assigned ${installerVal} · ${failures} still syncing`)
                  } else {
                    onShowToast(`Updated ${targets.length} ticket${targets.length !== 1 ? 's' : ''} for ${installerVal}`)
                  }
                }
              } catch (err: unknown) {
                console.error('[Schedules] bulk assign persist failed', err)
                onShowToast(`Assigned in view · server sync lagged`)
              } finally {
                onSetSaving(false)
              }
            })()
          }}
        >
          {/* Installer dropdown */}
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: textMuted }}>
              Installer *
            </span>
            <select
              id="bulk-assign-installer"
              value={installer}
              onChange={e => onInstallerChange(e.target.value)}
              className="rounded-lg px-3 py-2 text-xs font-semibold outline-none"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              required
            >
              <option value="">— Select installer —</option>
              {[...new Set(
                visible
                  .map(t => (t.installerName || '').split(/\s*[-–—]\s*|\s+\d+/)[0].trim())
                  .filter(Boolean)
              )].sort().map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>

          {/* Driver input */}
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: textMuted }}>
              Driver
            </span>
            <input
              id="bulk-assign-driver"
              type="text"
              list="bulk-assign-driver-list"
              value={driver}
              onChange={e => onDriverChange(e.target.value)}
              placeholder="e.g. IAN"
              className="rounded-lg px-3 py-2 text-xs font-semibold outline-none"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            />
            <datalist id="bulk-assign-driver-list">
              {driverOnlyNames.map(name => <option key={name} value={name} />)}
              {[...new Set(
                visible
                  .map(t => (t.driverName || t.driver_name || '').trim())
                  .filter(n => n && !driverOnlyNames.includes(n))
              )].map(name => <option key={`t-${name}`} value={name} />)}
            </datalist>
          </label>

          {/* Vehicle input */}
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: textMuted }}>
              Vehicle
            </span>
            <input
              id="bulk-assign-vehicle"
              type="text"
              list="bulk-assign-vehicle-list"
              value={vehicle}
              onChange={e => onVehicleChange(e.target.value)}
              placeholder="e.g. FB19 or T2"
              className="rounded-lg px-3 py-2 text-xs font-semibold outline-none"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            />
            <datalist id="bulk-assign-vehicle-list">
              {[...new Set(
                visible
                  .map(t => (t.serviceVehicle || t.service_vehicle || '').trim())
                  .filter(Boolean)
              )].sort().map(name => <option key={name} value={name} />)}
            </datalist>
          </label>
        </form>

        {/* Footer */}
        <div
          className="flex flex-col gap-2.5 px-5 py-4 border-t"
          style={{ borderColor: 'rgba(37,99,235,0.2)', backgroundColor: isLight ? '#eff6ff' : 'rgba(37,99,235,0.06)' }}
        >
          <button
            type="button"
            onClick={onClearAll}
            disabled={saving || clearSaving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            style={{
              borderColor: isLight ? 'rgba(239,68,68,0.35)' : 'rgba(248,113,113,0.4)',
              color: isLight ? '#DC2626' : '#F87171',
              backgroundColor: isLight ? 'rgba(254,242,242,0.9)' : 'rgba(239,68,68,0.12)',
            }}
            title="Clear driver and vehicle on every row for this schedule date"
          >
            {clearSaving ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Clearing…</>
            ) : (
              <><Trash2 className="w-3.5 h-3.5" /> Clear All Drivers &amp; Vehicles</>
            )}
          </button>
          <p className="text-[10px] font-semibold text-center" style={{ color: textMuted }}>
            Clears driver + vehicle on all rows for {dateFilter || todayDateKey()} (current branch)
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold border"
              style={{ borderColor: inputBorder, color: textMuted }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="bulk-assign-form"
              disabled={saving || clearSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: green }}
            >
              {saving ? (
                <>⏳ Saving&hellip;</>
              ) : (
                <><UsersRound className="w-4 h-4" strokeWidth={2.1} /> Assign Drivers</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
