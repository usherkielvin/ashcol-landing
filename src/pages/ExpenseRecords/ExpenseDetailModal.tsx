import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Loader2,
  Camera,
  Upload,
  ClipboardPaste,
  Trash2,
  Search,
} from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { EmployeeNameLink } from "../../components/EmployeeNameLink";
import AutoSuggestInput from "../../components/AutoSuggestInput";
import type { AuditExpense, AuditExpenseCategory } from "../../types/auditExpense";
import { AUDIT_EXPENSE_CATEGORIES } from "../../types/auditExpense";
import {
  type BranchOption,
  peso,
  historyDateTime,
  expenseRecordHistory,
  formatDetailsName,
} from "./expenseUtils";

interface ExpenseDetailModalProps {
  detailRow: AuditExpense | null;
  isEditingInModal: boolean;
  setIsEditingInModal: (v: boolean) => void;
  setDetailRow: (row: AuditExpense | null) => void;
  startEditInModal: (row: AuditExpense) => void;
  handleDeleteRecord: (row: AuditExpense) => Promise<void>;
  canModifyRecord: (row: { id: string }) => boolean;
  dtrLinkedHint: (row: { date?: string }) => string;
  setPreviewImage: (url: string | null) => void;
  submitReceipt: () => Promise<void>;
  savingReceipt: boolean;
  dateRaw: string;
  setDateRaw: (v: string) => void;
  dateError: string;
  setDateError: (v: string) => void;
  handleDateBlur: (val: string) => void;
  latestDateStr: string;
  form: {
    date: string;
    company: string;
    description: string;
    receiptNo: string;
    amount: string;
    expenseCategory: AuditExpenseCategory;
    sourceOfFunds: string;
    incurredBy: string;
    branchId: string;
  };
  setForm: React.Dispatch<React.SetStateAction<any>>;
  branches: BranchOption[];
  allBranches: BranchOption[];
  suggestions: {
    people: string[];
    companies: string[];
    sources: string[];
    descs: string[];
  };
  noReceiptControl?: React.ReactNode;
  scanPreview: string | null;
  setScanPreview: (v: string | null) => void;
  uploadedReceiptUrl: string | null;
  setUploadedReceiptUrl: (v: string | null) => void;
  uploadingReceipt: boolean;
  handleModalImageUpload: (file: File) => Promise<void>;
  handleModalPaste: () => Promise<void>;
  handleModalDrop: (e: React.DragEvent) => void;
  modalFileInputRef: React.RefObject<HTMLInputElement | null>;
  modalCameraInputRef: React.RefObject<HTMLInputElement | null>;
  setEditing: (row: AuditExpense | null) => void;
}

