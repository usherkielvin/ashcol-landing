import type { ReactNode } from 'react'

export function FormField({
  label,
  required,
  className = '',
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label className="font-bold uppercase tracking-wide block text-slate-500 dark:text-slate-400 text-[10.5px] mb-1.5">
        {label}{required ? <span className="text-emerald-500 ml-0.5">*</span> : null}
      </label>
      {children}
    </div>
  )
}

export function FormSectionHead({
  title,
  subtitle,
  step,
  icon,
}: {
  title: string
  subtitle?: string
  step?: number
  icon?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5 pt-0.5 pb-2.5 border-b border-slate-200 dark:border-slate-700 mb-4">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
        {icon ?? <span className="text-[11px] font-black">{step}</span>}
      </div>
      <div className="min-w-0">
        <p className="text-[11.5px] font-black uppercase tracking-wider text-emerald-600 leading-tight">{title}</p>
        {subtitle && <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-tight mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}
