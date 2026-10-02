import React from "react";
import { Search, X, Download, Upload, Pencil, Trash2, Loader2 } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { EmployeeNameLink } from "../../components/EmployeeNameLink";
import type { AuditExpense } from "../../types/auditExpense";
import { peso, isDepositRecord, isNoReceipt } from "./expenseUtils";

interface ExpenseTableProps {
  branchName: string;
  search: string;
  setSearch: (v: string) => void;
  filtered: AuditExpense[];
  totalFiltered: number;
  handleExportExcel: () => void;
  attachingPhotoId: string | null;
  pickPhotoFor: (row: AuditExpense) => void;
  openDetails: (row: AuditExpense, e?: React.MouseEvent) => void;
  startEdit: (row: AuditExpense) => void;
  handleDeleteRecord: (row: AuditExpense) => Promise<void>;
  canModifyRecord: (row: { id: string }) => boolean;
  dtrLinkedHint: (row: { date?: string }) => string;
  setActionMenuRow: (row: AuditExpense) => void;
  setPreviewImage: (url: string | null) => void;
}

export default function ExpenseTable({
  branchName,
  search,
  setSearch,
  filtered,
  totalFiltered,
  handleExportExcel,
  attachingPhotoId,
  pickPhotoFor,
  openDetails,
  startEdit,
  handleDeleteRecord,
  canModifyRecord,
  dtrLinkedHint,
  setActionMenuRow,
  setPreviewImage,
}: ExpenseTableProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const cardBg = isLight ? "#ffffff" : "#0d1527";
  const border = isLight ? "#e2e8f0" : "#1e293b";
  const textPrimary = isLight ? "#0f172a" : "#f8fafc";
  const textMuted = isLight ? "#64748b" : "#94a3b8";
  const accent = "#2563EB";
  const danger = "#EF4444";
  const inputBg = isLight ? "#f8fafc" : "#0b1220";
  const inputBorder = isLight ? "#cbd5e1" : "#1e293b";

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: `1px solid ${border}` }}
      >
        <h2
          className="text-sm font-black uppercase tracking-wider truncate min-w-0"
          style={{ color: textPrimary }}
        >
          {branchName.replace(/[^A-Za-z0-9]+/g, " ").trim()}
        </h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div
            style={{ position: "relative" }}
            className="flex-1 sm:flex-none min-w-[140px] sm:w-56 sm:focus-within:w-72 transition-all"
          >
            <Search
              size={13}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: textMuted,
                pointerEvents: "none",
              }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search records"
              className="w-full h-9 rounded-full pl-9 pr-8 text-xs font-medium outline-none focus:border-emerald-500"
              style={{
                backgroundColor: inputBg,
                border: `1px solid ${inputBorder}`,
                color: textPrimary,
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: textMuted,
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full text-xs font-bold uppercase tracking-wide transition-opacity hover:opacity-80 shrink-0"
            style={{
              backgroundColor: `${accent}18`,
              border: `1px solid ${accent}44`,
              color: accent,
            }}
            title="Export the records shown to Excel"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="py-12 text-center text-sm font-bold uppercase tracking-widest"
          style={{ color: textMuted }}
        >
          {search ? "No matching records" : "No expense records"}
        </div>
      ) : (
        <>
          {/* ── Mobile Card View ── */}
          <div className="block sm:hidden">
            {filtered.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 px-3 py-3 cursor-pointer transition-colors active:bg-black/[0.03] dark:active:bg-white/[0.04]"
                style={{ borderTop: `1px solid ${border}` }}
              >
                {/* Main content — tappable */}
                <div
                  className="flex-1 min-w-0"
                  onClick={() => setActionMenuRow(row)}
                >
                  {/* Row 1: Company + Amount */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {row.receiptImageUri && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(row.receiptImageUri || null);
                          }}
                          className="shrink-0 focus:outline-none cursor-pointer"
                          title="Click to view full screen"
                        >
                          <img
                            src={row.receiptImageUri}
                            alt="Receipt"
                            className="w-8 h-8 object-cover rounded border border-slate-300 dark:border-slate-700 shadow-xs hover:scale-105 transition-transform"
                          />
                        </button>
                      )}
                      <span
                        className="text-sm font-bold leading-tight truncate"
                        style={{ color: textPrimary }}
                      >
                        {row.company || "—"}
                      </span>
                    </div>
                    <span
                      className="text-sm font-bold shrink-0 tabular-nums"
                      style={{ color: textPrimary }}
                    >
                      ₱{peso(row.amount)}
                    </span>
                  </div>
                  {/* Row 2: Description */}
                  {row.description && (
                    <div
                      className="text-xs mt-0.5 truncate"
                      style={{ color: textMuted }}
                    >
                      {row.description}
                    </div>
                  )}
                  {/* Row 3: Meta — date · by · txn no */}
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span
                      className="text-[11px]"
                      style={{ color: textMuted }}
                    >
                      {row.date}
                    </span>
                    <span
                      className="text-[11px]"
                      style={{ color: isLight ? "#cbd5e1" : "#334155" }}
                    >
                      ·
                    </span>
                    <span
                      className="text-[11px]"
                      style={{ color: textMuted }}
                    >
                      <EmployeeNameLink nameOrId={row.incurredBy} />
                    </span>
                    {row.receiptNo && (
                      <>
                        <span
                          className="text-[11px]"
                          style={{ color: isLight ? "#cbd5e1" : "#334155" }}
                        >
                          ·
                        </span>
                        <span
                          className="text-[11px] font-medium"
                          style={{ color: textMuted }}
                        >
                          Txn #{row.receiptNo}
                        </span>
                      </>
                    )}
                  </div>
                  {/* Row 4: Category */}
                  <div className="mt-1">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: isLight ? "#f1f5f9" : "#1e2d48",
                        color: textMuted,
                      }}
                    >
                      {row.expenseCategory}
                    </span>
                    {isDepositRecord(row) && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ml-1"
                        style={{
                          backgroundColor: `${accent}1A`,
                          color: accent,
                        }}
                      >
                        Deposit
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {/* Total row */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: `1px solid ${border}` }}
            >
              <span
                className="text-xs font-semibold"
                style={{ color: textMuted }}
              >
                {filtered.length} record{filtered.length !== 1 ? "s" : ""}
              </span>
              <span
                className="text-sm font-bold tabular-nums"
                style={{ color: textPrimary }}
              >
                ₱{peso(totalFiltered)}
              </span>
            </div>
          </div>

          {/* ── Desktop Table View ── */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs min-w-[950px]">
              <thead>
                <tr style={{ backgroundColor: `${accent}18` }}>
                  <th
                    className="px-3 py-3 text-left font-bold"
                    style={{ color: textMuted }}
                  >
                    Date
                  </th>
                  <th
                    className="px-3 py-3 text-left font-bold"
                    style={{ color: textMuted }}
                  >
                    Incurred By
                  </th>
                  <th
                    className="px-3 py-3 text-left font-bold"
                    style={{ color: textMuted }}
                  >
                    Company / Vendor
                  </th>
                  <th
                    className="px-3 py-3 text-left font-bold"
                    style={{ color: textMuted }}
                  >
                    Description
                  </th>
                  <th
                    className="px-3 py-3 text-left font-bold"
                    style={{ color: textMuted }}
                  >
                    Category
                  </th>
                  <th
                    className="px-3 py-3 text-left font-bold"
                    style={{ color: textMuted }}
                  >
                    Source
                  </th>
                  <th
                    className="px-3 py-3 text-right font-bold"
                    style={{ color: textMuted }}
                  >
                    Amount
                  </th>
                  <th
                    className="px-3 py-3 text-center font-bold"
                    style={{ color: textMuted }}
                  >
                    Receipt
                  </th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() => openDetails(row)}
                    onContextMenu={(e) => openDetails(row, e)}
                    title="Click to view details"
                    className="transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    style={{
                      borderTop: `1px solid ${border}`,
                      backgroundColor:
                        i % 2
                          ? isLight
                            ? "#f8fafc"
                            : "#0d1520"
                          : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <td className="px-3 py-2.5">
                      <div
                        className="font-semibold whitespace-nowrap"
                        style={{ color: textPrimary }}
                      >
                        {row.date}
                      </div>
                    </td>
                    <td
                      className="px-3 py-2.5 font-medium"
                      style={{ color: textPrimary }}
                    >
                      {row.incurredBy ? (
                        <EmployeeNameLink nameOrId={row.incurredBy} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className="px-3 py-2.5 font-medium"
                      style={{ color: textPrimary }}
                    >
                      {row.company || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div
                        className="font-medium truncate max-w-xs md:max-w-sm"
                        style={{ color: textPrimary }}
                        title={row.description}
                      >
                        {row.description}
                      </div>
                      {row.receiptNo && (
                        <div
                          className="text-[10px]"
                          style={{ color: textMuted }}
                        >
                          Receipt: {row.receiptNo}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="uppercase font-semibold"
                          style={{ color: textPrimary }}
                        >
                          {row.expenseCategory || "—"}
                        </span>
                        {isDepositRecord(row) && (
                          <span
                            className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: `${accent}1A`,
                              color: accent,
                            }}
                          >
                            Deposit
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="uppercase font-medium text-[11px]"
                        style={{
                          color: row.sourceOfFunds
                            ? textPrimary
                            : textMuted,
                        }}
                      >
                        {row.sourceOfFunds || "—"}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-bold"
                      style={{ color: textPrimary }}
                    >
                      ₱{peso(row.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {row.receiptImageUri ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(row.receiptImageUri || null);
                          }}
                          title="Click to view attached receipt in full screen"
                          className="inline-flex items-center justify-center group focus:outline-none cursor-pointer"
                        >
                          <img
                            src={row.receiptImageUri}
                            alt="Receipt thumbnail"
                            className="w-7 h-7 object-cover rounded border border-slate-300 dark:border-slate-700 shadow-xs group-hover:scale-110 transition-transform"
                          />
                        </button>
                      ) : /^CASH ADVANCE/i.test(
                          row.expenseCategory || "",
                        ) ? (
                        <span
                          className="text-slate-300 dark:text-slate-600 text-xs"
                          title="Cash advances have no receipt"
                        >
                          —
                        </span>
                      ) : isNoReceipt(row) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            pickPhotoFor(row);
                          }}
                          title="Saved without a receipt (reason is in the description) — click to attach a photo if one turns up"
                          className="inline-flex items-center text-[10px] font-bold uppercase px-1.5 py-1 rounded-md cursor-pointer"
                          style={{
                            color: "#b45309",
                            border: "1px solid #f59e0b88",
                            backgroundColor: "#f59e0b14",
                          }}
                        >
                          No receipt
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            pickPhotoFor(row);
                          }}
                          disabled={attachingPhotoId === row.id}
                          title="No receipt photo — click to attach one"
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-1 rounded-md cursor-pointer disabled:opacity-60"
                          style={{
                            color: danger,
                            border: `1px solid ${danger}55`,
                          }}
                        >
                          {attachingPhotoId === row.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Upload size={11} />
                          )}{" "}
                          Add photo
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div
                        className="flex gap-2 justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canModifyRecord(row) ? (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="p-1 rounded hover:bg-slate-500/10 cursor-pointer"
                              title="Edit Record"
                            >
                              <Pencil
                                size={13}
                                style={{ color: textMuted }}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteRecord(row)}
                              className="p-1 rounded hover:bg-rose-500/10 cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 size={13} style={{ color: danger }} />
                            </button>
                          </>
                        ) : (
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: textMuted }}
                            title={dtrLinkedHint(row)}
                          >
                            From DTR
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${border}` }}>
                  <td
                    colSpan={6}
                    className="px-3 py-2.5 font-bold text-right"
                    style={{ color: textMuted }}
                  >
                    TOTAL
                  </td>
                  <td
                    className="px-3 py-2.5 text-right font-bold"
                    style={{ color: accent }}
                  >
                    ₱{peso(totalFiltered)}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
