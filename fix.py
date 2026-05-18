import json
import re

with open('src/pages/DailyServiceReport.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. State Additions
text = text.replace(
    "const [editing, setEditing] = useState<Partial<ServiceRow> | null>(null)",
    "const [editing, setEditing] = useState<Partial<ServiceRow> | null>(null)\n  const [contextMenu, setContextMenu] = useState<{x: number, y: number, row: ServiceRow} | null>(null)\n  const [sortConfig, setSortConfig] = useState<{ key: keyof ServiceRow, direction: 'asc' | 'desc' } | null>(null)"
)

# 2. Logic Additions
logic = '''
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
  }, [rows, searchQuery, sortConfig])
'''
text = re.sub(r'const visible = useMemo\(\(\) => \{.*?\}, \[rows, searchQuery\]\)', logic, text, flags=re.DOTALL)

with open('src/pages/DailyServiceReport.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
