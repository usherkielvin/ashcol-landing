import { X, FileText, User, MapPin, Phone, Calendar, Building2, Wrench, DollarSign, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

interface SearchResult {
  id: string
  type: 'ticket' | 'service' | 'customer'
  customerName: string
  ticketNumber?: string
  controlNumber?: string
  branch?: string
  branchName?: string
  store?: string
  serviceType?: string
  acType?: string
  unitBrandModel?: string
  technician?: string
  technicianName?: string
  status?: string
  jobStatus?: string
  lastUpdated?: string
  reportDate?: string
  contactPhone?: string
  customerPhone?: string
  address?: string
  customerAddress?: string
  district?: string
  remarks?: string
  note?: string
  rawData?: any
}

interface SearchResultDetailModalProps {
  result: SearchResult | null
  onClose: () => void
}

export default function SearchResultDetailModal({ result, onClose }: SearchResultDetailModalProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  if (!result) return null

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const overlayBg = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.7)'

  const getStatusColor = (status?: string) => {
    if (!status) return textMuted
    const s = status.toUpperCase()
    if (s.includes('COMPLETE')) return '#10B981'
    if (s.includes('PROGRESS') || s.includes('ASSIGNED')) return '#3B82F6'
    if (s.includes('PENDING')) return '#F59E0B'
    if (s.includes('CANCEL')) return '#EF4444'
    return textMuted
  }

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  // Build service history timeline from raw data
  const buildTimeline = () => {
    const timeline: { date: string; event: string; icon: any; color: string }[] = []
    const raw = result.rawData || {}

    if (result.type === 'ticket') {
      if (raw.createdAt || raw.created_at) {
        timeline.push({
          date: raw.createdAt || raw.created_at,
          event: 'Ticket created',
          icon: FileText,
          color: '#3B82F6',
        })
      }
      if (raw.assignedTo && (raw.updatedAt || raw.updated_at)) {
        timeline.push({
          date: raw.updatedAt || raw.updated_at,
          event: `Assigned to ${raw.assigned_employee_name || 'technician'}`,
          icon: User,
          color: '#3B82F6',
        })
      }
      if (raw.status === 'COMPLETED' && (raw.updatedAt || raw.updated_at)) {
        timeline.push({
          date: raw.updatedAt || raw.updated_at,
          event: 'Service completed',
          icon: CheckCircle,
          color: '#10B981',
        })
      }
    } else if (result.type === 'service') {
      if (raw.reportDate) {
        timeline.push({
          date: raw.reportDate,
          event: 'Service report created',
          icon: FileText,
          color: '#3B82F6',
        })
      }
      if (raw.timeStarted) {
        timeline.push({
          date: raw.reportDate + 'T' + raw.timeStarted,
          event: 'Service started',
          icon: Clock,
          color: '#F59E0B',
        })
      }
      if (raw.timeEnded) {
        timeline.push({
          date: raw.reportDate + 'T' + raw.timeEnded,
          event: 'Service ended',
          icon: CheckCircle,
          color: '#10B981',
        })
      }
    }

    return timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }

  const timeline = buildTimeline()

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: overlayBg }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: cardBg }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${border}`, backgroundColor: inputBg }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: result.type === 'ticket' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                color: result.type === 'ticket' ? '#3B82F6' : '#10B981',
              }}
            >
              {result.type === 'ticket' ? <FileText className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: textPrimary }}>
                {result.type === 'ticket' ? 'Schedule Details' : 'Service Report Details'}
              </h2>
              <p className="text-xs" style={{ color: textMuted }}>
                {result.ticketNumber || result.controlNumber || result.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-200/20 transition-colors"
            style={{ color: textMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Customer Information */}
            <div className="rounded-xl p-4" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: textPrimary }}>
                <User className="w-4 h-4" style={{ color: '#3B82F6' }} />
                Customer Information
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold" style={{ color: textMuted }}>Name:</span>
                  <p style={{ color: textPrimary }}>{result.customerName}</p>
                </div>
                {(result.contactPhone || result.customerPhone) && (
                  <div>
                    <span className="font-semibold" style={{ color: textMuted }}>Contact:</span>
                    <p className="flex items-center gap-2" style={{ color: textPrimary }}>
                      <Phone className="w-3 h-3" />
                      <a href={`tel:${result.contactPhone || result.customerPhone}`} className="hover:underline" style={{ color: '#3B82F6' }}>
                        {result.contactPhone || result.customerPhone}
                      </a>
                    </p>
                  </div>
                )}
                {(result.address || result.customerAddress) && (
                  <div>
                    <span className="font-semibold" style={{ color: textMuted }}>Address:</span>
                    <p className="flex items-start gap-2" style={{ color: textPrimary }}>
                      <MapPin className="w-3 h-3 mt-1 shrink-0" />
                      <span>{result.address || result.customerAddress}</span>
                    </p>
                  </div>
                )}
                {result.district && (
                  <div>
                    <span className="font-semibold" style={{ color: textMuted }}>District:</span>
                    <p style={{ color: textPrimary }}>{result.district}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Service Information */}
            <div className="rounded-xl p-4" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: textPrimary }}>
                <Wrench className="w-4 h-4" style={{ color: '#10B981' }} />
                Service Information
              </h3>
              <div className="space-y-2 text-sm">
                {result.serviceType && (
                  <div>
                    <span className="font-semibold" style={{ color: textMuted }}>Service Type:</span>
                    <p style={{ color: textPrimary }}>{result.serviceType}</p>
                  </div>
                )}
                {result.status && (
                  <div>
                    <span className="font-semibold" style={{ color: textMuted }}>Status:</span>
                    <p>
                      <span
                        className="inline-block px-2 py-1 rounded-full text-xs font-bold uppercase"
                        style={{
                          backgroundColor: `${getStatusColor(result.status)}15`,
                          color: getStatusColor(result.status),
                        }}
                      >
                        {result.status}
                      </span>
                    </p>
                  </div>
                )}
                {(result.branch || result.branchName) && (
                  <div>
                    <span className="font-semibold" style={{ color: textMuted }}>Branch:</span>
                    <p className="flex items-center gap-2" style={{ color: textPrimary }}>
                      <Building2 className="w-3 h-3" />
                      {result.branch || result.branchName}
                    </p>
                  </div>
                )}
                {result.store && (
                  <div>
                    <span className="font-semibold" style={{ color: textMuted }}>Store/Account:</span>
                    <p style={{ color: textPrimary }}>{result.store}</p>
                  </div>
                )}
                {(result.technician || result.technicianName) && (
                  <div>
                    <span className="font-semibold" style={{ color: textMuted }}>Assigned Technician:</span>
                    <p className="flex items-center gap-2" style={{ color: textPrimary }}>
                      <User className="w-3 h-3" />
                      {result.technician || result.technicianName}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* AC/Unit Details */}
            {(result.acType || result.unitBrandModel || result.rawData?.unitSerial) && (
              <div className="rounded-xl p-4" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: textPrimary }}>
                  <Wrench className="w-4 h-4" style={{ color: '#F59E0B' }} />
                  Unit Details
                </h3>
                <div className="space-y-2 text-sm">
                  {(result.acType || result.unitBrandModel) && (
                    <div>
                      <span className="font-semibold" style={{ color: textMuted }}>AC Type / Brand:</span>
                      <p style={{ color: textPrimary }}>{result.acType || result.unitBrandModel}</p>
                    </div>
                  )}
                  {result.rawData?.unitSerial && (
                    <div>
                      <span className="font-semibold" style={{ color: textMuted }}>Serial Number:</span>
                      <p style={{ color: textPrimary }}>{result.rawData.unitSerial}</p>
                    </div>
                  )}
                  {result.rawData?.quantity && (
                    <div>
                      <span className="font-semibold" style={{ color: textMuted }}>Quantity:</span>
                      <p style={{ color: textPrimary }}>{result.rawData.quantity}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment/Charges */}
            {result.rawData?.amountCharged !== undefined && (
              <div className="rounded-xl p-4" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: textPrimary }}>
                  <DollarSign className="w-4 h-4" style={{ color: '#10B981' }} />
                  Payment Information
                </h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-semibold" style={{ color: textMuted }}>Amount Charged:</span>
                    <p className="text-lg font-bold" style={{ color: '#10B981' }}>
                      ₱{result.rawData.amountCharged?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  {result.rawData?.paymentStatus && (
                    <div>
                      <span className="font-semibold" style={{ color: textMuted }}>Payment Status:</span>
                      <p style={{ color: textPrimary }}>{result.rawData.paymentStatus}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Remarks/Notes */}
          {(result.remarks || result.note) && (
            <div className="mt-6 rounded-xl p-4" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: textPrimary }}>
                <AlertCircle className="w-4 h-4" style={{ color: '#F59E0B' }} />
                Remarks / Notes
              </h3>
              <p className="text-sm whitespace-pre-wrap" style={{ color: textPrimary }}>
                {result.remarks || result.note}
              </p>
            </div>
          )}

          {/* Service History Timeline */}
          {timeline.length > 0 && (
            <div className="mt-6 rounded-xl p-4" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: textPrimary }}>
                <Calendar className="w-4 h-4" style={{ color: '#3B82F6' }} />
                Service History
              </h3>
              <div className="space-y-4">
                {timeline.map((item, index) => {
                  const Icon = item.icon
                  return (
                    <div key={index} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${item.color}15`, color: item.color }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        {index < timeline.length - 1 && (
                          <div className="w-0.5 flex-1 mt-1" style={{ backgroundColor: border, minHeight: '20px' }} />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-sm font-semibold" style={{ color: textPrimary }}>{item.event}</p>
                        <p className="text-xs" style={{ color: textMuted }}>{formatDateTime(item.date)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Additional Raw Data (for debugging/completeness) */}
          {result.rawData && Object.keys(result.rawData).length > 0 && (
            <div className="mt-6">
              <details className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                <summary
                  className="px-4 py-3 cursor-pointer font-semibold text-sm hover:opacity-80"
                  style={{ backgroundColor: inputBg, color: textMuted }}
                >
                  View All Data (Advanced)
                </summary>
                <div className="p-4 text-xs overflow-x-auto" style={{ backgroundColor: cardBg }}>
                  <pre style={{ color: textPrimary }}>{JSON.stringify(result.rawData, null, 2)}</pre>
                </div>
              </details>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${border}` }}>
          <p className="text-xs" style={{ color: textMuted }}>
            Last updated: {formatDateTime(result.lastUpdated || result.reportDate)}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-semibold text-sm transition-all hover:opacity-80"
            style={{ backgroundColor: '#3B82F6', color: '#fff' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
