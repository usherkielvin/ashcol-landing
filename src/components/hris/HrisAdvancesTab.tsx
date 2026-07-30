
interface CashAdvance {
  id: string
  employeeId: string
  amount: number
  repaymentTermMonths: number
  monthlyDeduction: number
  purpose: string
  notes?: string
  status: string
  approvedBy?: string
  approvedAt?: string
  disbursedAt?: string
  remainingBalance: number
  branchId?: string
  createdAt: string
}

interface HrisAdvancesTabProps {
  filteredAdvances: CashAdvance[]
  getUserName: (userId: string) => string
  getUserBranchName: (userId: string) => string
  isPortalAdminUser: boolean
  setConfirmingAdvance: (advance: CashAdvance) => void
  setConfirmingStatus: (status: 'APPROVED' | 'DISBURSED' | 'REJECTED') => void
  setSelectedAdvance: (advance: CashAdvance) => void
  setShowDetailsModal: (open: boolean) => void
  advancesSummary: { originalSum: number }
}

export function HrisAdvancesTab({
  filteredAdvances,
  getUserName,
  getUserBranchName,
  isPortalAdminUser,
  setConfirmingAdvance,
  setConfirmingStatus,
  setSelectedAdvance,
  setShowDetailsModal,
  advancesSummary,
}: HrisAdvancesTabProps) {
  return (
    <div className="overflow-x-auto">
      <table className="excel-table">
        <thead>
          <tr>
            <th>Advance ID</th>
            <th>Employee Name</th>
            <th>Branch</th>
            <th>Amount (₱)</th>
            <th>Purpose</th>
            <th>Term</th>
            <th>Monthly (₱)</th>
            <th>Balance (₱)</th>
            <th>Status</th>
            <th style={{ width: 140 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredAdvances.map(a => (
            <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className="font-mono text-xs select-all">{a.id.substring(0, 8).toUpperCase()}</td>
              <td className="font-semibold">{getUserName(a.employeeId)}</td>
              <td>{getUserBranchName(a.employeeId)}</td>
              <td className="font-semibold">₱{a.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td className="text-xs text-slate-500 font-medium max-w-[250px] truncate" title={a.purpose}>{a.purpose || '—'}</td>
              <td>{a.repaymentTermMonths} mos</td>
              <td>₱{a.monthlyDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td className="font-bold text-amber-600 dark:text-amber-400">₱{a.remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                  style={{
                    backgroundColor: a.status === 'PENDING' ? 'rgba(245,158,11,0.1)' : a.status === 'APPROVED' ? 'rgba(59,130,246,0.1)' : a.status === 'DISBURSED' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: a.status === 'PENDING' ? '#F59E0B' : a.status === 'APPROVED' ? '#3B82F6' : a.status === 'DISBURSED' ? '#10B981' : '#EF4444',
                  }}
                >
                  {a.status}
                </span>
              </td>
              <td>
                <div className="flex items-center gap-1">
                  {isPortalAdminUser && a.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => { setConfirmingAdvance(a); setConfirmingStatus('APPROVED') }}
                        className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[10px] font-bold"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => { setConfirmingAdvance(a); setConfirmingStatus('REJECTED') }}
                        className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[10px] font-bold"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {isPortalAdminUser && a.status === 'APPROVED' && (
                    <button
                      onClick={() => { setConfirmingAdvance(a); setConfirmingStatus('DISBURSED') }}
                      className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[10px] font-bold"
                    >
                      Disburse
                    </button>
                  )}
                  <button
                    onClick={() => { setSelectedAdvance(a); setShowDetailsModal(true) }}
                    className="px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 text-[10px] font-bold"
                  >
                    View
                  </button>
                </div>
              </td>
            </tr>
          ))}
          <tr className="excel-total-row">
            <td colSpan={3}>Grand Total:</td>
            <td className="font-bold text-emerald-600 dark:text-emerald-400">₱{advancesSummary.originalSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td colSpan={6} className="text-xs text-slate-400 font-medium">Total cash advances requested</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
