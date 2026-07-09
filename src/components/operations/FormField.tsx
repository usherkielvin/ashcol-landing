type Props = {
  label: string
  children: React.ReactNode
  required?: boolean
  className?: string
  colSpan?: 1 | 2 | 3
}

export function FormField({ label, children, required, className = '', colSpan = 1 }: Props) {
  const spanClass = colSpan === 2 ? 'md:col-span-2' : colSpan === 3 ? 'md:col-span-3' : ''
  return (
    <div className={`${spanClass} ${className}`}>
      <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 opacity-70">
        {label}{required ? ' *' : ''}
      </label>
      {children}
    </div>
  )
}

export function formInputStyle(bg: string, border: string, color: string): React.CSSProperties {
  return {
    backgroundColor: bg,
    border: `1px solid ${border}`,
    color,
  }
}
