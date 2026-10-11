import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface ColumnDef<T> {
  header: string;
  accessorKey: keyof T;
  isMobileVisible?: boolean;
  cellRenderer?: (row: T, index: number) => React.ReactNode;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
}

export function ResponsiveTable<T>({ data, columns }: ResponsiveTableProps<T>) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <div className="w-full">
      
      {/* ========================================= */}
      {/* 1. ASHCOL DESKTOP VIEW (Hidden on Mobile) */}
      {/* ========================================= */}
      <div className="hidden md:block w-full overflow-x-auto rounded-none border-b border-gray-200">
        <table className="w-full text-sm text-left text-gray-700 bg-white">
          {/* Restored Ashcol Green Header */}
          <thead className="text-xs font-bold text-green-900 uppercase bg-[#cce8d6] border-b-2 border-green-300 tracking-wider">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className={`px-4 py-3 whitespace-nowrap ${col.header === 'REMARKS' ? 'text-right' : 'text-left'}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-gray-200 hover:bg-gray-50 transition-colors last:border-0">
                {columns.map((col, colIndex) => (
                  <td key={colIndex} className={`px-4 py-3 whitespace-nowrap ${col.header === 'REMARKS' ? 'text-right' : 'text-left'}`}>
                    {col.cellRenderer ? col.cellRenderer(row, rowIndex) : String(row[col.accessorKey] || '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ========================================= */}
      {/* 2. MOBILE CARD VIEW (Hidden on Desktop)   */}
      {/* ========================================= */}
      <div className="flex flex-col gap-4 md:hidden bg-slate-50 p-3 sm:p-4 min-h-screen">
        {data.map((row, rowIndex) => {
          const isExpanded = expandedRows.has(rowIndex);
          const visibleCols = columns.filter(c => c.isMobileVisible);
          const hiddenCols = columns.filter(c => !c.isMobileVisible);

          return (
            <div key={rowIndex} className="border border-gray-200 rounded-xl bg-white p-4 shadow-sm flex flex-col w-full">
              
              {/* Always Visible Section */}
              <div className="flex flex-col gap-2">
                {visibleCols.map((col, colIndex) => (
                  <div key={colIndex} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                    <span className="text-xs font-semibold text-gray-500 uppercase w-1/3">{col.header}</span>
                    <span className="text-sm font-medium text-gray-900 text-right w-2/3 truncate">
                      {col.cellRenderer ? col.cellRenderer(row, rowIndex) : String(row[col.accessorKey] || '-')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Expandable Details Section */}
              <div className={`mt-3 pt-3 border-t border-gray-100 flex-col gap-2 ${isExpanded ? 'flex' : 'hidden'}`}>
                {hiddenCols.map((col, colIndex) => (
                  <div key={colIndex} className="flex justify-between items-start py-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase w-1/3">{col.header}</span>
                    <span className="text-sm text-gray-700 text-right w-2/3 break-words">
                      {col.cellRenderer ? col.cellRenderer(row, rowIndex) : String(row[col.accessorKey] || '-')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Toggle Action */}
              {hiddenCols.length > 0 && (
                <button
                  onClick={() => toggleRow(rowIndex)}
                  className="w-full mt-3 flex items-center justify-center gap-1 text-green-700 text-sm font-bold py-2 bg-green-50 hover:bg-green-100 rounded-lg transition-colors border border-green-200"
                >
                  {isExpanded ? (
                    <>Hide Details <ChevronUp size={16} /></>
                  ) : (
                    <>View Details <ChevronDown size={16} /></>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}