import React from 'react'
import { useEmployeeDetails } from '../contexts/EmployeeDetailsContext'

interface EmployeeNameLinkProps {
  nameOrId: string | null | undefined
  className?: string
  style?: React.CSSProperties
}

export const EmployeeNameLink: React.FC<EmployeeNameLinkProps> = ({ nameOrId, className = '', style }) => {
  const { openEmployeeDetails } = useEmployeeDetails()

  if (!nameOrId || !nameOrId.trim()) return <span>—</span>

  const trimmed = nameOrId.trim()
  const upper = trimmed.toUpperCase()

  // Avoid rendering links for special non-employee values
  if (
    upper === 'SYSTEM' ||
    upper === 'UNKNOWN' ||
    upper === 'CUSTOMER' ||
    upper === 'N/A' ||
    upper === '—' ||
    upper === '-' ||
    upper.includes('REFUND') // e.g. "STAFF (REFUND - ...)"
  ) {
    return <span className={className} style={style}>{trimmed}</span>
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openEmployeeDetails(trimmed)
  }

  return (
    <button
      onClick={handleClick}
      type="button"
      className={`hover:underline cursor-pointer transition-all duration-150 inline-block text-left ${className}`}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        color: 'inherit',
        verticalAlign: 'inherit',
        ...style
      }}
      title={`Click to view details for ${trimmed}`}
    >
      {trimmed}
    </button>
  )
}
export default EmployeeNameLink
