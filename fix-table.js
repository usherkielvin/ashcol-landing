const fs = require('fs');
let text = fs.readFileSync('src/pages/DailyServiceReport.tsx', 'utf-8');

const tableStart = text.indexOf('<div className="overflow-x-auto">');
const tableEnd = text.indexOf('</table>', tableStart) + '</table>'.length;

const newTable = 
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: inputBg, borderBottom: \2px solid \\ }}>
                  {COLUMNS.map(c => (
                    <th key={c.label} onClick={() => requestSort(c.key as keyof ServiceRow)}
                        className="cursor-pointer hover:bg-black/5 transition-colors select-none"
                        style={{ padding: '7px 10px', textAlign: 'left', color: textMuted, fontWeight: 600, whiteSpace: 'nowrap', borderRight: \1px solid \\, letterSpacing: '0.03em' }}>
                      <div className="flex items-center gap-2">
                        {c.label}
                        <span className="text-[10px] opacity-40 font-black">
                          {sortConfig?.key === c.key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, idx) => (
                  <tr key={r.id}
                      onContextMenu={e => {
                        e.preventDefault()
                        if (canEdit || canDelete) setContextMenu({ x: e.clientX, y: e.clientY, row: r })
                      }}
                      style={{ borderBottom: \1px solid \\, backgroundColor: contextMenu?.row.id === r.id ? (isLight ? '#eff6ff' : '#172554') : (idx % 2 === 0 ? 'transparent' : (isLight ? '#fafafa' : '#080f1c')) }}
                      onMouseEnter={e => { if (contextMenu?.row.id !== r.id) e.currentTarget.style.backgroundColor = rowHover }}
                      onMouseLeave={e => { if (contextMenu?.row.id !== r.id) e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'transparent' : (isLight ? '#fafafa' : '#080f1c') }}>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, minWidth: 140 }}>
                      <span style={{ color: textMuted, marginRight: 6 }}>{idx + 1}</span>{r.customerName || ''}
                    </td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, minWidth: 160 }}>{r.customerAddress || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, whiteSpace: 'nowrap' }}>{r.district || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, maxWidth: 130, wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{r.customerPhone || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, minWidth: 120, maxWidth: 120, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.4' }}>{r.unitBrandModel || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, minWidth: 120, maxWidth: 120, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.4' }}>{r.dealer || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, minWidth: 130 }}>{r.commitTerms || ''}{r.freeInstallation ? ' (FREE)' : ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, whiteSpace: 'nowrap' }}>{r.technicianName || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, minWidth: 120 }}>{r.note || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, whiteSpace: 'nowrap' }}>{r.serviceColumn || r.serviceType || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, minWidth: 130 }}>{r.remarks || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, whiteSpace: 'nowrap', textAlign: 'right' }}>{r.amountCharged ? r.amountCharged.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: \1px solid \\, whiteSpace: 'nowrap' }}>{r.paymentStatus || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
;

text = text.substring(0, tableStart) + newTable + text.substring(tableEnd);
fs.writeFileSync('src/pages/DailyServiceReport.tsx', text);
console.log('Table fixed.');
