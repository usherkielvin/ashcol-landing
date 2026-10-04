export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="fixed top-6 right-6 z-[9999] flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl border bg-emerald-600 text-white border-emerald-500 font-semibold text-sm animate-in fade-in slide-in-from-top-3">
      <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
      {message}
    </div>
  )
}
