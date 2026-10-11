import type { Ticket, ScheduleGhostKind } from '../../utils/ticketHelpers'
export type { AuthUser as User } from '../../contexts/AuthContext'
export type { BranchStaffOption as Employee } from '../../utils/api'

export type EditingCell = {
  ticketId: string
  rowIndex: number
  colLabel: string
  value: string
}

export type ReschedDialogState = {
  ticket: Ticket
}

export type ContinuationDialogState = {
  ticket: Ticket
}

export type PaymentPromptState = {
  ticket: Ticket
  nextStatus: string
  updateOnly?: boolean
}

export type ExpandedCellState = {
  ticketId: string
  colLabel: string
}

export type ContextMenuState = {
  x: number
  y: number
  ticket: Ticket
}

export type StatusPickerState = {
  ticket: Ticket
  mode: 'inline' | 'edit-form'
  x: number
  y: number
}

export type ScheduleDetailsPopupState = {
  ticket: Ticket
  x: number
  y: number
  ghostKind?: ScheduleGhostKind
}

export type FinalDatePickerState = {
  ticket: Ticket
  anchorRect: DOMRect | null
}

export type SortConfig = {
  column: string
  direction: 'asc' | 'desc'
}

export type ColumnDef = {
  label: string
  display: string
  weight: number
  expMul: number
  sticky: boolean
  freeze: boolean
  align: 'left' | 'center' | 'right'
  sortable?: boolean
  w: string
  pixelWidth: number
  isExpanded: boolean
  left: number
}
