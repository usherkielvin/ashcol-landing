import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import type { AuditExpense } from "../../types/auditExpense";
import { peso } from "./expenseUtils";

interface ExpenseDuplicateModalProps {
  modalData: {
    existingExpense: AuditExpense;
    newExpense: AuditExpense;
  } | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ExpenseDuplicateModal({
  modalData,
  onClose,
  onConfirm,
}: ExpenseDuplicateModalProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const cardBg = isLight ? "#ffffff" : "#0d1527";
  const border = isLight ? "#e2e8f0" : "#1e293b";
  const textPrimary = isLight ? "#0f172a" : "#f8fafc";
  const textMuted = isLight ? "#64748b" : "#94a3b8";
  const accent = "#2563EB";
  const danger = "#EF4444";

  if (!modalData || typeof document === "undefined") return null;

  const { existingExpense, newExpense } = modalData;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
          borderRadius: "1rem",
          width: "100%",
          maxWidth: "680px",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: `1px solid ${border}`,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              backgroundColor: `${danger}22`,
              padding: "0.5rem",
              borderRadius: "0.75rem",
            }}
          >
            <AlertTriangle size={20} style={{ color: danger }} />
          </div>
          <div>
            <h3
              style={{
                color: textPrimary,
                fontWeight: "bold",
                fontSize: "1.125rem",
                margin: 0,
              }}
            >
              Duplicate Expense Record Detected
            </h3>
            <p
              style={{
                color: textMuted,
                fontSize: "0.875rem",
                margin: "0.25rem 0 0 0",
              }}
            >
              Receipt number{" "}
              <span
                style={{
                  fontFamily: "monospace",
                  fontWeight: "bold",
                  color: textPrimary,
                }}
              >
                {newExpense.receiptNo}
              </span>{" "}
              already exists.
            </p>
          </div>
        </div>

        {/* Modal Body - Side-by-Side Comparison */}
        <div
          style={{
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1.5rem",
            }}
          >
            {/* Existing Record */}
            <div
              style={{
                border: `1px solid ${border}`,
                borderRadius: "0.75rem",
                padding: "1rem",
                backgroundColor: isLight ? "#f8fafc" : "#0F1A2E",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  color: textMuted,
                  textTransform: "uppercase",
                  marginBottom: "0.75rem",
                  borderBottom: `1px solid ${border}`,
                  paddingBottom: "0.25rem",
                }}
              >
                Existing Record
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  fontSize: "0.875rem",
                }}
              >
                <div>
                  <strong style={{ color: textMuted }}>Branch:</strong>{" "}
                  <span style={{ color: textPrimary }}>
                    {existingExpense.branchName}
                  </span>
                </div>
                <div>
                  <strong style={{ color: textMuted }}>Date:</strong>{" "}
                  <span
                    style={{
                      color:
                        existingExpense.date === newExpense.date
                          ? textPrimary
                          : "#EF4444",
                      fontWeight:
                        existingExpense.date === newExpense.date
                          ? "normal"
                          : "bold",
                    }}
                  >
                    {existingExpense.date}
                  </span>
                </div>
                <div>
                  <strong style={{ color: textMuted }}>Company:</strong>{" "}
                  <span style={{ color: textPrimary }}>
                    {existingExpense.company}
                  </span>
                </div>
                <div>
                  <strong style={{ color: textMuted }}>Amount:</strong>{" "}
                  <span style={{ color: textPrimary, fontWeight: "bold" }}>
                    ₱{peso(existingExpense.amount)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: textMuted,
                    marginTop: "0.5rem",
                    fontStyle: "italic",
                  }}
                >
                  Incurred By: {existingExpense.incurredBy}
                </div>
              </div>
            </div>

            {/* New Record */}
            <div
              style={{
                border: `1px solid ${accent}44`,
                borderRadius: "0.75rem",
                padding: "1rem",
                backgroundColor: `${accent}05`,
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  color: accent,
                  textTransform: "uppercase",
                  marginBottom: "0.75rem",
                  borderBottom: `1px solid ${accent}22`,
                  paddingBottom: "0.25rem",
                }}
              >
                New Record Details
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  fontSize: "0.875rem",
                }}
              >
                <div>
                  <strong style={{ color: textMuted }}>Branch:</strong>{" "}
                  <span style={{ color: textPrimary }}>
                    {newExpense.branchName}
                  </span>
                </div>
                <div>
                  <strong style={{ color: textMuted }}>Date:</strong>{" "}
                  <span
                    style={{
                      color:
                        existingExpense.date === newExpense.date
                          ? textPrimary
                          : "#EF4444",
                      fontWeight:
                        existingExpense.date === newExpense.date
                          ? "normal"
                          : "bold",
                    }}
                  >
                    {newExpense.date}
                  </span>
                </div>
                <div>
                  <strong style={{ color: textMuted }}>Company:</strong>{" "}
                  <span style={{ color: textPrimary }}>
                    {newExpense.company}
                  </span>
                </div>
                <div>
                  <strong style={{ color: textMuted }}>Amount:</strong>{" "}
                  <span style={{ color: textPrimary, fontWeight: "bold" }}>
                    ₱{peso(newExpense.amount)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: textMuted,
                    marginTop: "0.5rem",
                    fontStyle: "italic",
                  }}
                >
                  Incurred By: {newExpense.incurredBy}
                </div>
              </div>
            </div>
          </div>

          {existingExpense.date !== newExpense.date && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                backgroundColor: isLight ? "#FFFBEB" : "#3C2204",
                border: `1px solid ${isLight ? "#F59E0B" : "#B45309"}`,
                borderRadius: "0.5rem",
                padding: "0.75rem",
                color: isLight ? "#B45309" : "#FBBF24",
                fontSize: "0.825rem",
              }}
            >
              <AlertTriangle size={16} />
              <span>
                Notice: The dates of these two receipts differ. Please double
                check before updating.
              </span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "1rem 1.5rem",
            backgroundColor: isLight ? "#f8fafc" : "#0B132B",
            borderTop: `1px solid ${border}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.75rem",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              border: `1px solid ${border}`,
              color: textPrimary,
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              cursor: "pointer",
              fontWeight: "semibold",
            }}
          >
            Cancel / Edit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              backgroundColor: danger,
              color: "white",
              border: "none",
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            Update Existing Record
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
