import { useState, useRef, useEffect } from 'react'
import { X, Camera, Save, Loader2 } from 'lucide-react'
import { API_BASE_URL } from '../../utils/api'

interface CollectionMarkPaidModalProps {
  isOpen: boolean
  onClose: () => void
  item: any
  onSave: (amount: number, datePaid: string, referenceNo: string, whoPaid: string, customerName: string) => Promise<void>
  isDark: boolean
}

export default function CollectionMarkPaidModal({ isOpen, onClose, item, onSave, isDark }: CollectionMarkPaidModalProps) {
  const [amount, setAmount] = useState<string>('')
  const [datePaid, setDatePaid] = useState<string>('')
  const [referenceNo, setReferenceNo] = useState<string>('')
  const [whoPaid, setWhoPaid] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scanError, setScanError] = useState('')
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set())

  const scanRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && item) {
      setAmount(item.amount ? String(item.amount) : '')
      setDatePaid(new Date().toISOString().split('T')[0])
      setReferenceNo('')
      const defaultCustomer = item.customer || item.description || ''
      setCustomerName(defaultCustomer)
      setWhoPaid(defaultCustomer)
      setScanPreview(null)
      setScanError('')
      setScannedFields(new Set())
    }
  }, [isOpen, item])

  if (!isOpen || !item) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(Number(amount) || 0, datePaid, referenceNo, whoPaid, customerName)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const processImage = async (file: File) => {
    const url = URL.createObjectURL(file)
    setScanPreview(url)
    setScanning(true)
    setScanError('')
    setScannedFields(new Set())
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`${API_BASE_URL}/v1/receipts/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        throw new Error('Server error ' + res.status)
      }
      const data = await res.json() as any
      if (data.error) { setScanError(`Scan failed: ${data.error}`); return }

      const scannedDate = data.date ? String(data.date) : ''
      // Attempt to parse smart date if needed, or just use as is if it matches YYYY-MM-DD
      const filled = new Set<string>()

      if (scannedDate) {
         // simple extraction or just set
         setDatePaid(scannedDate)
         filled.add('datePaid')
      }
      if (data.amount != null) {
         setAmount(String(data.amount))
         filled.add('amount')
      }
      if (data.receiptNo) {
         setReferenceNo(String(data.receiptNo))
         filled.add('referenceNo')
      }
      if (data.company || data.customer || data.customerName) {
         setCustomerName(String(data.company || data.customer || data.customerName))
         filled.add('customerName')
      }
      setScannedFields(filled)
    } catch (err: any) {
      setScanError(err.message || 'Could not scan receipt.')
    } finally {
      setScanning(false)
    }
  }

  const bgClass = isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const textClass = isDark ? 'text-zinc-100' : 'text-zinc-900'
  const mutedClass = isDark ? 'text-zinc-400' : 'text-zinc-500'
  const inputBg = isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-zinc-200'
  const overlayClass = isDark ? 'bg-black/60' : 'bg-zinc-900/40'

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${overlayClass} backdrop-blur-sm`}>
      <div className={`w-full max-w-md rounded-2xl border shadow-2xl ${bgClass} flex flex-col overflow-hidden max-h-[90vh]`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-inherit">
          <h2 className={`text-lg font-bold ${textClass}`}>Mark as Paid</h2>
          <button onClick={onClose} className={`p-2 rounded-lg hover:bg-zinc-500/10 transition-colors ${mutedClass}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <form id="mark-paid-form" onSubmit={handleSave} className="space-y-4">
            
            {/* Customer Name */}
            <div>
              <label className={`block text-xs font-bold mb-1.5 ${mutedClass} uppercase tracking-wider`}>Customer Name</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={e => { setCustomerName(e.target.value); setScannedFields(f => { const nf = new Set(f); nf.delete('customerName'); return nf }) }}
                className={`w-full px-3 py-2.5 rounded-xl border ${inputBg} ${textClass} focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all ${scannedFields.has('customerName') ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : ''}`}
              />
            </div>

            {/* Who Paid */}
            <div>
              <label className={`block text-xs font-bold mb-1.5 ${mutedClass} uppercase tracking-wider`}>Who Paid</label>
              <input
                type="text"
                required
                value={whoPaid}
                placeholder="Name of customer or person who paid"
                onChange={e => setWhoPaid(e.target.value)}
                className={`w-full px-3 py-2.5 rounded-xl border ${inputBg} ${textClass} focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all`}
              />
            </div>

            {/* Amount */}
            <div>
              <label className={`block text-xs font-bold mb-1.5 ${mutedClass} uppercase tracking-wider`}>Amount</label>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold ${mutedClass}`}>₱</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setScannedFields(f => { const nf = new Set(f); nf.delete('amount'); return nf }) }}
                  className={`w-full pl-8 pr-3 py-2.5 rounded-xl border ${inputBg} ${textClass} focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all ${scannedFields.has('amount') ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : ''}`}
                />
              </div>
            </div>

            {/* Reference Number */}
            <div>
              <label className={`block text-xs font-bold mb-1.5 ${mutedClass} uppercase tracking-wider`}>Reference No.</label>
              <input
                type="text"
                required
                value={referenceNo}
                placeholder="e.g. TR-12345"
                onChange={e => { setReferenceNo(e.target.value); setScannedFields(f => { const nf = new Set(f); nf.delete('referenceNo'); return nf }) }}
                className={`w-full px-3 py-2.5 rounded-xl border ${inputBg} ${textClass} focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all uppercase ${scannedFields.has('referenceNo') ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : ''}`}
              />
            </div>

            {/* Date Paid */}
            <div>
              <label className={`block text-xs font-bold mb-1.5 ${mutedClass} uppercase tracking-wider`}>Date Paid</label>
              <input
                type="date"
                required
                value={datePaid}
                onChange={e => { setDatePaid(e.target.value); setScannedFields(f => { const nf = new Set(f); nf.delete('datePaid'); return nf }) }}
                className={`w-full px-3 py-2.5 rounded-xl border ${inputBg} ${textClass} focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all ${scannedFields.has('datePaid') ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : ''}`}
              />
            </div>
          </form>

          {/* Scanner Section */}
          <div className="pt-2">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={scanRef}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) processImage(file)
                if (scanRef.current) scanRef.current.value = ''
              }}
            />
            
            <button
              type="button"
              onClick={() => scanRef.current?.click()}
              disabled={scanning}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all border ${isDark ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'} disabled:opacity-50`}
            >
              {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              {scanning ? 'Scanning...' : 'Scan Receipt / Document'}
            </button>
            
            {scanError && (
              <p className="mt-2 text-xs font-bold text-red-500 text-center">{scanError}</p>
            )}

            {scanPreview && (
              <div className="mt-4 relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
                <img src={scanPreview} alt="Scan preview" className="w-full object-cover max-h-48" />
                <button
                  type="button"
                  onClick={() => setScanPreview(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-inherit flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 py-2.5 rounded-xl font-bold border transition-all ${isDark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600'}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="mark-paid-form"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Confirm Paid
          </button>
        </div>
      </div>
    </div>
  )
}
