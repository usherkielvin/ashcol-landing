import { createPortal } from "react-dom";
import { useTheme } from "../../contexts/ThemeContext";
import type { AuditExpense } from "../../types/auditExpense";

interface ExpenseActionMenuProps {
  row: AuditExpense | null;
  onClose: () => void;
  onViewDetails: (row: AuditExpense) => void;
  onPickPhoto: (row: AuditExpense) => void;
  onEdit: (row: AuditExpense) => void;
  onDelete: (row: AuditExpense) => void;
  canModifyRecord: (row: { id: string }) => boolean;
  dtrLinkedHint: (row: { date?: string }) => string;
}

export default function ExpenseActionMenu({
  row,
  onClose,
  onViewDetails,
  onPickPhoto,
  onEdit,
  onDelete,
  canModifyRecord,
  dtrLinkedHint,
}: ExpenseActionMenuProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const cardBg = isLight ? "#ffffff" : "#0d1527";
  const border = isLight ? "#e2e8f0" : "#1e293b";
  const textPrimary = isLight ? "#0f172a" : "#f8fafc";
  const textMuted = isLight ? "#64748b" : "#94a3b8";
  const danger = "#EF4444";

  if (!row || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="sm:hidden fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 z-[100] p-4 flex flex-col gap-2 pb-8"
        style={{ animation: "slideUp 0.2s ease-out" }}
      >
        <div
          className="rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ backgroundColor: cardBg }}
        >
          <button
            type="button"
            onClick={() => {
              onViewDetails(row);
              onClose();
            }}
            className="w-full px-5 py-4 text-center text-sm font-bold border-b transition-colors active:bg-black/5"
            style={{ color: textPrimary, borderColor: border }}
          >
            View Details
          </button>
          {!row.receiptImageUri &&
            !/^CASH ADVANCE/i.test(row.expenseCategory || "") && (
              <button
                type="button"
                onClick={() => {
                  onPickPhoto(row);
                  onClose();
                }}
                className="w-full px-5 py-4 text-center text-sm font-bold border-b transition-colors active:bg-black/5"
                style={{ color: danger, borderColor: border }}
              >
                Add Receipt Photo
              </button>
            )}
          {canModifyRecord(row) ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onEdit(row);
                  onClose();
                }}
                className="w-full px-5 py-4 text-center text-sm font-bold border-b transition-colors active:bg-black/5"
                style={{ color: textPrimary, borderColor: border }}
              >
                Edit Record
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(row);
                  onClose();
                }}
                className="w-full px-5 py-4 text-center text-sm font-bold transition-colors active:bg-black/5"
                style={{ color: danger }}
              >
                Delete Record
              </button>
            </>
          ) : (
            <div
              className="w-full px-5 py-4 text-center text-xs font-bold"
              style={{ color: textMuted }}
            >
              From DTR — {dtrLinkedHint(row)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full px-5 py-4 text-center text-sm font-bold rounded-2xl shadow-2xl transition-colors active:bg-black/5 mt-1"
          style={{ backgroundColor: cardBg, color: textMuted }}
        >
          Cancel
        </button>
      </div>
    </>,
    document.body,
  );
}
