/** Reset scroll position on ticket table containers after tab / route switches. */
export function resetTicketTableScroll(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll('[data-ticket-table-scroll]').forEach((el) => {
    if (el instanceof HTMLElement) el.scrollTop = 0
  })
}
