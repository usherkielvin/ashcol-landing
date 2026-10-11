// Lets the header's Messages/Notifications/Profile dropdowns close each other when one opens,
// without prop-drilling shared state through DashboardLayout.
export const HEADER_MENU_OPENED_EVENT = 'ashcol-header-menu-opened'

export type HeaderMenuId = 'messages' | 'notifications' | 'profile'

export function broadcastHeaderMenuOpen(id: HeaderMenuId): void {
  window.dispatchEvent(new CustomEvent<HeaderMenuId>(HEADER_MENU_OPENED_EVENT, { detail: id }))
}
