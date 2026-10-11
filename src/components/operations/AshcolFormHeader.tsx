import logoImg from '../../assets/ash-logo.jpg'

type Props = {
  title: string
  subtitle?: string
  isLight: boolean
  textPrimary: string
  textMuted: string
  border: string
}

export function AshcolFormHeader({ title, subtitle, isLight, textPrimary, textMuted, border }: Props) {
  return (
    <div
      className="text-center pb-5 mb-5"
      style={{ borderBottom: `2px solid ${isLight ? '#0f172a' : border}` }}
    >
      <div className="flex items-center justify-center gap-3 mb-2">
        <img src={logoImg} alt="ASHCOL" className="h-14 w-auto object-contain" />
        <div className="text-left">
          <div
            className="text-lg font-black tracking-wide leading-tight"
            style={{ color: textPrimary, fontFamily: "'Inter', sans-serif" }}
          >
            ASHCOL AIRCONDITIONING CORPORATION
          </div>
        </div>
      </div>
      <h2
        className="text-base font-black uppercase tracking-[0.15em] mt-3"
        style={{ color: textPrimary }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-[10px] mt-1 font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
