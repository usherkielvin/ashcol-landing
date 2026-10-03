/**
 * Keeps popups and the focused field inside the part of the screen the on-screen keyboard leaves free.
 *
 * Phones (iOS Safari especially) don't shrink the layout viewport when the keyboard opens, so a centred
 * `fixed inset-0` modal ends up partly behind it. This tracks `window.visualViewport` and publishes it as
 * CSS variables + an `html.kb-open` class; the matching rules in index.css then fit every fixed overlay to
 * the visible area. It also scrolls the focused field to the middle of its popup.
 *
 * Note: the up/down/✓ bar iOS draws above the keyboard is the OS's own and can't be removed from a web page.
 */

const KEYBOARD_MIN_PX = 120
const EDITABLE = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]), textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'

export function installKeyboardSafeViewport(): void {
  const vv = window.visualViewport
  if (!vv || !window.matchMedia('(pointer: coarse)').matches) return

  const root = document.documentElement
  let frame = 0

  const isEditing = () => {
    const el = document.activeElement
    return !!el && el !== document.body && el.matches(EDITABLE)
  }

  const apply = () => {
    frame = 0
    const covered = window.innerHeight - vv.height - vv.offsetTop
    const open = isEditing() && covered > KEYBOARD_MIN_PX
    root.classList.toggle('kb-open', open)
    if (open) {
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`)
      root.style.setProperty('--vv-h', `${vv.height}px`)
    } else {
      root.style.removeProperty('--vv-top')
      root.style.removeProperty('--vv-h')
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(apply) }

  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)
  document.addEventListener('focusout', () => window.setTimeout(schedule, 50))
  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement | null
    schedule()
    if (!target?.matches?.(EDITABLE) || !target.closest('.fixed')) return
    // Wait for the keyboard animation, then centre the field in whatever scrolls around it.
    window.setTimeout(() => {
      if (document.activeElement === target) target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 350)
  })
}
