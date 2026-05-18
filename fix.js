const fs = require('fs');

let text = fs.readFileSync('src/pages/DailyServiceReport.tsx', 'utf-8');

text = text.replace(
    'const [editing, setEditing] = useState<Partial<ServiceRow> | null>(null)',
    const [editing, setEditing] = useState<Partial<ServiceRow> | null>(null)
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, row: ServiceRow} | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: keyof ServiceRow, direction: 'asc' | 'desc' } | null>(null)
);

const logic = 
  const COLUMNS = [
    { label: "CUSTOMER'S NAME", key: 'customerName' },
    { label: 'DESTINATION', key: 'customerAddress' },
    { label: 'DISTRICT', key: 'district' },
    { label: 'CONTACT NO.', key: 'customerPhone' },
    { label: 'BRAND', key: 'unitBrandModel' },
    { label: 'DLR', key: 'dealer' },
    { label: 'COMMIT', key: 'commitTerms' },
    { label: 'INSTALLER', key: 'technicianName' },
    { label: 'NOTE', key: 'note' },
    { label: 'SERVICE', key: 'serviceType' },
    { label: 'UPDATE', key: 'remarks' },
    { label: 'CHARGES', key: 'amountCharged' },
    { label: 'PAYMENT', key: 'paymentStatus' },
  ] as const;

  const requestSort = (key: keyof ServiceRow) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  }

  const visible = useMemo(() => {
    let filtered = rows;
    const q = searchQuery.trim().toLowerCase();
    if (q) filtered = rows.filter(r => rowSearchBlob(r).includes(q));
    if (sortConfig !== null) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortConfig.key] || '';
        const bVal = b[sortConfig.key] || '';
        if (typeof aVal === 'number' && typeof bVal === 'number') return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [rows, searchQuery, sortConfig]);

text = text.replace(/const visible = useMemo\(\(\) => \{[\s\S]*?\}, \[rows, searchQuery\]\)/, logic);

fs.writeFileSync('src/pages/DailyServiceReport.tsx', text);
console.log('State & Logic replaced successfully.');
