# Tickets.tsx Modularization — Progress & Next Steps Plan

**Status**: Phase 1, 2, and 3 **COMPLETED** (Zero build / TypeScript errors).  
**Initial Size**: ~10,350 lines  
**Current Size**: ~7,960 lines (~2,400 lines extracted so far)  
**Target Final Size**: ~300 lines (or a 1-line shim exporting `TicketsPage.tsx`)

---

## 1. What Has Been Completed So Far

All components below have been extracted into dedicated files in `src/pages/tickets/`, wired into `Tickets.tsx`, and verified with `npx tsc -b` & `npm run build`:

### Foundation & Types
- `src/pages/tickets/constants.ts`: Column widths, protected columns, storage keys, payment prompt modes.
- `src/pages/tickets/types.ts`: `ColumnDef`, `EditingCell`, `ReschedDialogState`, `ContinuationDialogState`, `User`, `Employee`.
- `src/pages/tickets/icons/QuickActionIcons.tsx`: Quick action SVG components.
- `src/pages/tickets/table/AutoFitText.tsx`: Resizing SVG text container.

### Hooks
- `src/pages/tickets/hooks/useTicketsTheme.ts`: All theme tokens (`cardBg`, `tableBorder`, `green`, etc.).
- `src/pages/tickets/hooks/useScheduleDate.ts`: Date filtering, weekly tabs, custom date picker.
- `src/pages/tickets/hooks/useColumnLayout.ts`: Dynamic column definitions, column widths, resize handles, hidden columns.
- `src/pages/tickets/hooks/useBranchRosters.ts`: Branch rosters, negotiators, installers, technicians.

### Modals & Dialogs
- `src/pages/tickets/modals/AddTicketModal.tsx`: Add schedule ticket modal.
- `src/pages/tickets/modals/RescheduleDialog.tsx`: Reschedule modal with date selector & pending slot toggle.
- `src/pages/tickets/modals/ContinuationDialog.tsx`: Continuation multi-date picker dialog.
- `src/pages/tickets/modals/PaymentPromptModal.tsx`: Payment details & split cash/GCash hybrid modal.
- `src/pages/tickets/modals/MonthFilterModal.tsx`: Whole-month schedule filters modal.
- `src/pages/tickets/modals/MyTicketsFilterModal.tsx`: My Tickets queue sub-status filters modal.

### Popups & Menus
- `src/pages/tickets/popups/TicketContextMenu.tsx`: Right-click context menu.
- `src/pages/tickets/popups/ExpandedCellPopover.tsx`: Expanded cell preview popup.
- `src/pages/tickets/popups/Toast.tsx`: Animated notification toast.

### Toolbars & Banners
- `src/pages/tickets/toolbars/MyTicketsToolbar.tsx`: Search bar, negotiator dropdown, status chips, month picker, Excel export.
- `src/pages/tickets/toolbars/SchedulesToolbar.tsx`: Mobile & desktop date tabs, filters, assign drivers, showcase trigger & banner.
- `src/pages/tickets/toolbars/MonthViewBanner.tsx`: Whole-month notification banner.
- `src/pages/tickets/toolbars/SortResetStrip.tsx`: Sort reset trigger strip.

### Surfaces & Table Header
- `src/pages/tickets/mobile/TicketMobileCard.tsx`: Full mobile cards list & collection summary totals.
- `src/pages/tickets/overview/OverviewSearchView.tsx`: Branch marquee, hero search box, and search results view.
- `src/pages/tickets/table/TicketsTableHeader.tsx`: Table `<colgroup>` and `<thead>` with resize handles & sort triggers.

---

## 2. Anatomy of the Remaining ~7,960 Lines in `Tickets.tsx`

