import { createPortal } from "react-dom";
import { useTheme } from "../../contexts/ThemeContext";

interface ExpensePromptModalProps {
  open: boolean;
  onDone: () => void;
  onAddAnother: () => void;
}

export default function ExpensePromptModal({
  open,
  onDone,
  onAddAnother,
}: ExpensePromptModalProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const cardBg = isLight ? "#ffffff" : "#0d1527";
  const border = isLight ? "#e2e8f0" : "#1e293b";
  const textPrimary = isLight ? "#0f172a" : "#f8fafc";
  const textMuted = isLight ? "#64748b" : "#94a3b8";
  const accent = "#2563EB";
  const inputBg = isLight ? "#f8fafc" : "#0b1220";
  const inputBorder = isLight ? "#cbd5e1" : "#1e293b";

  if (!open || typeof document === "undefined") return null;

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
        zIndex: 1100,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
          borderRadius: "1rem",
          width: "100%",
          maxWidth: "380px",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.3)",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div>
          <h3
            style={{
              color: textPrimary,
              fontWeight: "bold",
              fontSize: "1.05rem",
              margin: 0,
            }}
          >
            Receipt saved
          </h3>
          <p
            style={{
              color: textMuted,
              fontSize: "0.875rem",
              margin: "0.35rem 0 0 0",
            }}
          >
            Do you want to add another receipt?
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onDone}
            className="px-4 py-2.5 text-sm rounded-lg font-semibold"
            style={{
              color: textMuted,
              backgroundColor: inputBg,
              border: `1px solid ${inputBorder}`,
            }}
          >
            Done
          </button>
          <button
            type="button"
            onClick={onAddAnother}
            className="px-4 py-2.5 rounded-lg text-sm font-bold text-white shadow"
            style={{ backgroundColor: accent }}
          >
            Add Another
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
