import { Fragment, useState } from 'react'
import { Check, X, ChevronDown } from 'lucide-react'

interface LeaveRequest {
  id: string
  employeeId: string
  leaveType: string
  startDate: string
  endDate: string
  reason: string
  status: string
  approvedBy?: string
  approvedAt?: string
}

interface LeaveBalance {
  id: string
  employeeId: string
  year: number
  vacationAllocated: number
  vacationUsed: number
  sickAllocated: number
  sickUsed: number
  emergencyAllocated: number
  emergencyUsed: number
}

interface HrisLeavesTabProps {
  filteredLeaves: LeaveRequest[]
  balances: LeaveBalance[]
  getUserName: (userId: string) => string
  handleLeaveApproval: (id: string, status: 'APPROVED' | 'REJECTED') => void
  leavesSummary: { total: number; approved: number; pending: number }
  border: string
  isLight: boolean
}

// Status badges intentionally stay on fixed dark/rich chip colors in both
// themes — they're accent "pills," not page chrome, and need to pop.
function StatusBadge({ status }: { status: string }) {
  if (status === 'APPROVED') {
    return (
      <span className="inline-block bg-[#064E3B] text-[#34D399] px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border border-[#047857]">
        APPROVED
      </span>
    )
  }
  if (status === 'PENDING') {
    return (
      <span className="inline-block bg-[#78350F] text-[#FBBF24] px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border border-[#B45309]">
        PENDING
      </span>
    )
  }
  return (
    <span className="inline-block bg-[#7F1D1D] text-[#F87171] px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border border-[#B91C1C]">
      {status}
    </span>
  )
}

export function HrisLeavesTab({
  filteredLeaves,
  balances,
  getUserName,
  handleLeaveApproval,
  leavesSummary,
  border,
  isLight,
}: HrisLeavesTabProps) {
  void border // superseded by the theme-aware "Command Center" palette below
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const containerBg = isLight ? 'bg-white' : 'bg-[#0A1120]'
  const containerBorder = isLight ? 'border-slate-200' : 'border-slate-700'
  const headerGradient = isLight ? 'bg-gradient-to-b from-slate-50 to-slate-100 border-slate-200' : 'bg-gradient-to-b from-[#162238] to-[#0F1A2E] border-slate-700'
  const headerText = isLight ? 'text-slate-500' : 'text-slate-300'
  const rowHover = isLight ? 'hover:bg-slate-50 border-slate-200' : 'hover:bg-[#162238] border-slate-800/80'
  const cellPrimary = isLight ? 'text-slate-900' : 'text-slate-100'
  const cellMuted = isLight ? 'text-slate-600' : 'text-slate-300'
  const cellFaint = isLight ? 'text-slate-400' : 'text-slate-500'
  const actionBtn = isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 border-slate-600'
  const totalRow = isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0F1A2E] border-slate-700'
  const panelBg = isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#030712] border-slate-700'
  const panelCard = isLight ? 'bg-white border-slate-200' : 'bg-[#0F1A2E] border-slate-700'

  return (
    <div className="p-2">
      <div className={`w-full ${containerBg} border ${containerBorder} rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className={`border-b ${headerGradient}`}>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left w-8`}></th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Request ID</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Employee Name</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Leave Type</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Start Date</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>End Date</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Status</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Approved By</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Approved At</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`} style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaves.map(l => {
                const expanded = expandedId === l.id
                const balance = balances.find(b => b.employeeId === l.employeeId)
                return (
                  <Fragment key={l.id}>
                    <tr className={`transition-colors border-b ${rowHover}`}>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setExpandedId(expanded ? null : l.id)}
                          className={`${cellFaint} hover:text-[#10B981] transition-colors`}
                          title="View leave credits"
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                      <td className={`px-4 py-2.5 font-mono text-xs ${cellFaint} select-all`}>{l.id.substring(0, 8).toUpperCase()}</td>
                      <td className={`px-4 py-2.5 font-semibold ${cellPrimary}`}>{getUserName(l.employeeId)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-black uppercase"
                          style={{
                            backgroundColor: l.leaveType === 'SICK' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                            color: l.leaveType === 'SICK' ? '#DC2626' : '#2563EB',
                          }}
                        >
                          {l.leaveType}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 font-medium ${cellMuted}`}>{l.startDate}</td>
                      <td className={`px-4 py-2.5 font-medium ${cellMuted}`}>{l.endDate}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={l.status} /></td>
                      <td className={`px-4 py-2.5 ${cellMuted}`}>{l.approvedBy ? getUserName(l.approvedBy) : '—'}</td>
                      <td className={`px-4 py-2.5 ${cellMuted}`}>{l.approvedAt ? new Date(l.approvedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-2.5">
                        {l.status === 'PENDING' ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleLeaveApproval(l.id, 'APPROVED')}
                              className={`${actionBtn} border shadow-sm rounded-lg px-2 py-1.5 text-[#059669] dark:text-[#34D399]`}
                              title="Approve Leave"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleLeaveApproval(l.id, 'REJECTED')}
                              className={`${actionBtn} border shadow-sm rounded-lg px-2 py-1.5 text-[#DC2626] dark:text-[#F87171]`}
                              title="Reject Leave"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className={`text-xs ${cellFaint} font-semibold select-none`}>No Action</span>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <div className={`border-y shadow-inner p-4 ${panelBg}`}>
                            <p className={`text-[10px] font-bold uppercase tracking-wider ${cellFaint} mb-3`}>
                              {getUserName(l.employeeId)} — Leave Credits{balance ? ` (${balance.year})` : ''}
                            </p>
                            {balance ? (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {[
                                  { label: 'Vacation', allocated: balance.vacationAllocated, used: balance.vacationUsed },
                                  { label: 'Sick', allocated: balance.sickAllocated, used: balance.sickUsed },
                                  { label: 'Emergency', allocated: balance.emergencyAllocated, used: balance.emergencyUsed },
                                ].map(row => (
                                  <div key={row.label} className={`border rounded-lg px-3 py-2 ${panelCard}`}>
                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${cellFaint} mb-1`}>{row.label}</p>
                                    <p className={`text-sm ${cellMuted}`}>
                                      <span className={`font-black ${cellPrimary}`}>{row.allocated}</span> allocated ·{' '}
                                      <span className="font-bold text-[#DC2626] dark:text-[#F87171]">{row.used}</span> used
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className={`text-xs ${cellFaint} font-semibold`}>No leave credit record found for this employee.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              <tr className={`border-t-2 font-bold ${totalRow}`}>
                <td className="px-4 py-2.5"></td>
                <td className={`px-4 py-2.5 ${cellPrimary}`} colSpan={6}>
                  Total Leaves Count: <span className={cellPrimary}>{leavesSummary.total}</span>
                </td>
                <td className="px-4 py-2.5" colSpan={2}>
                  <span className="text-[#059669] dark:text-[#34D399]">Approved: {leavesSummary.approved}</span>
                  {'  ·  '}
                  <span className="text-[#B45309] dark:text-[#FBBF24]">Pending: {leavesSummary.pending}</span>
                </td>
                <td className="px-4 py-2.5"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
