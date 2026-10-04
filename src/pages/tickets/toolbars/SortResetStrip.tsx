import React from 'react'

export interface SortResetStripProps {
  onResetSort: () => void
  cardBg: string
  border: string
  green: string
}

export const SortResetStrip: React.FC<SortResetStripProps> = ({
  onResetSort,
  cardBg,
  border,
  green,
}) => {
  return (
    <div
      className="flex items-center justify-end px-4 py-1.5 border-b shrink-0"
      style={{ backgroundColor: cardBg, borderColor: border }}
    >
      <button
        type="button"
        onClick={onResetSort}
        className="text-[10px] font-bold uppercase tracking-wide hover:underline cursor-pointer"
        style={{ color: green }}
      >
        Reset sort
      </button>
    </div>
  )
}