| Section | Lines (Approx) | Description | Next Step |
|---|---|---|---|
| **Cell Renderers (`renderCell`)** | 6020–6800 (~780 lines) | 15 column renderers (`TICKET NO`, `STATUS`, `VEHICLE`, `PAYMENT`, `REMARKS`, `CUSTOMER`, `INSTALLER`, etc.) | Extract to `src/pages/tickets/table/cells/` |
| **Inline Cell Editors** | 5600–6000 (~400 lines) | Input & dropdown cell editors (`renderInlineCellEditor`, `withEditPencil`) | Extract to `src/pages/tickets/table/editors/` |
| **Desktop Table Body (`<tbody>`)** | 7050–7400 (~350 lines) | Row mappings, vehicle drag/drop listeners, table wrapper | Extract to `src/pages/tickets/table/TicketsTable.tsx` & `TicketsTableRow.tsx` |
| **Excel Import Engine** | 1390–1700, 2700–3250 (~850 lines) | `processImportSheetRows`, `parseImportFile`, `handleApplyImport` | Extract to `src/pages/tickets/hooks/useTicketImport.ts` |
| **Edit/Add Ticket Submission Logic** | 1700–2700 (~1,000 lines) | `buildScheduleEditForm`, validation, `commitSaveEditTicket`, `commitSaveManualTicket` | Extract to `src/pages/tickets/hooks/useTicketForms.ts` |
| **Optimistic Patch Queue & Save** | 4600–5400 (~800 lines) | `applyTicketLocally`, `queueTicketPatch`, `flushTicketSave`, rollback queue, close/cancel/reopen | Extract to `src/pages/tickets/hooks/useTicketSaveQueue.ts` |
| **Vehicle Trip & Reordering** | 5380–5460 (~100 lines) | Vehicle trip reordering, drag state, keyboard handlers | Extract to `src/pages/tickets/hooks/useVehicleDrag.ts` |
| **Fetching, Prefetching & Caching** | 3550–4000 (~450 lines) | `fetchTickets`, `runMonthFilterQuery`, tab cache hydrate & persist | Extract to `src/pages/tickets/hooks/useTicketsFetch.ts` |
| **Filtering, Sorting & Derived Rows** | 4000–4450 (~450 lines) | `filtered`, `visible`, vehicle trip labels calculation, showcase rows | Extract to `src/pages/tickets/hooks/useTicketRows.ts` |

---

## 3. Ready-to-Execute Blueprint for Next Session

When you are ready, say: **"Continue with Phase 4"** or **"Start Phase 4"**.

### Phase 4: Desktop Table, Cells & Editors (~2,500 lines reduction)

1. **Step 4.1: Cell Renderers (`src/pages/tickets/table/cells/`)**
   - Create `renderCell.tsx` dispatcher.
   - Separate complex columns:
     - `TicketNoCell.tsx`
     - `StatusCell.tsx`
     - `VehicleCell.tsx`
     - `PaymentCell.tsx`
     - `RemarksCell.tsx`
     - `InstallerCell.tsx`
     - `CustomerCell.tsx`
2. **Step 4.2: Inline Cell Editors (`src/pages/tickets/table/editors/`)**
   - Extract `InlineCellEditor.tsx` (the text inputs, dropdown pickers for negotiator/installer/vehicle).
   - Extract `EditPencil.tsx` (`withEditPencil` wrapper).
3. **Step 4.3: Table Component (`src/pages/tickets/table/`)**
   - Extract `TicketsTableRow.tsx`: Single row background styling, ghost opacity, drag offset, cell click/double-click listeners.
   - Extract `TicketsTable.tsx`: Outer scroll container, `vehicleDragTbodyRef`, dragover/drop handlers, sticky columns.

### Phase 5: Domain Hooks & Logic Extraction (~3,500 lines reduction)

1. **`useTicketImport.ts`**: Excel file parser, scan picker, sheet row processor, and apply import batch handler.
2. **`useTicketSaveQueue.ts`**: Optimistic local patch application, pending save queue, batch flush, server rollback.
3. **`useTicketForms.ts`**: Add manual ticket form state and edit ticket modal form state & save validators.
4. **`useVehicleDrag.ts`**: Drag row index resolver, keyboard ArrowUp/ArrowDown trip reordering, and vehicle trip drop commit.
5. **`useTicketsFetch.ts`**: Active tab prefetching, tab cache hydration, whole-month query execution.
6. **`useTicketRows.ts`**: Date/branch/negotiator/search filtering, sort comparison, and visible row derivation.

### Phase 6: Orchestrator & Final Shim

1. Move the assembled page component to `src/pages/tickets/TicketsPage.tsx`.
2. Convert `src/pages/Tickets.tsx` into a thin 1-line shim:
   ```tsx
   export { default } from './tickets/TicketsPage'
   ```
   *(Guarantees 100% backward compatibility for `MyTickets.tsx`, `Schedules.tsx`, `SearchTickets.tsx`, and `App.tsx` routes).*
3. Run `npm run build` to verify production bundle.

---

## 4. Safety & Compatibility Guarantees

- **No Behavioral Changes**: Purely structural relocation of existing code.
- **Taguig Monday Preselection**: Fixed and preserved (Taguig now defaults to today).
- **Vehicle Cell Editing**: Preserved (vehicle cells in pending schedule rows remain editable).
- **No Consumer Disruption**: All consumer files import `Tickets` without modification.
