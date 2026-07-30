export function Field({ label, required, full, children }: {
  label: string
  required?: boolean
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={`edit-field flex flex-col gap-1.5 min-w-0 w-full max-w-full ${full ? 'md:col-span-2 col-span-1' : ''}`}>
      <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  )
}
