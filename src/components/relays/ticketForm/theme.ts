import type { CSSProperties } from 'react'

/** Shared styling tokens + input styling callback passed down to every ticket-form section,
 *  so Create and Edit render identically while each page keeps its own color/theme wiring. */
export type RelayFormTheme = {
  isLight: boolean
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
  /** Applied to every plain text/number/select input rendered by the shared sections. */
  inputClassName: string
  /** Per-field style — lets Create highlight AI/Excel-extracted values while Edit stays static. */
  getInputStyle: (value?: string) => CSSProperties
}
