type Props = {
  label: string
  children: React.ReactNode
  required?: boolean
  className?: string
  colSpan?: 1 | 2 | 3 | 4
  error?: string
}

export function FormField({ label, children, required, className = '', colSpan = 1, error }: Props) {
  const spanClass =
    colSpan === 2 ? 'sm:col-span-2' :
    colSpan === 3 ? 'sm:col-span-3' :
    colSpan === 4 ? 'sm:col-span-2 md:col-span-4' : ''
  return (
    <div className={`${spanClass} ${className}`}>
      <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5 opacity-80 flex items-center justify-between">
        <span>
          {label}
          {required && <span className="text-red-500 font-bold ml-1">*</span>}
        </span>
      </label>
      {children}
      {error && (
        <p className="text-[10px] font-bold text-red-500 mt-1 animate-fadeIn flex items-center gap-1">
          {error}
        </p>
      )}
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

