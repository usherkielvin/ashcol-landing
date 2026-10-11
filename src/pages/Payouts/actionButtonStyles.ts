// Look shared by every action in an installer table's header: the plain buttons (TableActionButton) and the
// split Copy link control (ShareLinkButton). Kept apart from the components so both can import it.

export type ActionTone = 'neutral' | 'accent' | 'solid' | 'attention' | 'danger'

/** Border, fill and text colours for a tone — shared with the split "Copy link" control. */
export function actionColors(isLight: boolean, tone: ActionTone): { color: string; backgroundColor: string; borderColor: string } {
  switch (tone) {
    case 'accent':
      return {
        color: isLight ? '#047857' : '#34D399',
        backgroundColor: isLight ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.14)',
        borderColor: isLight ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.35)',
      }
    case 'solid':
      return { color: '#ffffff', backgroundColor: '#10B981', borderColor: '#10B981' }
    case 'attention':
      return { color: '#ffffff', backgroundColor: '#D97706', borderColor: '#D97706' }
    case 'danger':
      return { color: '#ffffff', backgroundColor: '#DC2626', borderColor: '#DC2626' }
    default:
      return {
        color: isLight ? '#0f172a' : '#E2E8F0',
        backgroundColor: isLight ? '#ffffff' : '#0F1A2E',
        borderColor: isLight ? '#cbd5e1' : '#243452',
      }
  }
}

export const ACTION_BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 h-9 shrink-0 border text-xs font-semibold whitespace-nowrap select-none transition-colors cursor-pointer hover:brightness-95 dark:hover:brightness-125 focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed'
