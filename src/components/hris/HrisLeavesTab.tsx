import { Check, X } from 'lucide-react'

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
}

export function HrisLeavesTab({
  filteredLeaves,
  balances,
  getUserName,
  handleLeaveApproval,
  leavesSummary,
  border,
}: HrisLeavesTabProps) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="excel-table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th>Employee Name</th>
              <th>Leave Type</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Status</th>
              <th>Approved By</th>
              <th>Approved At</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeaves.map(l => (
              <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="font-mono text-xs select-all">{l.id.substring(0, 8).toUpperCase()}</td>
                <td className="font-semibold">{getUserName(l.employeeId)}</td>
                <td>
                  <span
                    className="px-2 py-0.5 rounded text-[11px] font-black uppercase"
                    style={{
                      backgroundColor: l.leaveType === 'SICK' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                      color: l.leaveType === 'SICK' ? '#EF4444' : '#3B82F6',
                    }}
                  >
                    {l.leaveType}
                  </span>
                </td>
                <td className="font-medium">{l.startDate}</td>
                <td className="font-medium">{l.endDate}</td>
                <td>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                    style={{
                      backgroundColor:
                        l.status === 'PENDING'
                          ? 'rgba(245,158,11,0.1)'
                          : l.status === 'APPROVED'
                            ? 'rgba(16,185,129,0.1)'
                            : 'rgba(239,68,68,0.1)',
                      color: l.status === 'PENDING' ? '#F59E0B' : l.status === 'APPROVED' ? '#10B981' : '#EF4444',
                    }}
                  >
                    {l.status}
                  </span>
                </td>
                <td>{l.approvedBy ? getUserName(l.approvedBy) : '—'}</td>
                <td>{l.approvedAt ? new Date(l.approvedAt).toLocaleDateString() : '—'}</td>
                <td>
                  {l.status === 'PENDING' ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleLeaveApproval(l.id, 'APPROVED')}
                        className="p-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                        title="Approve Leave"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleLeaveApproval(l.id, 'REJECTED')}
                        className="p-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"
                        title="Reject Leave"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 font-semibold select-none">No Action</span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="excel-total-row">
              <td colSpan={2}>Total Leaves Count:</td>
              <td>{leavesSummary.total} Total</td>
              <td colSpan={2}>Approved: {leavesSummary.approved}</td>
              <td>Pending: {leavesSummary.pending}</td>
              <td colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <div className="px-4 py-2 border-b font-bold text-xs bg-slate-50 dark:bg-slate-800/20 text-slate-500" style={{ borderColor: border }}>
          B. EMPLOYEE LEAVE CREDITS BALANCES SHEET
        </div>
        <div className="overflow-x-auto border-t">
          <table className="excel-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Year</th>
                <th>Vacation (Allocated)</th>
                <th>Vacation (Used)</th>
                <th>Sick (Allocated)</th>
                <th>Sick (Used)</th>
                <th>Emergency (Allocated)</th>
                <th>Emergency (Used)</th>
              </tr>
            </thead>
            <tbody>
              {balances.map(b => (
                <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="font-semibold">{getUserName(b.employeeId)}</td>
                  <td className="font-mono text-xs">{b.year}</td>
                  <td>{b.vacationAllocated}</td>
                  <td className="text-rose-500 font-medium">{b.vacationUsed}</td>
                  <td>{b.sickAllocated}</td>
                  <td className="text-rose-500 font-medium">{b.sickUsed}</td>
                  <td>{b.emergencyAllocated}</td>
                  <td className="text-rose-500 font-medium">{b.emergencyUsed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
