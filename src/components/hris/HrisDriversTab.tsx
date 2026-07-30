import { Eye, Trash2 } from 'lucide-react'

interface HrisDriversTabProps {
  driverSheets: any[]
  searchQuery: string
  handleViewSheetDetails: (id: string) => void
  handleDeleteDriverSheet: (id: string) => void
}

export function HrisDriversTab({
  driverSheets,
  searchQuery,
  handleViewSheetDetails,
  handleDeleteDriverSheet,
}: HrisDriversTabProps) {
  const q = searchQuery.toLowerCase()
  const filtered = driverSheets.filter((s: any) => {
    return (s.driverName || '').toLowerCase().includes(q) ||
           (s.branch && s.branch.toLowerCase().includes(q))
  })

  return (
    <div className="overflow-x-auto">
      <table className="excel-table">
        <thead>
          <tr>
            <th>Driver Name</th>
            <th>Branch</th>
            <th>Position</th>
            <th>Cut-Off Period</th>
            <th>Date Filed</th>
            <th>Validated By</th>
            <th>Total OT</th>
            <th style={{ width: 150 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s: any) => (
            <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className="font-semibold">{s.driverName}</td>
              <td>{s.branch || '—'}</td>
              <td>{s.position || '—'}</td>
              <td className="font-medium">{s.cutOffPeriod || '—'}</td>
              <td>{s.dateFiled ? new Date(s.dateFiled).toLocaleDateString() : '—'}</td>
              <td>{s.validatedBy || '—'}</td>
              <td className="font-bold">{s.totalApprovedOt || '—'}</td>
              <td>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleViewSheetDetails(s.id)}
                    className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" /> View/Edit
                  </button>
                  <button
                    onClick={() => handleDeleteDriverSheet(s.id)}
                    className="px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {driverSheets.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center py-6 text-slate-400 font-semibold">
                No driver sheets found. Click "Import Scan" to scan a driver monitoring sheet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