export default function ExpenseDetailModal({
  detailRow,
  isEditingInModal,
  setIsEditingInModal,
  setDetailRow,
  startEditInModal,
  handleDeleteRecord,
  canModifyRecord,
  dtrLinkedHint,
  setPreviewImage,
  submitReceipt,
  savingReceipt,
  dateRaw,
  setDateRaw,
  dateError,
  setDateError,
  handleDateBlur,
  latestDateStr,
  form,
  setForm,
  branches,
  allBranches,
  suggestions,
  noReceiptControl,
  scanPreview,
  setScanPreview,
  uploadedReceiptUrl,
  setUploadedReceiptUrl,
  uploadingReceipt,
  handleModalImageUpload,
  handleModalPaste,
  handleModalDrop,
  modalFileInputRef,
  modalCameraInputRef,
  setEditing,
}: ExpenseDetailModalProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const cardBg = isLight ? "#ffffff" : "#0d1527";
  const textPrimary = isLight ? "#0f172a" : "#f8fafc";
  const textMuted = isLight ? "#64748b" : "#94a3b8";
  const accent = "#2563EB";
  const danger = "#EF4444";
  const editAccent = "#6366F1";
  const inputBg = isLight ? "#f8fafc" : "#0b1220";
  const inputBorder = isLight ? "#cbd5e1" : "#1e293b";
  const editAlertBg = isLight ? "#EEF2FF" : "rgba(99, 102, 241, 0.08)";
  const editAlertBorder = isLight ? "#C7D2FE" : "rgba(99, 102, 241, 0.25)";
  const editAlertText = isLight ? "#3730A3" : "#C7D2FE";

  const [categoryQuery, setCategoryQuery] = useState("");

  const visibleCategories = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase();
    if (!q) return AUDIT_EXPENSE_CATEGORIES;
    return AUDIT_EXPENSE_CATEGORIES.filter((c) =>
      c.toLowerCase().includes(q),
    );
  }, [categoryQuery]);

  const field = (label: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label
        className="text-xs font-semibold tracking-wide uppercase"
        style={{ color: textMuted }}
      >
        {label}
      </label>
      {children}
    </div>
  );

  if (!detailRow || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2500] flex items-center justify-center p-3 sm:p-6 md:p-8 bg-black/80 backdrop-blur-md transition-opacity duration-200"
      onClick={() => {
        if (!isEditingInModal) setDetailRow(null);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Expense Record Details"
    >
      <div
        className="w-full max-w-2xl lg:max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border"
        style={{
          backgroundColor: cardBg,
          borderColor: isLight ? "#e2e8f0" : "#1e293b",
          boxShadow: isLight
            ? "0 25px 50px -12px rgba(0,0,0,0.25)"
            : "0 25px 60px -12px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modern Minimalist Header ── */}
        <div
          className="flex items-center justify-between px-6 sm:px-8 py-5 border-b shrink-0"
          style={{ borderColor: isLight ? "#f1f5f9" : "#1e293b" }}
        >
          <div>
            <h3
              className="text-lg sm:text-xl font-bold tracking-tight"
              style={{ color: textPrimary }}
            >
              {isEditingInModal ? "Edit Expense Record" : "Expense Record"}
            </h3>
            <div
              className="flex flex-wrap items-center gap-2 text-xs sm:text-sm mt-0.5"
              style={{ color: textMuted }}
            >
              <span>{detailRow.branchName}</span>
              <span>·</span>
              <span>{detailRow.date}</span>
              {!isEditingInModal && detailRow.expenseCategory && (
                <>
                  <span>·</span>
                  <span
                    className="font-medium"
                    style={{ color: isLight ? "#475569" : "#94a3b8" }}
                  >
                    {detailRow.expenseCategory}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (
                !isEditingInModal ||
                window.confirm("Discard unsaved changes?")
              ) {
                setIsEditingInModal(false);
                setDetailRow(null);
                setScanPreview(null);
                setUploadedReceiptUrl(null);
              }
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer hover:opacity-80 active:scale-95"
            style={{
              color: textMuted,
              backgroundColor: isLight ? "#f1f5f9" : "#1e293b",
            }}
            aria-label="Close details modal"
          >
            <X size={18} />
          </button>
        </div>

        {isEditingInModal ? (
          <div className="p-6 sm:p-8 flex flex-col gap-5 overflow-y-auto">
            <div
              className="rounded-xl p-3.5 text-xs border"
              style={{
                backgroundColor: editAlertBg,
                borderColor: editAlertBorder,
                color: editAlertText,
              }}
            >
              <span
                className="font-bold block mb-0.5"
                style={{ color: textPrimary }}
              >
                Editing Persisted Record
              </span>
              <span style={{ color: textMuted }}>
                You are modifying an existing receipt. Saving changes will update
                the record and append to its history log.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {/* Date */}
              {field(
                "Date",
                <div>
                  <input
                    value={dateRaw}
                    id="modal-receipt-date"
                    onChange={(e) => {
                      setDateRaw(e.target.value);
                      setDateError("");
                    }}
                    onBlur={(e) => handleDateBlur(e.target.value)}
                    placeholder={latestDateStr}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                    style={{
                      backgroundColor: inputBg,
                      border: `1px solid ${inputBorder}`,
                      color: textPrimary,
                    }}
                  />
                  {dateError ? (
                    <p className="text-xs mt-1" style={{ color: danger }}>
                      {dateError}
                    </p>
                  ) : form.date ? (
                    <p className="text-xs mt-1" style={{ color: accent }}>
                      ✓ {form.date}
                    </p>
                  ) : null}
                </div>,
              )}

              {/* Branch */}
              {field(
                "Branch",
                <div>
                  <select
                    value={form.branchId}
                    id="modal-receipt-branch"
                    onChange={(e) =>
                      setForm((f: any) => ({ ...f, branchId: e.target.value }))
                    }
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                    style={{
                      backgroundColor: inputBg,
                      border: `1px solid ${inputBorder}`,
                      color: textPrimary,
                      colorScheme: isLight ? "light" : "dark",
                    }}
                  >
                    {(allBranches.length > 0 ? allBranches : branches).map(
                      (b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ),
                    )}
                  </select>
                </div>,
              )}

              {/* Incurred By */}
              {field(
                "Incurred By",
                <AutoSuggestInput
                  value={form.incurredBy}
                  id="modal-receipt-incurredBy"
                  onChange={(v) =>
                    setForm((f: any) => ({ ...f, incurredBy: v }))
                  }
                  suggestions={suggestions.people}
                  placeholder="Who incurred this?"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputClassName="text-sm"
                  inputStyle={{ padding: "8px 12px" }}
                  inputBorder={inputBorder}
                />,
              )}

              {/* Company */}
              {field(
                "Company / Vendor",
                <AutoSuggestInput
                  value={form.company}
                  id="modal-receipt-company"
                  onChange={(v) => setForm((f: any) => ({ ...f, company: v }))}
                  suggestions={suggestions.companies}
                  placeholder="Store or vendor name"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputClassName="text-sm"
                  inputStyle={{ padding: "8px 12px" }}
                  inputBorder={inputBorder}
                />,
              )}

              {/* Receipt No */}
              {field(
                "Receipt No.",
                <input
                  value={form.receiptNo}
                  id="modal-receipt-receiptNo"
                  onChange={(e) =>
                    setForm((f: any) => ({ ...f, receiptNo: e.target.value }))
                  }
                  placeholder="OR / SI number"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all font-mono"
                  style={{
                    backgroundColor: inputBg,
                    border: `1px solid ${inputBorder}`,
                    color: textPrimary,
                  }}
                />,
              )}

              {/* No receipt option */}
              {noReceiptControl && field("Receipt", noReceiptControl)}

              {/* Amount */}
              {field(
                "Amount (₱)",
                <input
                  type="text"
                  value={form.amount}
                  id="modal-receipt-amount"
                  onChange={(e) =>
                    setForm((f: any) => ({ ...f, amount: e.target.value }))
                  }
                  onBlur={(e) => {
                    const numeric = parseFloat(
                      e.target.value.replace(/,/g, ""),
                    );
                    if (!isNaN(numeric)) {
                      setForm((f: any) => ({
                        ...f,
                        amount: numeric.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }),
                      }));
                    }
                  }}
                  placeholder="0.00"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all font-semibold"
                  style={{
                    backgroundColor: inputBg,
                    border: `1px solid ${inputBorder}`,
                    color: textPrimary,
                  }}
                />,
              )}

              {/* Source of Funds */}
              {field(
                "Source of Funds",
                <AutoSuggestInput
                  value={form.sourceOfFunds}
                  id="modal-receipt-sourceOfFunds"
                  onChange={(v) =>
                    setForm((f: any) => ({ ...f, sourceOfFunds: v }))
                  }
                  suggestions={suggestions.sources}
                  placeholder="Petty cash, reimbursement…"
                  {...{ inputBg, textPrimary, textMuted, accent }}
                  inputClassName="text-sm"
                  inputStyle={{ padding: "8px 12px" }}
                  inputBorder={inputBorder}
                />,
              )}

              {/* Description */}
              <div className="sm:col-span-2">
                {field(
                  "Description",
                  <AutoSuggestInput
                    value={form.description}
                    id="modal-receipt-description"
                    onChange={(v) =>
                      setForm((f: any) => ({ ...f, description: v }))
                    }
                    suggestions={suggestions.descs}
                    placeholder="What was purchased?"
                    {...{ inputBg, textPrimary, textMuted, accent }}
                    inputClassName="text-sm"
                    inputStyle={{ padding: "8px 12px" }}
                    inputBorder={inputBorder}
                  />,
                )}
              </div>
            </div>

            {/* ── Receipt Attachment in Edit Modal ── */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: textMuted }}
                >
                  Receipt Attachment
                </label>
                {uploadingReceipt && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-500 font-medium">
                    <Loader2 size={13} className="animate-spin" /> Uploading
                    image to storage…
                  </span>
                )}
                {!uploadingReceipt && (uploadedReceiptUrl || scanPreview) && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                    ✓ Image attached
                  </span>
                )}
              </div>

              <input
                ref={modalFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleModalImageUpload(file);
                  e.target.value = "";
                }}
              />
              <input
                ref={modalCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleModalImageUpload(file);
                  e.target.value = "";
                }}
              />

              {uploadedReceiptUrl || scanPreview ? (
                <div
                  className="rounded-xl border p-3.5 flex flex-col sm:flex-row items-start sm:items-center gap-4 transition-all"
                  style={{
                    backgroundColor: inputBg,
                    borderColor: inputBorder,
                  }}
                >
                  <div
                    onClick={() =>
                      setPreviewImage(uploadedReceiptUrl || scanPreview)
                    }
                    className="relative group cursor-pointer w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden border shrink-0 flex items-center justify-center bg-black/5 dark:bg-black/30"
                    style={{ borderColor: inputBorder }}
                    title="Click to view full size"
                  >
                    <img
                      src={uploadedReceiptUrl || scanPreview || ""}
                      alt="Attached Receipt"
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-[10px] font-semibold px-2 py-1 rounded bg-black/75 text-white">
                        Enlarge
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-between gap-2 w-full">
                    <div>
                      <p
                        className="text-xs font-semibold"
                        style={{ color: textPrimary }}
                      >
                        Receipt Document Attached
                      </p>
                      <p
                        className="text-[11px] mt-0.5"
                        style={{ color: textMuted }}
                      >
                        {uploadingReceipt
                          ? "Compressing and uploading image…"
                          : "This image will be saved with this expense record."}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewImage(uploadedReceiptUrl || scanPreview)
                        }
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: isLight ? "#ffffff" : "#1e293b",
                          borderColor: inputBorder,
                          color: textPrimary,
                        }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        disabled={uploadingReceipt}
                        onClick={() => modalFileInputRef.current?.click()}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: isLight ? "#ffffff" : "#1e293b",
                          borderColor: inputBorder,
                          color: textPrimary,
                        }}
                      >
                        <Upload size={13} />
                        Replace
                      </button>
                      <button
                        type="button"
                        disabled={uploadingReceipt}
                        onClick={() => modalCameraInputRef.current?.click()}
                        className="sm:hidden px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: isLight ? "#ffffff" : "#1e293b",
                          borderColor: inputBorder,
                          color: textPrimary,
                        }}
                      >
                        <Camera size={13} />
                        Camera
                      </button>
                      <button
                        type="button"
                        disabled={uploadingReceipt}
                        onClick={() => {
                          setUploadedReceiptUrl(null);
                          setScanPreview(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-1 cursor-pointer ml-auto"
                      >
                        <Trash2 size={13} />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={handleModalDrop}
                  className="border-2 border-dashed rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all"
                  style={{
                    borderColor: isLight ? "#cbd5e1" : "#334155",
                    backgroundColor: isLight ? "#f8fafc" : "#0b1324",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: isLight ? "#e2e8f0" : "#1e293b",
                        color: textMuted,
                      }}
                    >
                      <Upload size={20} />
                    </div>
                    <div>
                      <p
                        className="text-xs font-semibold"
                        style={{ color: textPrimary }}
                      >
                        No receipt image attached
                      </p>
                      <p
                        className="text-[11px]"
                        style={{ color: textMuted }}
                      >
                        Upload image, take a photo, or paste from clipboard
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={handleModalPaste}
                      className="flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-medium border transition-all hover:opacity-80 flex items-center justify-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: inputBg,
                        borderColor: inputBorder,
                        color: textPrimary,
                      }}
                      title="Paste from clipboard"
                    >
                      <ClipboardPaste size={14} />
                      <span>Paste</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => modalCameraInputRef.current?.click()}
                      className="sm:hidden flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all flex items-center justify-center gap-1 cursor-pointer"
                      style={{ backgroundColor: "#6366F1" }}
                    >
                      <Camera size={14} />
                      <span>Camera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => modalFileInputRef.current?.click()}
                      className="flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all flex items-center justify-center gap-1 cursor-pointer"
                      style={{ backgroundColor: editAccent }}
                    >
                      <Upload size={14} />
                      <span>Upload Receipt</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Category Selection */}
            <div>
              <label
                className="text-xs font-semibold uppercase tracking-wide block mb-2"
                style={{ color: textMuted }}
              >
                Expense Category
              </label>
              <div className="relative mb-2">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: textMuted }}
                />
                <input
                  value={categoryQuery}
                  onChange={(e) => setCategoryQuery(e.target.value)}
                  placeholder="Search category…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-xs font-semibold outline-none"
                  style={{
                    border: `1px solid ${inputBorder}`,
                    backgroundColor: inputBg,
                    color: textPrimary,
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                {visibleCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() =>
                      setForm((f: any) => ({
                        ...f,
                        expenseCategory: cat as AuditExpenseCategory,
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
                    style={{
                      border: `1px solid ${form.expenseCategory === cat ? editAccent : inputBorder}`,
                      backgroundColor:
                        form.expenseCategory === cat
                          ? `${editAccent}22`
                          : inputBg,
                      color:
                        form.expenseCategory === cat
                          ? editAccent
                          : textMuted,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 sm:p-8 flex flex-col gap-6 overflow-y-auto">
            {/* ── Polished Hero Amount Strip ── */}
            <div
              className="rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4 border"
              style={{
                backgroundColor: isLight ? "#f8fafc" : "#0b1324",
                borderColor: isLight ? "#e2e8f0" : "#1e293b",
              }}
            >
              <div className="flex flex-col gap-1">
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: textMuted }}
                >
                  Total Amount
                </span>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-3xl sm:text-4xl font-extrabold tracking-tight"
                    style={{ color: textPrimary }}
                  >
                    ₱{peso(detailRow.amount)}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: textMuted }}
                  >
                    PHP
                  </span>
                </div>
              </div>

              {detailRow.expenseCategory && (
                <div className="shrink-0">
                  <span
                    className="text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-xl border inline-block"
                    style={{
                      backgroundColor: isLight ? "#ffffff" : "#060d1a",
                      borderColor: isLight ? "#e2e8f0" : "#1e293b",
                      color: textPrimary,
                    }}
                  >
                    {detailRow.expenseCategory}
                  </span>
                </div>
              )}
            </div>

            {/* ── Main Details Grid ── */}
            <div
              className={`grid grid-cols-1 ${detailRow.receiptImageUri ? "lg:grid-cols-12" : "grid-cols-1"} gap-6`}
            >
              {/* Left Column: Metadata & Notes */}
              <div
                className={`${detailRow.receiptImageUri ? "lg:col-span-7" : "w-full"} flex flex-col gap-5`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
                  <div>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                      style={{ color: textMuted }}
                    >
                      Company / Vendor
                    </span>
                    <span
                      className="text-sm font-semibold break-words"
                      style={{ color: textPrimary }}
                    >
                      {detailRow.company
                        ? detailRow.company.toUpperCase()
                        : "—"}
                    </span>
                  </div>

                  <div>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                      style={{ color: textMuted }}
                    >
                      Receipt No.
                    </span>
                    <span
                      className="text-sm font-mono font-semibold"
                      style={{ color: textPrimary }}
                    >
                      {detailRow.receiptNo
                        ? detailRow.receiptNo.toUpperCase()
                        : "—"}
                    </span>
                  </div>

                  <div>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                      style={{ color: textMuted }}
                    >
                      Incurred By
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: textPrimary }}
                    >
                      {detailRow.incurredBy ? (
                        <EmployeeNameLink
                          nameOrId={formatDetailsName(detailRow.incurredBy)}
                          displayText={formatDetailsName(detailRow.incurredBy)}
                        />
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>

                  <div>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                      style={{ color: textMuted }}
                    >
                      Submitted By
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: textPrimary }}
                    >
                      <EmployeeNameLink
                        nameOrId={formatDetailsName(detailRow.inputBy)}
                        displayText={formatDetailsName(detailRow.inputBy)}
                      />
                    </span>
                  </div>

                  <div>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                      style={{ color: textMuted }}
                    >
                      Source of Funds
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: textPrimary }}
                    >
                      {detailRow.sourceOfFunds
                        ? detailRow.sourceOfFunds.toUpperCase()
                        : "—"}
                    </span>
                  </div>

                  <div>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                      style={{ color: textMuted }}
                    >
                      Category
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: textPrimary }}
                    >
                      {detailRow.expenseCategory || "—"}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div
                  className="pt-4 border-t"
                  style={{ borderColor: isLight ? "#f1f5f9" : "#1e293b" }}
                >
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider block mb-1.5"
                    style={{ color: textMuted }}
                  >
                    Description
                  </span>
                  <p
                    className="text-sm leading-relaxed whitespace-pre-wrap font-medium"
                    style={{ color: textPrimary }}
                  >
                    {detailRow.description || "—"}
                  </p>
                </div>

                {/* Timeline Activity */}
                <div
                  className="pt-4 border-t"
                  style={{ borderColor: isLight ? "#f1f5f9" : "#1e293b" }}
                >
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider block mb-2.5"
                    style={{ color: textMuted }}
                  >
                    Activity Log
                  </span>
                  <div className="space-y-2">
                    {expenseRecordHistory(detailRow).map((entry, idx) => (
                      <div
                        key={`${entry.action}-${entry.at}-${idx}`}
                        className="flex items-center justify-between text-xs py-1"
                        style={{ color: textMuted }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-semibold uppercase text-[11px]"
                            style={{ color: textPrimary }}
                          >
                            {entry.action === "created" ? "Created" : "Updated"}
                          </span>
                          <span>by</span>
                          <span
                            className="font-semibold"
                            style={{ color: textPrimary }}
                          >
                            <EmployeeNameLink
                              nameOrId={formatDetailsName(entry.by)}
                              displayText={formatDetailsName(entry.by)}
                            />
                          </span>
                        </div>
                        <span className="text-[11px] font-medium">
                          {historyDateTime(entry.at)}
                        </span>
                      </div>
                    ))}
                    {expenseRecordHistory(detailRow).length === 0 && (
                      <span className="text-xs" style={{ color: textMuted }}>
                        No activity records found.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Receipt Image */}
              {detailRow.receiptImageUri && (
                <div className="lg:col-span-5 flex flex-col">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider block mb-2"
                    style={{ color: textMuted }}
                  >
                    Receipt Document
                  </span>
                  <div
                    onClick={() =>
                      setPreviewImage(detailRow.receiptImageUri || null)
                    }
                    className="group relative cursor-pointer rounded-2xl overflow-hidden border flex items-center justify-center p-3 transition-all duration-200 hover:border-slate-400/50"
                    style={{
                      backgroundColor: isLight ? "#ffffff" : "#08111f",
                      borderColor: isLight ? "#e2e8f0" : "#1e293b",
                      minHeight: 280,
                    }}
                    title="Click to view full screen"
                  >
                    <img
                      src={detailRow.receiptImageUri}
                      alt="Receipt Document"
                      className="max-h-[350px] w-auto max-w-full object-contain rounded-lg transition-transform duration-200 group-hover:scale-[1.01]"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold px-3.5 py-1.5 rounded-full bg-black/80 text-white backdrop-blur-sm shadow-md">
                        Click to enlarge
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Modern Minimalist Footer ── */}
        <div
          className="flex items-center justify-between px-6 sm:px-8 py-4 border-t shrink-0"
          style={{ borderColor: isLight ? "#f1f5f9" : "#1e293b" }}
        >
          {isEditingInModal ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Discard unsaved changes?")) {
                    setIsEditingInModal(false);
                    setEditing(null);
                    setScanPreview(null);
                    setUploadedReceiptUrl(null);
                  }
                }}
                className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80 active:scale-95 cursor-pointer"
                style={{
                  color: textMuted,
                  backgroundColor: isLight ? "#f1f5f9" : "#1e293b",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReceipt}
                disabled={savingReceipt}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-95 cursor-pointer"
                style={{ backgroundColor: editAccent }}
              >
                {savingReceipt ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                Apply Changes
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-85 active:scale-95 cursor-pointer border"
                style={{
                  color: textPrimary,
                  backgroundColor: isLight ? "#ffffff" : "#0d1527",
                  borderColor: isLight ? "#e2e8f0" : "#1e293b",
                }}
              >
                Close
              </button>
              <div className="flex items-center gap-3">
                {!canModifyRecord(detailRow) && (
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: textMuted }}
                    title={dtrLinkedHint(detailRow)}
                  >
                    From DTR
                  </span>
                )}
                {canModifyRecord(detailRow) && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEditInModal(detailRow)}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 cursor-pointer shadow-sm"
                      style={{ backgroundColor: "#1e293b" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteRecord(detailRow)}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 cursor-pointer shadow-sm"
                      style={{ backgroundColor: danger }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
