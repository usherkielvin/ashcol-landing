/**
 * Barrel re-export for Ticket helper modules.
 *
 * This file maintains 100% backward compatibility for all existing imports across
 * the portal codebase, while the implementation is cleanly organized into:
 *   - ticketTypes.ts      (interfaces, types, enums)
 *   - scheduleStatus.ts   (status opts, badge styles, labels)
 *   - scheduleRows.ts     (ghost logic, row colors, date belonging, branch scope)
 *   - ticketDates.ts      (date keys, formatting, today/week/month helpers)
 *   - ticketPayment.ts    (payment amounts, modes, breakdowns, validations)
 *   - ticketDisplay.ts    (names, addresses, brands, vehicles, driver, column text, sorting)
 *   - ticketSearch.ts     (overview/global search matching and ranking)
 *   - ticketImport.ts     (excel import matching, row creation, patch body generation)
 *   - ticketPatch.ts      (patch builders, acDetails merge, local-wins server sync, archive)
 *   - ticketFilters.ts    (my-tickets/schedules filters, sorting defaults, surfaces)
 */

export * from './ticketTypes'
export * from './scheduleStatus'
export * from './scheduleRows'
export * from './ticketDates'
export * from './ticketPayment'
export * from './ticketDisplay'
export * from './ticketSearch'
export * from './ticketImport'
export * from './ticketPatch'
export * from './ticketFilters'
