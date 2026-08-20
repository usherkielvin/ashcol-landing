import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { VehicleItem, BranchTheme } from './types'

interface VehiclesTabProps {
  vehicles: VehicleItem[]
  branches: { id: string; name: string }[]
  vehicleFilterBranch: string
  setVehicleFilterBranch: (b: string) => void
  canEdit: boolean
  currentTheme: BranchTheme
  lineupDayOfWeek: string
  isLight: boolean
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  handleAddVehicle: () => void
  handleDeleteVehicle: (id: string) => void
  handleUpdateVehicle: (id: string, field: keyof VehicleItem, value: string) => void
}

export const VehiclesTab: React.FC<VehiclesTabProps> = ({
  vehicles,
  branches,
  vehicleFilterBranch,
  setVehicleFilterBranch,
  canEdit,
  currentTheme,
  lineupDayOfWeek,
  isLight,
  cardBg,
  border,
  textPrimary,
  textMuted,
  handleAddVehicle,
  handleDeleteVehicle,
  handleUpdateVehicle,
}) => {
  return (
    <div className="rounded-lg border" style={{ backgroundColor: cardBg, borderColor: border }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: border }}>
        <div>
          <p className="text-sm font-black" style={{ color: textPrimary }}>Vehicle Registry</p>
          <p className="text-xs mt-0.5" style={{ color: textMuted }}>Plate numbers, branch assignments, coding days.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={vehicleFilterBranch}
            onChange={e => setVehicleFilterBranch(e.target.value)}
            className="px-2.5 py-1.5 rounded border text-xs font-semibold outline-none"
            style={{ borderColor: border, color: textPrimary, backgroundColor: cardBg, minWidth: 130 }}
          >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {canEdit && (
            <button
              type="button"
              onClick={handleAddVehicle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-black text-white"
              style={{ backgroundColor: currentTheme.accent }}
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ minWidth: 520 }}>
          <thead>
            <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#1e293b' }}>
              {['Vehicle', 'Plate No.', 'Branch', 'Coding Day', 'Today'].map(h => (
                <th
                  key={h}
                  className="px-3 py-2 text-[10px] font-black uppercase tracking-wide"
                  style={{ color: textMuted, borderBottom: `1px solid ${border}` }}
                >
                  {h}
                </th>
              ))}
              {canEdit && <th style={{ borderBottom: `1px solid ${border}`, width: 48 }}></th>}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const filtered = vehicleFilterBranch
                ? vehicles.filter(v => v.branchAssigned === vehicleFilterBranch)
                : vehicles

              if (filtered.length === 0) {
                return (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5} className="px-3 py-6 text-center text-xs font-semibold" style={{ color: textMuted }}>
                      {vehicleFilterBranch ? 'No vehicles for this branch.' : 'No vehicles yet. Click Add to get started.'}
                    </td>
                  </tr>
                )
              }

              return filtered.map(v => {
                const isCodingToday = v.codingDay && v.codingDay !== 'None' && v.codingDay.toLowerCase() === lineupDayOfWeek.toLowerCase()

                return (
                  <tr key={v.id} style={{ borderBottom: `1px solid ${border}` }}>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <input
                          type="text"
                          value={v.name}
                          onChange={e => handleUpdateVehicle(v.id, 'name', e.target.value.toUpperCase())}
                          className="w-full px-2 py-1 rounded border text-xs font-bold bg-transparent outline-none"
                          style={{ borderColor: border, color: textPrimary, minWidth: 80 }}
                          placeholder="e.g. STRADA"
                        />
                      ) : (
                        <span className="text-xs font-bold" style={{ color: textPrimary }}>{v.name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <input
                          type="text"
                          value={v.plateNumber}
                          onChange={e => handleUpdateVehicle(v.id, 'plateNumber', e.target.value.toUpperCase())}
                          className="w-full px-2 py-1 rounded border text-xs font-semibold bg-transparent outline-none"
                          style={{ borderColor: border, color: textPrimary, minWidth: 80 }}
                          placeholder="NDA 8274"
                        />
                      ) : (
                        <span className="text-xs font-semibold" style={{ color: textPrimary }}>{v.plateNumber}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <select
                          value={v.branchAssigned}
                          onChange={e => handleUpdateVehicle(v.id, 'branchAssigned', e.target.value)}
                          className="w-full px-2 py-1 rounded border text-xs font-semibold outline-none"
                          style={{ borderColor: border, color: textPrimary, backgroundColor: cardBg }}
                        >
                          <option value="">Unassigned</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs" style={{ color: textMuted }}>
                          {branches.find(b => b.id === v.branchAssigned)?.name || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <select
                          value={v.codingDay}
                          onChange={e => handleUpdateVehicle(v.id, 'codingDay', e.target.value)}
                          className="w-full px-2 py-1 rounded border text-xs font-semibold outline-none"
                          style={{ borderColor: border, color: textPrimary, backgroundColor: cardBg }}
                        >
                          <option value="None">None</option>
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs" style={{ color: textMuted }}>{v.codingDay === 'None' ? '—' : v.codingDay}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isCodingToday ? (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                          Coding
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase" style={{ background: isLight ? '#f0fdf4' : '#052e16', color: '#15803d' }}>
                          OK
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteVehicle(v.id)}
                          className="p-1 rounded hover:bg-red-50 text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}
