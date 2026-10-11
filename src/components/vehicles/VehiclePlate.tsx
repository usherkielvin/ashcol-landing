interface Props {
  plate: string | null | undefined
  size?: 'md' | 'lg'
}

/** "NBV3261" → "NBV 3261" so the letters and digits read like a real plate. */
function formatPlate(raw: string): string {
  const clean = raw.trim().toUpperCase()
  if (/\s/.test(clean)) return clean.replace(/\s+/g, ' ')
  const m = clean.match(/^([A-Z]{2,4})[-]?(\d{1,5})$/)
  return m ? `${m[1]} ${m[2]}` : clean
}

/**
 * License-plate badge. Stays a white plate in dark mode on purpose — it reads as a plate and pops on dark cards.
 */
export default function VehiclePlate({ plate, size = 'md' }: Props) {
  const has = !!plate?.trim()
  const big = size === 'lg'
  return (
    <span
      className={`inline-flex flex-col items-center rounded-lg select-all ${big ? 'px-5 py-1.5' : 'px-3 py-0.5'}`}
      style={{
        backgroundColor: has ? '#ffffff' : 'transparent',
        border: `2px solid ${has ? '#1e293b' : '#94a3b8'}`,
        boxShadow: has ? 'inset 0 0 0 2px #ffffff, inset 0 0 0 3px #cbd5e1, 0 1px 3px rgba(0,0,0,0.25)' : undefined,
      }}
      title={has ? `Plate ${plate}` : 'No plate on file'}
    >
      <span
        className={`font-black leading-none whitespace-nowrap ${big ? 'text-[34px] tracking-[0.14em]' : 'text-[24px] tracking-[0.1em]'}`}
        style={{
          color: has ? '#0f172a' : '#94a3b8',
          fontFamily: "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif",
          fontStretch: 'condensed',
        }}
      >
        {has ? formatPlate(plate!) : 'NO PLATE'}
      </span>
    </span>
  )
}
