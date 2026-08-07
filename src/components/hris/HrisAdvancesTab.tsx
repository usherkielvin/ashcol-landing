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
  isLight: boolean
}

// Status badges intentionally stay on fixed dark/rich chip colors in both
// themes — they're accent "pills," not page chrome, and need to pop.
function StatusBadge({ status }: { status: string }) {
  if (status === 'DISBURSED') {
    return (
      <span className="inline-block bg-[#064E3B] text-[#34D399] px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border border-[#047857]">
        DISBURSED
      </span>
    )
  }
  if (status === 'APPROVED') {
    return (
      <span className="inline-block bg-[#1E3A8A] text-[#60A5FA] px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border border-[#1D4ED8]">
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
  isLight,
}: HrisAdvancesTabProps) {
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

  return (
    <div className="p-2">
      <div className={`w-full ${containerBg} border ${containerBorder} rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className={`border-b ${headerGradient}`}>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Advance ID</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Employee Name</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Branch</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Amount (₱)</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Purpose</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Term</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Monthly (₱)</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Balance (₱)</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`}>Status</th>
                <th className={`text-[10px] font-bold uppercase tracking-wider ${headerText} px-4 py-3 text-left`} style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdvances.map(a => (
                <tr key={a.id} className={`transition-colors border-b ${rowHover}`}>
                  <td className={`px-4 py-2.5 font-mono text-xs ${cellFaint} select-all`}>{a.id.substring(0, 8).toUpperCase()}</td>
                  <td className={`px-4 py-2.5 font-semibold ${cellPrimary}`}>{getUserName(a.employeeId)}</td>
                  <td className={`px-4 py-2.5 ${cellMuted}`}>{getUserBranchName(a.employeeId)}</td>
                  <td className={`px-4 py-2.5 font-semibold ${cellPrimary}`}>₱{a.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className={`px-4 py-2.5 text-xs ${cellFaint} font-medium max-w-[250px] truncate`} title={a.purpose}>{a.purpose || '—'}</td>
                  <td className={`px-4 py-2.5 ${cellMuted}`}>{a.repaymentTermMonths} mos</td>
                  <td className={`px-4 py-2.5 ${cellMuted}`}>₱{a.monthlyDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5 font-bold text-[#B45309] dark:text-[#FBBF24]">₱{a.remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {isPortalAdminUser && a.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => { setConfirmingAdvance(a); setConfirmingStatus('APPROVED') }}
                            className={`${actionBtn} border shadow-sm rounded-lg px-3 py-1.5 text-[10px] font-bold text-[#2563EB] dark:text-[#60A5FA]`}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => { setConfirmingAdvance(a); setConfirmingStatus('REJECTED') }}
                            className={`${actionBtn} border shadow-sm rounded-lg px-3 py-1.5 text-[10px] font-bold text-[#DC2626] dark:text-[#F87171]`}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {isPortalAdminUser && a.status === 'APPROVED' && (
                        <button
                          onClick={() => { setConfirmingAdvance(a); setConfirmingStatus('DISBURSED') }}
                          className={`${actionBtn} border shadow-sm rounded-lg px-3 py-1.5 text-[10px] font-bold text-[#059669] dark:text-[#34D399]`}
                        >
                          Disburse
                        </button>
                      )}
                      <button
                        onClick={() => { setSelectedAdvance(a); setShowDetailsModal(true) }}
                        className={`${actionBtn} border shadow-sm rounded-lg px-3 py-1.5 text-[10px] font-bold ${cellMuted}`}
                      >
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className={`border-t-2 font-bold ${totalRow}`}>
                <td className={`px-4 py-2.5 ${cellPrimary}`} colSpan={3}>Grand Total:</td>
                <td className="px-4 py-2.5 text-[#059669] dark:text-[#34D399]">₱{advancesSummary.originalSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className={`px-4 py-2.5 text-xs ${cellFaint} font-medium`} colSpan={6}>Total cash advances requested</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
