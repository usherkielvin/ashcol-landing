export function useTicketsTheme(isLight: boolean) {
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const tableBorder = isLight ? '#000000' : 'rgba(255, 255, 255, 0.45)'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const pageBg = isLight ? '#f8fafc' : '#060B18'
  const myTicketsTheadBg = pageBg
  const myTicketsTheadText = textMuted
  const myTicketsTheadBorder = tableBorder
  const schedTheadBg = pageBg
  const schedTheadText = textMuted
  const schedTheadBorder = tableBorder
  const rowEven = isLight ? '#ffffff' : '#060B18'
  const rowOdd = rowEven
  const rowHover = isLight ? '#f8fafc' : '#0F1A2E'
  const green = '#16A34A'
  const textGreen = isLight ? '#16A34A' : '#4ade80'
  const dropTargetBg = isLight ? 'rgba(16,185,129,0.22)' : 'rgba(16,185,129,0.28)'

  return {
    cardBg,
    border,
    tableBorder,
    textPrimary,
    textMuted,
    inputBg,
    inputBorder,
    pageBg,
    myTicketsTheadBg,
    myTicketsTheadText,
    myTicketsTheadBorder,
    schedTheadBg,
    schedTheadText,
    schedTheadBorder,
    rowEven,
    rowOdd,
    rowHover,
    green,
    textGreen,
    dropTargetBg,
  }
}

export type TicketsTheme = ReturnType<typeof useTicketsTheme>
