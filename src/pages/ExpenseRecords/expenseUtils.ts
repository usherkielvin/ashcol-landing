import type { AuditExpense, AuditExpenseCategory } from "../../types/auditExpense";
import { formatTodayReceiptDate } from "../../utils/auditExpenseDates";

export interface BranchOption {
  id: string;
  name: string;
}

export const normalizeSlug = (str: string) =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const compactSlug = (str: string) =>
  str.toLowerCase().replace(/[^a-z0-9]/g, "");

export const peso = (v: number) =>
  v.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const historyDateTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const time = date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${time} · ${dateStr}`;
};

export const expenseRecordHistory = (row: AuditExpense) => {
  const stored = row.updateHistory || [];
  const fallback = [];
  if (!stored.some((entry) => entry.action === "created") && row.createdAt) {
    fallback.push({
      action: "created" as const,
      by: row.createdBy || row.inputBy || "Unknown",
      at: row.createdAt,
    });
  }
  if (
    !stored.some((entry) => entry.action === "updated") &&
    row.updatedAt &&
    row.updatedAt !== row.createdAt
  ) {
    fallback.push({
      action: "updated" as const,
      by: row.updatedBy || "Unknown",
      at: row.updatedAt,
    });
  }
  return [...fallback, ...stored].sort((a, b) =>
    (a.at || "").localeCompare(b.at || ""),
  );
};

export const formatDetailsName = (raw?: string | null): string => {
  if (!raw || !raw.trim() || raw === "-" || raw === "—") return "—";
  const withoutRole = raw.split(/\s*[-–—]\s*/)[0]?.trim() || raw.trim();
  return withoutRole.toUpperCase();
};

/** A record that moves cash to Head Office / the company bank rather than being a real expense —
 *  category DEPOSIT or FUND TRANSFER, or a description like "DEPOSIT TO HO". */
export const isDtrLinked = (e: { id: string }) => e.id.startsWith("dtr-");

/** Expenses saved from the DTR without a receipt carry this receipt no. (their reason is in the description). */
export const isNoReceipt = (e: { receiptNo?: string }) =>
  (e.receiptNo || "").trim().toUpperCase() === "NO RECEIPT";

/** A DTR-created record belongs to the day of the DTR it was entered on (its id embeds that date). */
export const dtrDateFromId = (id: string): string =>
  /^dtr-.*-(\d{4}-\d{2}-\d{2})-(?:exp|dep|ca)-/.exec(id)?.[1] || "";

export const isDepositRecord = (e: {
  expenseCategory?: string;
  description?: string;
}) => {
  const cat = (e.expenseCategory || "").trim().toUpperCase();
  return (
    cat === "DEPOSIT" ||
    cat === "FUND TRANSFER" ||
    /deposit(ed)?\s*(to|for)?\s*(ho|head\s*office|company\s*bank)/i.test(
      e.description || "",
    )
  );
};

export const emptyForm = (defaultBranchId = "") => ({
  date: formatTodayReceiptDate(),
  company: "",
  description: "",
  receiptNo: "",
  amount: "",
  expenseCategory: "OTHER" as AuditExpenseCategory,
  sourceOfFunds: "",
  incurredBy: "",
  branchId: defaultBranchId,
});

/** A purchase's cash return can only be entered on a later day's DTR, so it is not "missing" until the day after the purchase. */
export const returnIsDue = (purchaseDate?: string) => {
  const n = new Date();
  const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  return !!purchaseDate && purchaseDate < today;
};
