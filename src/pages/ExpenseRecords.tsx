import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Upload,
  Building2,
  Plus,
  Trash2,
  Pencil,
  Settings,
  Search,
  X,
  Loader2,
  ChevronDown,
  ClipboardPaste,
  Download,
  ClipboardList,
  CalendarDays,
  Camera,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import {
  API_BASE_URL,
  formatRole,
  isSameBaseBranch,
  branchAliasKey,
  isPortalAdmin,
  resolveArchivesBranchFilter,
} from "../utils/api";
import type { AuditExpense, AuditExpenseCategory } from "../types/auditExpense";
import { AUDIT_EXPENSE_CATEGORIES } from "../types/auditExpense";
import { formatTodayReceiptDate } from "../utils/auditExpenseDates";
import {
  createExpenseId,
  deleteAuditExpense,
  findExpenseByReceiptNo,
  readSavedBranchExpenses,
  readSavedFeed,
  syncBranchExpenses,
  upsertAuditExpense,
  writeCachedBranchExpenses,
  writeSavedFeed,
} from "../utils/auditExpenseStorage";
import {
  loadAuditExpenseCategories,
  saveAuditExpenseCategory,
  deleteAuditExpenseCategory,
  reorderAuditExpenseCategories,
  type AuditExpenseCategoryDetail,
} from "../utils/auditExpenseCategoryStorage";
import { parseSmartDate, dateToTime } from "../utils/smartDate";
import { fetchCachedBranches } from "../utils/portalDirectoryCache";
import AutoSuggestInput from "../components/AutoSuggestInput";
import AshcolLoader from "../components/AshcolLoader";
import * as XLSX from "xlsx";
import { uploadReceiptImage } from "../services/supabaseStorage";
import ReceiptScanDialog, {
  type ReceiptDialogResult,
  NO_RECEIPT_NO,
  NO_RECEIPT_SEP,
} from "../components/ReceiptScanDialog";
import ExpensePromptModal from "./ExpenseRecords/ExpensePromptModal";
import ExpenseActionMenu from "./ExpenseRecords/ExpenseActionMenu";
import ExpenseDuplicateModal from "./ExpenseRecords/ExpenseDuplicateModal";
import ExpenseReceiptPreview from "./ExpenseRecords/ExpenseReceiptPreview";
import ExpenseTable from "./ExpenseRecords/ExpenseTable";
import ExpenseDetailModal from "./ExpenseRecords/ExpenseDetailModal";
import {
  type BranchOption,
  normalizeSlug,
  compactSlug,
  isDtrLinked,
  isNoReceipt,
  dtrDateFromId,
  isDepositRecord,
  emptyForm,
  returnIsDue,
} from "./ExpenseRecords/expenseUtils";

type DtrSummary = {
  loading: boolean;
  total: number | null;
  payroll: number;
  purchases: number;
  deposits: number;
  matched: boolean;
};

// Kept outside the component so they survive leaving the page: coming back shows the last DTR totals and purchases
// at once (each is still refreshed in the background), instead of waiting on the loading screen again.
const dtrSummaryMemory = new Map<string, DtrSummary>();
const purchasesMemory = new Map<string, Record<string, unknown>[]>();

export default function ExpenseRecords() {
  const { branchSlug } = useParams<{ branchSlug?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Seamlessly redirect legacy /audit-expenses paths to clean /expenses URLs
  useEffect(() => {
    if (location.pathname.startsWith("/audit-expenses")) {
      const newPath = location.pathname.replace(
        /^\/audit-expenses/,
        "/expenses",
      );
      navigate(newPath + location.search, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const { theme } = useTheme();
  const { user } = useAuth();
  const isLight = theme === "light";
  const bg = isLight ? "#f0f4f8" : "#060D1A";
  const cardBg = isLight ? "#ffffff" : "#0A1120";
  const border = isLight ? "#e2e8f0" : "#1E2D48";
  const textPrimary = isLight ? "#0f172a" : "#E2E8F0";
  const textMuted = isLight ? "#64748b" : "#7A95B8";
  const inputBg = isLight ? "#f8fafc" : "#0F1A2E";
  const inputBorder = isLight ? "#cbd5e1" : "#243452";
  const accent = "#10B981";
  const danger = "#EF4444";
  const editAccent = "#6366F1";
  const editAlertBg = isLight ? "#EEF2FF" : "rgba(99, 102, 241, 0.08)";
  const editAlertBorder = isLight ? "#C7D2FE" : "rgba(99, 102, 241, 0.2)";
  const editAlertText = isLight ? "#4F46E5" : "#818CF8";

  const role = (user?.role || "").toLowerCase();
  const currentUserLabel = user?.jobTitle
    ? `${user?.name || user?.email} - ${user.jobTitle}`
    : `${user?.name || user?.email || "STAFF"} - ${formatRole(user?.role || "USER")}`;
  const isAdmin = isPortalAdmin(role);
  // Branch members enter expenses on the DTR (which creates the record), so Expense Records and the
  // DTR always match. Only admins/management/managers add records here directly.
  const canAddRecord = isAdmin || role === "manager";
  // DTR-linked records stay in sync with their DTR, so only admins may change them here.
  const canModifyRecord = (row: { id: string }) => isAdmin || !isDtrLinked(row);
  const dtrLinkedHint = (row: { date?: string }) =>
    `Edit this on the DTR for ${row.date || "that date"}`;
  const isManager = role === "manager";
  const isBranchScopedUser = !isAdmin && !!user?.branchId;
  const canAccess =
    isAdmin ||
    isManager ||
    role === "staff" ||
    role === "employee" ||
    role === "oic";

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [allBranches, setAllBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState("");
  const [expenses, setExpenses] = useState<AuditExpense[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  // The records could not be loaded (server error or no answer): say so instead of showing an empty list.
  const [loadError, setLoadError] = useState(false);
  // The ASHCOL splash stays up until the records AND the default month's summary data (DTR totals, purchases) are in, so
  // the page opens complete instead of filling in piece by piece. Shown once per visit; a timeout stops it hanging.
  const [revealed, setRevealed] = useState(false);
  const [dtrSettledKey, setDtrSettledKey] = useState("");
  const [purchasesSettledFor, setPurchasesSettledFor] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AuditExpense | null>(null);
  const [showAddAnotherPrompt, setShowAddAnotherPrompt] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    isOpen: boolean;
    existingExpense: AuditExpense;
    newExpense: AuditExpense;
  } | null>(null);
  const [detailRow, setDetailRow] = useState<AuditExpense | null>(null);
  const [actionMenuRow, setActionMenuRow] = useState<AuditExpense | null>(null);
  const [isEditingInModal, setIsEditingInModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const activeAccent = editing ? editAccent : accent;
  const [dateRaw, setDateRaw] = useState(formatTodayReceiptDate());
  const [dateError, setDateError] = useState("");
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState(() =>
    new Date()
      .toLocaleDateString("en-US", { month: "long", year: "numeric" })
      .toUpperCase(),
  );
  const [sortConfig] = useState<{
    key: keyof AuditExpense;
    direction: "asc" | "desc";
  } | null>({ key: "date", direction: "desc" });
  const [scanning, setScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set());
  const [scanError, setScanError] = useState("");
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState<string | null>(
    null,
  );
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // Attach a missing receipt photo to an existing record without opening the edit form.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<AuditExpense | null>(null);
  const [attachingPhotoId, setAttachingPhotoId] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  // "No receipt available" option of the record form (same convention as the DTR: receipt no. NO RECEIPT + reason in the description)
  const [noReceiptForm, setNoReceiptForm] = useState(false);
  const [noReceiptReasonForm, setNoReceiptReasonForm] = useState("");
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60000) return;
      last = Date.now();
      setDataVersion((v) => v + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  // "Why the difference?" stays folded until asked for.
  const [whyOpen, setWhyOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const modalCameraInputRef = useRef<HTMLInputElement>(null);
  const [branchEmployees, setBranchEmployees] = useState<string[]>([]);

  useEffect(() => {
    if (!previewImage && !detailRow) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewImage) {
          setPreviewImage(null);
        } else if (detailRow && !isEditingInModal) {
          setDetailRow(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage, detailRow, isEditingInModal]);

  // --- Tab state ---
  const activeTab = "expenses";

  // Dynamic categories state
  const [categories, setCategories] = useState<AuditExpenseCategoryDetail[]>(
    [],
  );
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [editingCategoryDetail, setEditingCategoryDetail] =
    useState<AuditExpenseCategoryDetail | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const newCategoryRef = useRef<HTMLInputElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const reloadCategories = useCallback(async () => {
    try {
      const data = await loadAuditExpenseCategories();
      setCategories(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const resolveFormBranchId = useCallback(
    (id: string) => {
      if (!id) return "";
      const list = allBranches.length > 0 ? allBranches : branches;
      const exists = list.some((b) => b.id === id);
      if (!exists) {
        if (
          id.toLowerCase().includes("taguig") ||
          id.startsWith("2880c29e-581c-11f1-bf8c-74d4dd6dfc0b")
        ) {
          const isServ = id.toLowerCase().includes("service");
          return isServ ? "BR-TAGUIG-SERVICES" : "BR-TAGUIG-SALES";
        }
        const splitOption = list.find((b) => b.id.startsWith(`${id}-`));
        if (splitOption) {
          const salesOption = list.find((b) => b.id === `${id}-sales`);
          return salesOption ? salesOption.id : splitOption.id;
        }
      }
      return id;
    },
    [branches, allBranches],
  );

  useEffect(() => {
    void reloadCategories();
  }, [reloadCategories]);

  // Always alphabetical, so a category is easy to find.
  const allCategories = useMemo(() => {
    const names =
      categories.length > 0
        ? categories.map((c) => c.name)
        : AUDIT_EXPENSE_CATEGORIES;
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [categories]);
  const sortedCategoryDetails = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );
  const [categoryQuery, setCategoryQuery] = useState("");
  const visibleCategories = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase();
    return q
      ? allCategories.filter((c) => c.toLowerCase().includes(q))
      : allCategories;
  }, [allCategories, categoryQuery]);

  const saveCustomCategory = async () => {
    const val = newCategoryInput.trim().toUpperCase();
    if (!val) {
      setAddingCategory(false);
      setNewCategoryInput("");
      return;
    }
    if (!allCategories.includes(val)) {
      try {
        await saveAuditExpenseCategory({ name: val });
        await reloadCategories();
      } catch (err) {
        console.error(err);
        alert("Failed to save category.");
      }
    }
    setForm((f) => ({ ...f, expenseCategory: val as AuditExpenseCategory }));
    setAddingCategory(false);
    setNewCategoryInput("");
  };

  const startEditingCategoryName = (cat: AuditExpenseCategoryDetail) => {
    setEditingCategoryDetail(cat);
    setEditingCategoryName(cat.name);
  };

  const handleSaveCategoryName = async (cat: AuditExpenseCategoryDetail) => {
    const val = editingCategoryName.trim().toUpperCase();
    if (!val) {
      setEditingCategoryDetail(null);
      return;
    }
    try {
      await saveAuditExpenseCategory({ ...cat, name: val });
      setEditingCategoryDetail(null);
      await reloadCategories();
    } catch (err) {
      console.error(err);
      alert("Failed to update category name.");
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...categories];
    const draggedItem = updated[draggedIndex];
    updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    setCategories(updated);
  };

  const handleDragEnd = async () => {
    setDraggedIndex(null);
    try {
      const ids = categories.map((c) => c.id);
      await reorderAuditExpenseCategories(ids);
      await reloadCategories();
    } catch (err) {
      console.error("Failed to save category order:", err);
      alert("Failed to save category order.");
    }
  };

  useEffect(() => {
    if (addingCategory) setTimeout(() => newCategoryRef.current?.focus(), 50);
  }, [addingCategory]);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "";

  const branchExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        if (!e.branchId) return false;

        const eBidLower = e.branchId.toLowerCase().trim();
        const selBidLower = branchId.toLowerCase().trim();

        // Taguig is split into Sales and Services. A record whose id says Sales can still carry a Services
        // branch name (older DTR pushes were stored as Sales), so the name decides the line, not just the id.
        const selIsSales = selBidLower.endsWith("-sales");
        const selIsServices =
          selBidLower.endsWith("-services") || selBidLower.endsWith("-service");
        if (selIsSales || selIsServices) {
          const recIsServices =
            /-services?$/.test(eBidLower) ||
            /service/i.test(e.branchName || "");
          if (selIsSales && recIsServices) return false;
          if (selIsServices && !recIsServices) return false;
        }

        // Exact match
        if (eBidLower === selBidLower) return true;

        // If we are filtering for a "-sales" branch
        if (selBidLower.endsWith("-sales")) {
          const baseSel = selBidLower.replace(/-sales$/, "");
          const baseE = eBidLower.replace(/-(sales|services|service)$/, "");

          const isExpenseService =
            eBidLower.endsWith("-services") ||
            eBidLower.endsWith("-service") ||
            (e.branchName &&
              (e.branchName.toLowerCase().includes("service") ||
                e.branchName.toLowerCase().includes("services")));

          if (
            (baseE === baseSel ||
              (baseSel.includes("taguig") && baseE.includes("taguig"))) &&
            !isExpenseService
          )
            return true;

          // Legacy Taguig Sales IDs
          if (baseSel.includes("taguig")) {
            if (
              eBidLower === "2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-sales" ||
              eBidLower === "2880c29e-581c-11f1-bf8c-74d4dd6dfc0b"
            )
              return true;
            const nameUpper = (e.branchName || "").toUpperCase();
            if (
              (nameUpper === "ASHCOL TAGUIG" ||
                nameUpper === "TAGUIG" ||
                nameUpper.includes("TAGUIG SALES") ||
                nameUpper.includes("TAGUIG - SALES")) &&
              !isExpenseService
            )
              return true;
          }
        }

        // If we are filtering for a "-services" branch
        if (
          selBidLower.endsWith("-services") ||
          selBidLower.endsWith("-service")
        ) {
          const baseSel = selBidLower.replace(/-(services|service)$/, "");
          const baseE = eBidLower.replace(/-(sales|services|service)$/, "");

          const isExpenseService =
            eBidLower.endsWith("-services") ||
            eBidLower.endsWith("-service") ||
            (e.branchName &&
              (e.branchName.toLowerCase().includes("service") ||
                e.branchName.toLowerCase().includes("services")));

          if (
            (baseE === baseSel ||
              (baseSel.includes("taguig") && baseE.includes("taguig"))) &&
            isExpenseService
          )
            return true;

          // Legacy Taguig Services IDs
          if (baseSel.includes("taguig")) {
            if (eBidLower === "2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-services")
              return true;
            const nameUpper = (e.branchName || "").toUpperCase();
            if (
              nameUpper.includes("TAGUIG") &&
              (nameUpper.includes("SERVICE") || nameUpper.includes("SERVICES"))
            )
              return true;
          }
        }

        // Base branch match (e.g. BR-DASMA vs UUID or alias)
        if (
          isSameBaseBranch(e.branchId, branchId) ||
          isSameBaseBranch(e.branchId, branchName)
        )
          return true;

        // Cleaned branch name match (e.g. "DASMA" === "DASMA")
        if (e.branchName && branchName) {
          const cleanE = e.branchName
            .replace(/^(ashcol\s+)/i, "")
            .trim()
            .toUpperCase();
          const cleanB = branchName
            .replace(/^(ashcol\s+)/i, "")
            .trim()
            .toUpperCase();
          if (cleanE && cleanB && cleanE === cleanB) return true;
        }

        // Alias keyword match (e.g. "dasma" in branchId or branchName)
        const aliasE =
          branchAliasKey(e.branchId) || branchAliasKey(e.branchName);
        const aliasSel = branchAliasKey(branchId) || branchAliasKey(branchName);
        if (aliasE && aliasSel && aliasE === aliasSel) return true;

        return false;
      })
      .map((e) => {
        const dtrDate = dtrDateFromId(e.id);
        return {
          ...e,
          date:
            (dtrDate && (parseSmartDate(dtrDate) || dtrDate)) ||
            parseSmartDate(e.date) ||
            e.date,
        };
      });
  }, [expenses, branchId, branchName]);

  // Suggestions derived from past expenses (limited to current branch)
  const suggestions = useMemo(() => {
    const companies = [
      ...new Set(branchExpenses.map((e) => e.company).filter(Boolean)),
    ].sort();
    const descs = [
      ...new Set(branchExpenses.map((e) => e.description).filter(Boolean)),
    ].sort();

    const peopleSet = new Set<string>();
    branchExpenses
      .map((e) => e.incurredBy)
      .filter(Boolean)
      .forEach((p) => peopleSet.add(p.toUpperCase().trim()));
    branchEmployees.forEach((name) => peopleSet.add(name));
    const people = Array.from(peopleSet).sort();

    const sources = [
      ...new Set(branchExpenses.map((e) => e.sourceOfFunds).filter(Boolean)),
    ].sort();
    return { companies, descs, people, sources };
  }, [branchExpenses, branchEmployees]);

  const latestDateStr = useMemo(() => {
    let maxTime = 0;
    let maxDateStr = "";
    for (const e of branchExpenses) {
      if (!e.date) continue;
      const t = dateToTime(e.date);
      if (t > maxTime) {
        maxTime = t;
        maxDateStr = e.date;
      }
    }
    let targetDate = new Date();
    if (maxDateStr) {
      const parsed = new Date(maxDateStr);
      if (!isNaN(parsed.getTime())) targetDate = parsed;
    }
    return targetDate
      .toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
      .toUpperCase();
  }, [branchExpenses]);

  const loadBranches = useCallback(async () => {
    try {
      const token =
        localStorage.getItem("ashcol-token") ||
        sessionStorage.getItem("ashcol-token") ||
        "";
      const data = await fetchCachedBranches(token);
      const list: BranchOption[] = (data as { id: string; name: string }[]).map(
        (b) => ({ id: b.id, name: b.name }),
      );

      const newList: BranchOption[] = [];
      for (const b of list) {
        const cleanName = b.name.replace(/^(ashcol\s+)/i, "");
        const cleanNameUpper = cleanName.toUpperCase();
        const idUpper = (b.id || "").toUpperCase();

        if (
          idUpper === "BR-TAGUIG-SALES" ||
          idUpper === "2880C29E-581C-11F1-BF8C-74D4DD6DFC0B"
        ) {
          if (!newList.some((item) => item.id === "BR-TAGUIG-SALES")) {
            newList.push({ id: "BR-TAGUIG-SALES", name: "TAGUIG - SALES" });
          }
          if (!newList.some((item) => item.id === "BR-TAGUIG-SERVICES")) {
            newList.push({ id: "BR-TAGUIG-SERVICES", name: "TAGUIG - SERVICES" });
          }
        } else if (
          idUpper === "BR-TAGUIG-SERVICES" ||
          idUpper === "2880C29E-581C-11F1-BF8C-74D4DD6DFC0B-SERVICES" ||
          idUpper === "BR-TAGUIG-SALES-SERVICES"
        ) {
          if (!newList.some((item) => item.id === "BR-TAGUIG-SERVICES")) {
            newList.push({ id: "BR-TAGUIG-SERVICES", name: "TAGUIG - SERVICES" });
          }
        } else if (cleanNameUpper === "TAGUIG" || cleanNameUpper === "ASHCOL TAGUIG") {
          if (!newList.some((item) => item.id === "BR-TAGUIG-SALES")) {
            newList.push({ id: "BR-TAGUIG-SALES", name: "TAGUIG - SALES" });
          }
          if (!newList.some((item) => item.id === "BR-TAGUIG-SERVICES")) {
            newList.push({ id: "BR-TAGUIG-SERVICES", name: "TAGUIG - SERVICES" });
          }
        } else if (cleanNameUpper.includes("TAGUIG")) {
          const isServ = cleanNameUpper.includes("SERVICE");
          const tId = isServ ? "BR-TAGUIG-SERVICES" : "BR-TAGUIG-SALES";
          if (!newList.some((item) => item.id === tId)) {
            newList.push({
              id: tId,
              name: isServ ? "TAGUIG - SERVICES" : "TAGUIG - SALES",
            });
          }
        } else {
          newList.push({ id: b.id, name: cleanName });
        }
      }

      newList.sort((a, b) => a.name.localeCompare(b.name));

      let finalList = newList;
      if (isBranchScopedUser && user?.branchId) {
        const userBranchLower = user.branchId.toLowerCase();
        const isUserTaguig =
          userBranchLower.includes("taguig") ||
          userBranchLower.startsWith("2880c29e-581c-11f1-bf8c-74d4dd6dfc0b");
        finalList = newList.filter((b) => {
          if (isUserTaguig) {
            const emailLower = (user?.email || "").toLowerCase();
            const isServicesUser =
              userBranchLower.includes("service") ||
              emailLower.includes("service");
            const bNameUpper = b.name.toUpperCase();
            if (isServicesUser) {
              return (
                bNameUpper.includes("SERVICE") ||
                bNameUpper.includes("SERVICES")
              );
            } else {
              return bNameUpper.includes("SALES");
            }
          } else {
            const userBranchIdUpper = user.branchId!.toUpperCase();
            const bIdUpper = b.id.toUpperCase();
            return (
              bIdUpper === userBranchIdUpper ||
              bIdUpper.startsWith(userBranchIdUpper + "-") ||
              userBranchIdUpper.startsWith(bIdUpper + "-")
            );
          }
        });
      }

      setBranches(finalList);
      setAllBranches(newList);
      return finalList.length;
    } catch (e) {
      console.error(e);
      return -1;
    }
  }, [isBranchScopedUser, user]);

  // Only the selected branch's records are loaded (the server narrows them down), and the last copy of each branch is
  // kept so the page opens at once on a slow link and refreshes behind it. The key carries the user so one account's
  // cached records are never shown to another.
  const expenseCacheKey = branchId
    ? `${(user?.email || "user").toLowerCase()}|${branchId}`
    : "";
  // Latest request wins: a slow answer for a branch the user already left must not overwrite the current one.
  const expensesRequest = useRef(0);

  // A receipt record whose link to its purchase was lost: attach it to the purchase again.
  const linkRecordToPurchase = async (recordId: string, purchaseId: string, label: string) => {
    if (!purchaseId) return;
    if (!window.confirm(`Link this record to the purchase\n\n${label}\n\nas its receipt?`)) return;
    const token = localStorage.getItem("ashcol-token") || sessionStorage.getItem("ashcol-token") || "";
    const res = await fetch(`${API_BASE_URL}/v1/reports/purchases/${encodeURIComponent(purchaseId)}/link-expense`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ expenseId: recordId }),
    });
    if (!res.ok) {
      let msg = `Could not link the record (HTTP ${res.status})`;
      try { const j = await res.json(); msg = j.error || j.message || msg; } catch { /* keep default */ }
      alert(msg);
      return;
    }
    setDataVersion((v) => v + 1);
    await reload();
  };

  // A record whose date was misread (e.g. 2024 instead of 2026) falls into another month: put it on its DTR's date.
  const moveRecordsToDtrDate = async (recIds: string[], isoDate: string) => {
    const label = parseSmartDate(isoDate) || isoDate;
    if (!window.confirm(`Change the date of ${recIds.length === 1 ? "this record" : `these ${recIds.length} records`} to ${label} (the DTR date)?`)) return;
    try {
      for (const id of recIds) {
        const rec = expenses.find((e) => e.id === id);
        if (rec) await upsertAuditExpense({ ...rec, date: label });
      }
      await reload();
    } catch (err) {
      console.error("[Expense Records] Failed to move record date:", err);
      alert("Could not update the record date. Try again.");
    }
  };

  const reload = useCallback(async () => {
    if (!branchId) return;
    const requestId = ++expensesRequest.current;
    try {
      const data = await syncBranchExpenses(
        { branchId, branchName },
        readSavedBranchExpenses(expenseCacheKey),
      );
      if (requestId !== expensesRequest.current) return;
      setExpenses(data);
      setLoadError(false);
      writeCachedBranchExpenses(expenseCacheKey, data);
    } catch (err) {
      // Keep what is on screen: a failed refresh must not blank the list.
      console.error("[ExpenseRecords] Reload error:", err);
    }
  }, [branchId, branchName, expenseCacheKey]);

  // Branch list first — it decides which branch's records to ask for. It may not keep the loading screen up forever.
  useEffect(() => {
    if (!canAccess) return;
    let active = true;
    Promise.race([
      loadBranches(),
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error("branches timed out")), 25000),
      ),
    ])
      .then((count) => {
        if (!active) return;
        if (count < 0) setLoadError(true);
        // No branch to show means no records request will follow, so nothing else would end the loading screen.
        if (count <= 0) setInitialLoading(false);
      })
      .catch((err) => {
        console.error("[ExpenseRecords] Branch load error:", err);
        if (active) {
          setLoadError(true);
          setInitialLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [canAccess, loadBranches]);

  // Records of the selected branch: show the kept copy immediately, then replace it with the server's.
  useEffect(() => {
    if (!branchId) return;
    let active = true;
    const requestId = ++expensesRequest.current;
    const saved = readSavedBranchExpenses(expenseCacheKey);
    if (saved) {
      setExpenses(saved.rows);
      setInitialLoading(false);
    } else {
      // Nothing kept for this branch: wait on the loading screen rather than show another branch's totals as zero.
      setExpenses([]);
      setInitialLoading(true);
    }
    // With a saved copy only what changed since is downloaded; without one, the whole branch.
    syncBranchExpenses({ branchId, branchName }, saved)
      .then((data) => {
        if (!active || requestId !== expensesRequest.current) return;
        setExpenses(data);
        setLoadError(false);
        writeCachedBranchExpenses(expenseCacheKey, data);
      })
      .catch((err) => {
        console.error("[ExpenseRecords] Preload error:", err);
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branchId, branchName, expenseCacheKey]);

  // When branches load, initialize active branchId
  useEffect(() => {
    if (branches.length === 0) return;
    if (branchId && branches.some((b) => b.id === branchId)) return;

    let targetBranch: BranchOption | undefined;
    if (branchSlug) {
      const clean = normalizeSlug(branchSlug);
      const compact = compactSlug(branchSlug);
      targetBranch = branches.find(
        (b) =>
          normalizeSlug(b.name) === clean ||
          compactSlug(b.name) === clean ||
          normalizeSlug(b.id) === clean ||
          compactSlug(b.id) === compact,
      );
    }

    if (!targetBranch) {
      if (isBranchScopedUser && user?.branchId) {
        const userBranchLower = user.branchId.toLowerCase();
        const isUserTaguig =
          userBranchLower.includes("taguig") ||
          userBranchLower.startsWith("2880c29e-581c-11f1-bf8c-74d4dd6dfc0b");
        if (isUserTaguig) {
          const emailLower = (user?.email || "").toLowerCase();
          const isServicesUser =
            userBranchLower.includes("service") ||
            emailLower.includes("service");
          targetBranch = branches.find((b) => {
            const bNameUpper = b.name.toUpperCase();
            return isServicesUser
              ? bNameUpper.includes("SERVICE")
              : bNameUpper.includes("SALES");
          });
        } else {
          const userBranchIdUpper = user.branchId.toUpperCase();
          targetBranch = branches.find(
            (b) => b.id.toUpperCase() === userBranchIdUpper,
          );
        }
      } else {
        const storedGlobal = localStorage.getItem("ashcol-global-branch-id");
        const resolved = resolveArchivesBranchFilter(
          storedGlobal,
          branches,
          user,
        );
        targetBranch = branches.find((b) => b.id === resolved);
      }
    }

    const nextBranch = targetBranch || branches[0];
    if (nextBranch) {
      setBranchId(nextBranch.id);
      if (isAdmin) {
        const storedGlobal = localStorage.getItem("ashcol-global-branch-id");
        if (storedGlobal !== nextBranch.id) {
          localStorage.setItem("ashcol-global-branch-id", nextBranch.id);
          window.dispatchEvent(new Event("ashcol-global-branch-change"));
        }
      }
    }
  }, [branches, branchSlug, branchId, isAdmin, isBranchScopedUser, user]);

  // Sync active branch when admin changes the global branch in the top navbar
  useEffect(() => {
    if (!isAdmin || branches.length === 0) return;
    const syncFromGlobal = () => {
      const gId = localStorage.getItem("ashcol-global-branch-id");
      const resolved = resolveArchivesBranchFilter(gId, branches, user);
      if (resolved) {
        setBranchId((prev) => (resolved !== prev ? resolved : prev));
      }
    };
    window.addEventListener("ashcol-global-branch-change", syncFromGlobal);
    return () =>
      window.removeEventListener("ashcol-global-branch-change", syncFromGlobal);
  }, [isAdmin, branches, user]);

  // Sync active branch with branchSlug in URL (e.g. /expenses/silang or /expenses/taguig-sales)
  useEffect(() => {
    if (!branchSlug || branches.length === 0) return;
    const clean = normalizeSlug(branchSlug);
    const compact = compactSlug(branchSlug);
    const matched = branches.find(
      (b) =>
        normalizeSlug(b.name) === clean ||
        compactSlug(b.name) === compact ||
        normalizeSlug(b.id) === clean ||
        compactSlug(b.id) === compact,
    );
    
    if (matched) {
      setBranchId((prev) => {
        if (matched.id !== prev) {
          if (isAdmin) {
            const stored = localStorage.getItem("ashcol-global-branch-id");
            if (stored !== matched.id) {
              localStorage.setItem("ashcol-global-branch-id", matched.id);
              // Defer the event dispatch to prevent synchronous event loops during render
              setTimeout(() => {
                window.dispatchEvent(new Event("ashcol-global-branch-change"));
              }, 0);
            }
          }
          return matched.id;
        }
        return prev;
      });
    }
  }, [branchSlug, branches, isAdmin]);

  // Keep URL path in sync with active branch (e.g. /expenses/silang)
  useEffect(() => {
    if (!branchId || branches.length === 0) return;
    if (location.pathname.startsWith("/audit-expenses")) return;
    const currentBranch = branches.find((b) => b.id === branchId);
    if (!currentBranch) return;
    const expectedSlug = normalizeSlug(currentBranch.name);
    const currentSlug = branchSlug ? normalizeSlug(branchSlug) : "";
    if (currentSlug !== expectedSlug) {
      navigate(`/expenses/${expectedSlug}${location.search}`, {
        replace: true,
      });
    }
  }, [
    branchId,
    branches,
    branchSlug,
    location.pathname,
    location.search,
    navigate,
  ]);

  useEffect(() => {
    if (!branchId) return;
    const fetchEmployees = async () => {
      try {
        const token =
          localStorage.getItem("ashcol-token") ||
          sessionStorage.getItem("ashcol-token") ||
          "";
        const res = await fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const list = data?.data || [];
          const names = list
            .filter(
              (emp: {
                branchId: string;
                isActive?: boolean;
                name?: string;
              }) => {
                return (
                  isSameBaseBranch(emp.branchId, branchId) &&
                  emp.isActive !== false &&
                  emp.name?.trim()
                );
              },
            )
            .map((emp: { name: string }) => emp.name.toUpperCase().trim());
          setBranchEmployees(names);
        }
      } catch (err) {
        console.error("Error fetching employees for suggestions:", err);
      }
    };
    void fetchEmployees();
  }, [branchId]);

  useEffect(() => {
    if (showForm) {
      setTimeout(() => {
        document.getElementById("receipt-date")?.focus();
      }, 50);
    }
  }, [showForm]);

  useEffect(() => {
    if (!editing && branchId) {
      setForm((f) => ({ ...f, branchId: resolveFormBranchId(branchId) }));
    }
  }, [branchId, editing, resolveFormBranchId]);

  // Real calendar months, January 2026 up to the current month (newest first). Not derived from record dates, so a
  // mistyped receipt date can never add a bogus month such as "SEPTEMBER 2024".
  const availableMonths = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    for (
      let y = now.getFullYear(), m = now.getMonth();
      y > 2026 || (y === 2026 && m >= 0);
      m--
    ) {
      if (m < 0) {
        y--;
        m = 11;
      }
      months.push(
        new Date(y, m, 1)
          .toLocaleDateString("en-US", { month: "long", year: "numeric" })
          .toUpperCase(),
      );
    }
    return months;
  }, []);

  // Possible duplicates: same receipt no. + amount, or (no receipt no.) same date + amount + description.
  const duplicateInfo = useMemo(() => {
    const groups = new Map<string, AuditExpense[]>();
    for (const e of branchExpenses) {
      const amt = Number(e.amount || 0).toFixed(2);
      const receipt = isNoReceipt(e)
        ? ""
        : (e.receiptNo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const key = receipt
        ? `R|${receipt}|${amt}`
        : `D|${dateToTime(e.date)}|${amt}|${(e.description || "").toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
      const list = groups.get(key);
      if (list) list.push(e);
      else groups.set(key, [e]);
    }
    const ids = new Set<string>();
    for (const list of groups.values()) {
      if (list.length > 1) list.forEach((e) => ids.add(e.id));
    }
    return { ids, groups };
  }, [branchExpenses]);
  const [showDupesOnly, setShowDupesOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...branchExpenses];
    if (showDupesOnly) rows = rows.filter((e) => duplicateInfo.ids.has(e.id));

    if (filterMonth !== "All") {
      rows = rows.filter((e) => {
        if (!e.date) return false;
        const d = new Date(e.date);
        if (!isNaN(d.getTime())) {
          return (
            d
              .toLocaleDateString("en-US", { month: "long", year: "numeric" })
              .toUpperCase() === filterMonth
          );
        }
        return false;
      });
    }

    if (q) {
      rows = rows.filter(
        (e) =>
          (e.company || "").toLowerCase().includes(q) ||
          (e.description || "").toLowerCase().includes(q) ||
          (e.receiptNo || "").toLowerCase().includes(q) ||
          (e.incurredBy || "").toLowerCase().includes(q) ||
          (e.date || "").toLowerCase().includes(q),
      );
    }

    if (sortConfig) {
      rows.sort((a, b) => {
        if (sortConfig.key === "date") {
          const timeA = dateToTime(a.date);
          const timeB = dateToTime(b.date);
          if (timeA < timeB) return sortConfig.direction === "asc" ? -1 : 1;
          if (timeA > timeB) return sortConfig.direction === "asc" ? 1 : -1;
          return 0;
        }

        let valA = a[sortConfig.key] ?? "";
        let valB = b[sortConfig.key] ?? "";
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return rows;
  }, [
    branchExpenses,
    search,
    sortConfig,
    filterMonth,
    showDupesOnly,
    duplicateInfo,
  ]);

  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0);

  // ── Expense Records vs. DTR summary reconciliation ──
  // Period = selected month, or the span of this branch's records when "All Months".
  // DEPOSIT records are excluded: the DTR tracks deposits separately from Total Expenses.
  const dtrPeriod = useMemo(() => {
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (filterMonth !== "All") {
      const start = new Date(`1 ${filterMonth}`);
      if (isNaN(start.getTime())) return null;
      return {
        from: iso(start),
        to: iso(new Date(start.getFullYear(), start.getMonth() + 1, 0)),
      };
    }
    const times = branchExpenses
      .map((e) => dateToTime(e.date))
      .filter((t) => t > 0);
    if (times.length === 0) return null;
    return {
      from: iso(new Date(Math.min(...times))),
      to: iso(new Date(Math.max(...times))),
    };
  }, [filterMonth, branchExpenses]);

  const [dtrExpenses, setDtrExpenses] = useState<DtrSummary>({
    loading: false,
    total: null,
    payroll: 0,
    purchases: 0,
    deposits: 0,
    matched: false,
  });
  // Results are kept per branch + month: going back to a month shows it instantly and refreshes quietly behind it.
  const dtrExpensesCache = useRef(dtrSummaryMemory);
  const dtrFrom = dtrPeriod?.from ?? "";
  const dtrTo = dtrPeriod?.to ?? "";
  useEffect(() => {
    const empty = {
      loading: false,
      total: null,
      payroll: 0,
      purchases: 0,
      deposits: 0,
      matched: false,
    };
    if (!branchId || !dtrFrom) {
      setDtrExpenses(empty);
      return;
    }
    let cancelled = false;
    const cacheKey = `${branchId}|${branchName}|${dtrFrom}|${dtrTo}`;
    const savedDtr = readSavedFeed<DtrSummary>(
      "expense-dtr",
      `${expenseCacheKey}|${dtrFrom}|${dtrTo}`,
    );
    const cached = dtrExpensesCache.current.get(cacheKey) ?? savedDtr?.data;
    setDtrExpenses(
      cached ? { ...cached, loading: false } : { ...empty, loading: true },
    );
    if (cached) setDtrSettledKey(cacheKey);
    // A month that has already ended rarely changes: reuse what was saved in the last 30 minutes without asking again.
    const now = new Date();
    const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    if (savedDtr && dtrTo < thisMonthStart && Date.now() - savedDtr.at < 30 * 60 * 1000) {
      return;
    }
    const token =
      localStorage.getItem("ashcol-token") ||
      sessionStorage.getItem("ashcol-token") ||
      "";
    // Range summary rows carry no branchId, only display names ("CANDELARIA", "TAGUIG - SALES"), so match on names.
    const norm = (n?: string | null) =>
      (n || "")
        .replace(/^ashcol\s+/i, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z]+/g, " ")
        .trim();
    const target = norm(branchName);
    fetch(
      `${API_BASE_URL}/v1/reports/audit-summary-range?from=${dtrFrom}&to=${dtrTo}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) },
    )
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then(
        (
          rows: Array<{
            branchName?: string;
            logicalBranchName?: string;
            totalExpenses?: number;
            payrollExpenses?: number;
            totalForPurchase?: number;
            totalDeposits?: number;
          }>,
        ) => {
          if (cancelled) return;
          const matched = rows.filter((r) => norm(r.branchName) === target);
          const next: DtrSummary = {
            loading: false,
            matched: matched.length > 0,
            total: matched.reduce((sum, r) => sum + (r.totalExpenses || 0), 0),
            payroll: matched.reduce(
              (sum, r) => sum + (r.payrollExpenses || 0),
              0,
            ),
            purchases: matched.reduce(
              (sum, r) => sum + (r.totalForPurchase || 0),
              0,
            ),
            deposits: matched.reduce(
              (sum, r) => sum + (r.totalDeposits || 0),
              0,
            ),
          };
          dtrExpensesCache.current.set(cacheKey, next);
          writeSavedFeed("expense-dtr", `${expenseCacheKey}|${dtrFrom}|${dtrTo}`, next, 24);
          setDtrExpenses(next);
          setDtrSettledKey(cacheKey);
        },
      )
      .catch((err) => {
        console.error("[Expense Records] DTR summary fetch failed:", err);
        if (!cancelled && !cached) setDtrExpenses(empty);
        if (!cancelled) setDtrSettledKey(cacheKey);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, branchName, dtrFrom, dtrTo, expenseCacheKey]);

  const periodRecords = useMemo(() => {
    if (!dtrPeriod) return [];
    const from = new Date(`${dtrPeriod.from}T00:00:00`).getTime();
    const to = new Date(`${dtrPeriod.to}T23:59:59`).getTime();
    return branchExpenses.filter((e) => {
      const t = dateToTime(e.date);
      return t >= from && t <= to;
    });
  }, [branchExpenses, dtrPeriod]);
  const depositsForDtr = periodRecords
    .filter(isDepositRecord)
    .reduce((sum, e) => sum + e.amount, 0);
  // DTR expense + purchase lines for the period, used to explain Records vs DTR line by line.
  // Bumped after a purchase receipt is added so the DTR lines and the pending list reload.
  const [dataVersion, setDataVersion] = useState(0);
  type DtrLine = {
    id: string;
    type?: string;
    description: string;
    amount: number;
    actualAmount?: number;
    receiptReturned?: boolean;
    resolvedExpenseId?: string;
    reportDate?: string;
    refundDue?: number;
    cashReturnFound?: boolean;
    cashReturnDate?: string;
    returnedAll?: boolean;
    reimburseDue?: number;
    reimburseFound?: boolean;
    /** Marked receipted, but its receipt record is gone: the backend reports it as pending again */
    receiptRecordMissing?: boolean;
    ref?: string;
      receiptNo?: string;
    receiptImage?: string;
    company?: string;
  };
  // One feed of this branch's purchases (every date), loaded once per branch and kept in a cache so switching months or
  // coming back is instant. The month's DTR lines and the all-dates pending list are both derived from it, so they cannot
  // disagree and the page makes one request instead of two.
  const purchasesCache = useRef(purchasesMemory);
  const [purchasesFeed, setPurchasesFeed] = useState<{
    loading: boolean;
    rows: Record<string, unknown>[];
    failed: boolean;
  }>({ loading: false, rows: [], failed: false });
  useEffect(() => {
    if (!branchId) {
      setPurchasesFeed({ loading: false, rows: [], failed: false });
      return;
    }
    let cancelled = false;
    const savedPurchases = readSavedFeed<Record<string, unknown>[]>(
      "expense-purchases",
      expenseCacheKey,
    );
    const cached = purchasesCache.current.get(branchId) ?? savedPurchases?.data;
    setPurchasesFeed({ loading: !cached, rows: cached || [], failed: false });
    if (cached) setPurchasesSettledFor(branchId);
    const token =
      localStorage.getItem("ashcol-token") ||
      sessionStorage.getItem("ashcol-token") ||
      "";
    const isTaguig = branchId.toUpperCase().includes("TAGUIG");
    const isTaguigServices =
      isTaguig &&
      (branchId.toUpperCase().includes("SERVICE") ||
        branchName.toUpperCase().includes("SERVICE"));
    const params = new URLSearchParams({
      branchId: isTaguig
        ? isTaguigServices
          ? "BR-TAGUIG-SERVICES"
          : "BR-TAGUIG-SALES"
        : branchId.replace(/-(sales|services?)$/i, ""),
      from: "2026-01-01",
    });
    if (isTaguigServices || /-services?$/i.test(branchId))
      params.set("auditLine", "TAGUIG_SERVICE");
    else if (isTaguig || /-sales$/i.test(branchId))
      params.set("auditLine", "TAGUIG_SALES");
    fetch(`${API_BASE_URL}/v1/reports/purchases?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(25000),
    })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((rows: Record<string, unknown>[]) => {
        if (cancelled) return;
        purchasesCache.current.set(branchId, rows || []);
        writeSavedFeed("expense-purchases", expenseCacheKey, rows || [], 3);
        setPurchasesFeed({ loading: false, rows: rows || [], failed: false });
        setPurchasesSettledFor(branchId);
      })
      .catch((err) => {
        console.error("[Expense Records] Purchases fetch failed:", err);
        if (!cancelled)
          setPurchasesFeed((prev) => ({
            loading: false,
            rows: cached ? prev.rows : [],
            failed: !cached,
          }));
        if (!cancelled) setPurchasesSettledFor(branchId);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, dataVersion, expenseCacheKey]);

  // DTR expense + purchase lines for the selected period.
  const dtrLines = useMemo(() => {
    const rows = !dtrFrom
      ? []
      : (purchasesFeed.rows
          .filter(
            (r) =>
              r.reportDate && r.reportDate >= dtrFrom && r.reportDate <= dtrTo,
          )
          // ORDER| purchases are customer orders, not counted in the DTR's Purchases total.
          .filter((r) => !String(r.description || "").startsWith("ORDER|"))
          .map((r) => ({
            ...r,
            amount: Number(r.amount) || 0,
            actualAmount: Number(r.actualAmount) || 0,
          })) as DtrLine[]);
    return {
      loading: purchasesFeed.loading,
      failed: purchasesFeed.failed,
      rows,
    };
  }, [purchasesFeed, dtrFrom, dtrTo]);

  // Records dated today (or later) that no DTR has picked up yet are not a difference: today's DTR is filed
  // after the day, so they show from the next day. Anything already linked to a DTR line still counts.
  const recordsForDtr = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const onDtr = new Set<string>();
    for (const l of dtrLines.rows) {
      (l.resolvedExpenseId || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((x) => onDtr.add(x));
    }
    return periodRecords.filter(
      (e) =>
        !isDepositRecord(e) &&
        !(dateToTime(e.date) >= startOfToday.getTime() && !onDtr.has(e.id)),
    );
  }, [periodRecords, dtrLines.rows]);
  const recordsTotalForDtr = recordsForDtr.reduce(
    (sum, e) => sum + e.amount,
    0,
  );

  const dtrKey =
    branchId && dtrFrom ? `${branchId}|${branchName}|${dtrFrom}|${dtrTo}` : "";
  const firstDataReady =
    !branchId ||
    ((!dtrKey || dtrSettledKey === dtrKey) && purchasesSettledFor === branchId);
  useEffect(() => {
    if (!revealed && !initialLoading && firstDataReady) setRevealed(true);
  }, [revealed, initialLoading, firstDataReady]);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // Every purchase still waiting for its receipt (all dates, not just the period) with its age in days —
  // these are the main reason the DTR and Expense Records drift apart.
  // amount = still to be receipted (a purchase can be receipted in parts); given = cash handed out; received = receipted so far
  type PendingPurchase = {
    id: string;
    date: string;
    label: string;
    worker: string;
    detail: string;
    amount: number;
    given: number;
    received: number;
    ageDays: number;
  };
  // Purchases dated before the receipt rules started are a backlog nobody can act on; keep them apart.
  const PENDING_LEGACY_BEFORE = "2026-10-01";
  const [receiptTarget, setReceiptTarget] = useState<PendingPurchase | null>(
    null,
  );
  const [receiptTargetFile, setReceiptTargetFile] = useState<File | null>(null);

  const handlePasteForPurchase = async (purchase: PendingPurchase) => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            const ext = imgType.split("/")[1] || "png";
            const file = new File([blob], `receipt-clipboard-${Date.now()}.${ext}`, {
              type: imgType,
            });
            setReceiptTargetFile(file);
            setReceiptTarget(purchase);
            return;
          }
        }
      }
    } catch (err) {
      console.warn("[Expense Records] Clipboard read failed:", err);
    }
    setReceiptTargetFile(null);
    setReceiptTarget(purchase);
  };
  const agingPurchases = useMemo<PendingPurchase[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (
      purchasesFeed.rows
        // ORDER| purchases are customer orders, not DTR purchases; finished purchases are not pending.
        .filter(
          (r) =>
            (!r.type || r.type === "PURCHASE") &&
            !r.receiptReturned &&
            r.reportDate &&
            !String(r.description || "").startsWith("ORDER|"),
        )
        .map((r) => {
          const d = new Date(`${r.reportDate}T00:00:00`);
          const desc = String(r.description || "");
          return {
            id: String(r.id),
            date: String(r.reportDate),
            label:
              desc
                .split("|")
                .map((x: string) => x.trim())
                .filter(Boolean)
                .join(" · ") || "Purchase",
            worker: desc.includes("|") ? desc.split("|")[0].trim() : "",
            detail: desc.includes("|")
              ? desc.split("|").slice(1).join(" ").trim()
              : desc.trim(),
            amount:
              r.remaining != null
                ? Number(r.remaining) || 0
                : Math.max(
                    0,
                    (Number(r.amount) || 0) - (Number(r.actualAmount) || 0),
                  ),
            given: Number(r.amount) || 0,
            received: Number(r.actualAmount) || 0,
            ageDays: Math.max(
              0,
              Math.round((today.getTime() - d.getTime()) / 86400000),
            ),
          };
        })
        .sort((x, y) => y.ageDays - x.ageDays)
    );
  }, [purchasesFeed]);

  const reconciliation = useMemo(() => {
    if (!dtrPeriod) return null;
    const byId = new Map(branchExpenses.map((e) => [e.id, e]));
    const from = new Date(`${dtrPeriod.from}T00:00:00`).getTime();
    const to = new Date(`${dtrPeriod.to}T23:59:59`).getTime();
    type Item = {
      key: string;
      date: string;
      label: string;
      amount: number;
      note?: string;
      /** "Recorded in a different month": the linked records and the DTR date they should carry */
      recIds?: string[];
      fixDate?: string;
    };
    const buckets = {
      depositAsExpense: [] as Item[],
      pendingPurchase: [] as Item[],
      neverPushed: [] as Item[],
      deleted: [] as Item[],
      otherMonth: [] as Item[],
      amountDiff: [] as Item[],
      manual: [] as Item[],
    };
    const linked = new Set<string>();
    const lineLabel = (d: string) =>
      d.split("|").filter(Boolean).join(" — ") || "DTR entry";
    let expenseLinesTotal = 0;
    for (const l of dtrLines.rows) {
      if (l.type === "EXPENSE") expenseLinesTotal += l.amount;
      // All of it was handed back unspent: nothing is recorded or expected on either side.
      if (l.type === "PURCHASE" && l.returnedAll) continue;
      const label = `${l.type === "PURCHASE" ? "Purchase" : l.type === "EXPENSE" ? "Expense" : "DTR"}: ${lineLabel(l.description)}`;
      const item: Item = {
        key: l.id,
        date: l.reportDate || "",
        label,
        amount: l.amount,
      };
      const rid = l.resolvedExpenseId || "";
      // Its receipt record is gone: still pending, not a reimbursement or a "deleted" record.
      if (l.type === "PURCHASE" && l.receiptRecordMissing) {
        buckets.pendingPurchase.push({
          ...item,
          note: `receipt record missing${l.receiptNo ? ` (OR ${l.receiptNo})` : ""} — add the receipt again`,
        });
        continue;
      }
      // Before the DTR had a COH Deposit section, deposits to HO were logged as expense rows. They count in
      // DTR Expenses, while the matching record is a DEPOSIT (left out of the records total).
      const linkedRec = rid ? byId.get(rid) : undefined;
      const looksLikeDeposit =
        /deposit|\bcoh\b|\bho\b|head\s*office|fund\s*transfer/i.test(
          l.description,
        ) ||
        (!!linkedRec && isDepositRecord(linkedRec));
      if (l.type !== "PURCHASE" && looksLikeDeposit) {
        if (rid) linked.add(rid);
        buckets.depositAsExpense.push({
          ...item,
          note: linkedRec
            ? `record: ${linkedRec.expenseCategory}`
            : "no record",
        });
        continue;
      }
      if (!rid) {
        if (l.type === "PURCHASE" && !l.receiptReturned)
          buckets.pendingPurchase.push(item);
        else buckets.neverPushed.push(item);
        continue;
      }
      // A purchase receipted in parts (gas + toll…) links several records: ids are comma-joined.
      const recIds = rid
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      recIds.forEach((x) => linked.add(x));
      const recs = recIds
        .map((x) => byId.get(x))
        .filter((x): x is AuditExpense => !!x);
      if (recs.length === 0) {
        buckets.deleted.push(item);
        continue;
      }
      const rec = recs[0];
      const recTotal = recs.reduce((acc, x) => acc + x.amount, 0);
      const t = dateToTime(rec.date);
      if (t && (t < from || t > to)) {
        buckets.otherMonth.push({
          ...item,
          note: `recorded as ${rec.date}`,
          recIds: recs.map((x) => x.id),
          fixDate: l.reportDate || "",
        });
        continue;
      }
      // Receipts above the cash given are not booked on the purchase: they are reimbursed through a DTR expense row.
      const expected =
        l.type === "PURCHASE" && l.actualAmount
          ? Math.min(l.actualAmount, l.amount)
          : l.amount;
      if (Math.abs(recTotal - expected) >= 0.01) {
        buckets.amountDiff.push({
          ...item,
          amount: expected - recTotal,
          note: `DTR ${expected.toFixed(2)} · record${recs.length > 1 ? "s" : ""} ${recTotal.toFixed(2)}`,
        });
      }
      if (
        l.type === "PURCHASE" &&
        !l.receiptReturned &&
        l.amount - (l.actualAmount || 0) > 0.005
      ) {
        buckets.pendingPurchase.push({
          ...item,
          amount: l.amount - (l.actualAmount || 0),
          note: `${(l.actualAmount || 0).toFixed(2)} of ${l.amount.toFixed(2)} receipted`,
        });
      }
    }
    for (const e of recordsForDtr) {
      if (
        /^CASH ADVANCE/i.test(e.expenseCategory || "") &&
        e.id.includes("-ca-")
      )
        continue;
      if (!linked.has(e.id))
        buckets.manual.push({
          key: e.id,
          date: e.date,
          label: `${e.expenseCategory}: ${e.description || e.company || "Record"}`,
          amount: e.amount,
        });
    }
    const hasTypes = dtrLines.rows.some((l) => !!l.type);
    const recordedAdvances = recordsForDtr
      .filter((e) => /^CASH ADVANCE/i.test(e.expenseCategory || ""))
      .reduce((acc, e) => acc + e.amount, 0);
    const cashAdvance =
      hasTypes && dtrExpenses.total != null
        ? Math.max(0, dtrExpenses.total - expenseLinesTotal - recordedAdvances)
        : 0;
    // Today's purchases are not "waiting for receipt" yet: the receipt is chased from the next day.
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    buckets.pendingPurchase = buckets.pendingPurchase.filter(
      (i) => !i.date || i.date < todayKey,
    );
    const sum = (list: Item[]) => list.reduce((acc, i) => acc + i.amount, 0);
    return { buckets, cashAdvance, sum };
  }, [
    dtrPeriod,
    branchExpenses,
    dtrLines.rows,
    recordsForDtr,
    dtrExpenses.total,
  ]);
  const [openBucket, setOpenBucket] = useState<string | null>(null);

  // Duplicates inside the period: every copy after the first is the amount possibly counted twice.
  const periodDupes = useMemo(() => {
    const inPeriod = new Set(periodRecords.map((e) => e.id));
    let rows = 0;
    let extra = 0;
    for (const list of duplicateInfo.groups.values()) {
      const hits = list.filter((e) => inPeriod.has(e.id));
      if (hits.length > 1) {
        rows += hits.length;
        extra += hits.slice(1).reduce((sum, e) => sum + e.amount, 0);
      }
    }
    return { rows, extra };
  }, [periodRecords, duplicateInfo]);

  const handleDateBlur = (raw: string) => {
    const parsed = parseSmartDate(raw);
    if (parsed) {
      setDateRaw(parsed);
      setForm((f) => ({ ...f, date: parsed }));
      setDateError("");
    } else if (raw.trim())
      setDateError("Cannot parse date. Try: May 16, 16-May-26, 2026-05-16");
  };

  const handleExportExcel = () => {
    if (filtered.length === 0) return;
    const wsData = filtered.map((row) => ({
      Date: row.date,
      "Incurred By": row.incurredBy,
      Description: row.description,
      Company: row.company,
      "Receipt No": row.receiptNo || "",
      Amount: row.amount,
      Category: row.expenseCategory,
      "Source of Funds": row.sourceOfFunds || "",
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expense Records");
    XLSX.writeFile(
      wb,
      `ASHCOL_Expense_Records_${branchName}_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  // Month-end branch report: Summary + Differences ("Why the difference?") + the period's records.
  const handleExportMonthReport = () => {
    if (!dtrPeriod || !reconciliation) return;
    const hasDtr =
      dtrExpenses.matched && !dtrExpenses.loading && dtrExpenses.total != null;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const purchaseLines = dtrLines.rows.filter((l) => l.type === "PURCHASE");
    const linesTyped = dtrLines.rows.some((l) => !!l.type);
    // A purchase receipted in parts counts for what has been receipted so far; only the remainder is pending.
    const resolvedPurchases = purchaseLines.reduce(
      (acc, l) =>
        acc +
        (l.returnedAll
          ? 0
          : l.receiptReturned
            ? Math.min(l.actualAmount || l.amount, l.amount)
            : l.actualAmount || 0),
      0,
    );
    const pendingTotal = purchaseLines
      .filter((l) => !l.receiptReturned)
      .reduce(
        (acc, l) => acc + Math.max(0, l.amount - (l.actualAmount || 0)),
        0,
      );
    const dtrSpend =
      (dtrExpenses.total || 0) +
      (linesTyped ? resolvedPurchases : dtrExpenses.purchases);
    const diff = hasDtr ? recordsTotalForDtr - dtrSpend : null;
    const noPhotoCount = periodRecords.filter(
      (e) =>
        !e.receiptImageUri &&
        !isNoReceipt(e) &&
        !/^CASH ADVANCE/i.test(e.expenseCategory || ""),
    ).length;
    const noReceiptRecords = periodRecords.filter(isNoReceipt);
    const na = "N/A (no DTR found)";
    const agingInPeriod = (
      filterMonth === "All"
        ? agingPurchases
        : agingPurchases.filter(
            (p) => p.date >= dtrPeriod.from && p.date <= dtrPeriod.to,
          )
    ).filter((p) => p.ageDays >= 1);
    const periodLabel =
      filterMonth === "All"
        ? `${dtrPeriod.from} to ${dtrPeriod.to}`
        : filterMonth;

    const summaryRows: (string | number)[][] = [
      ["Branch", branchName],
      ["Period", periodLabel],
      [
        "Generated",
        `${new Date().toLocaleString("en-PH")} by ${user?.name || user?.email || "user"}`,
      ],
      [],
      ["Expense Records total (excl. deposits)", r2(recordsTotalForDtr)],
      ["Expense Records count", recordsForDtr.length],
      ["DTR Expenses", hasDtr ? r2(dtrExpenses.total || 0) : na],
      [
        "DTR purchases with receipt",
        hasDtr
          ? r2(linesTyped ? resolvedPurchases : dtrExpenses.purchases)
          : na,
      ],
      ["DTR Expenses + purchases with receipt", hasDtr ? r2(dtrSpend) : na],
      [
        "Purchases awaiting receipt (this period, not counted)",
        r2(pendingTotal),
      ],
      ["Difference (Records - DTR)", diff == null ? na : r2(diff)],
      [
        "Status",
        diff == null
          ? na
          : Math.abs(diff) < 0.005
            ? "Balanced"
            : diff > 0
              ? "Records exceed DTR"
              : "DTR exceeds records",
      ],
      [],
      ["Deposit to HO - per DTR", hasDtr ? r2(dtrExpenses.deposits) : na],
      ["Deposit to HO - in records", r2(depositsForDtr)],
      [
        "Deposit to HO - difference (records - DTR)",
        hasDtr ? r2(depositsForDtr - dtrExpenses.deposits) : na,
      ],
      [],
      ["Possible duplicate rows", periodDupes.rows],
      ["Possible duplicate amount (extra copies)", r2(periodDupes.extra)],
      ["Records without receipt photo", noPhotoCount],
      ["Records saved with NO RECEIPT (count)", noReceiptRecords.length],
      [
        "Records saved with NO RECEIPT (amount)",
        r2(noReceiptRecords.reduce((acc, e) => acc + e.amount, 0)),
      ],
      [
        "Purchases awaiting receipt - this period (count)",
        agingInPeriod.length,
      ],
      [
        "Purchases awaiting receipt - this period (amount)",
        r2(agingInPeriod.reduce((acc, p) => acc + p.amount, 0)),
      ],
      [
        "Purchases awaiting receipt - this period, 8+ days old (count)",
        agingInPeriod.filter((p) => p.ageDays >= 8).length,
      ],
      [
        "Reimbursements not found on the DTR (count)",
        dtrLines.rows.filter(
          (l) =>
            l.type === "PURCHASE" &&
            (l.reimburseDue || 0) > 0.005 &&
            !l.reimburseFound,
        ).length,
      ],
      [
        "Reimbursements not found on the DTR (amount)",
        r2(
          dtrLines.rows
            .filter(
              (l) =>
                l.type === "PURCHASE" &&
                (l.reimburseDue || 0) > 0.005 &&
                !l.reimburseFound,
            )
            .reduce((acc, l) => acc + (l.reimburseDue || 0), 0),
        ),
      ],
      [
        "Cash returns not found on the DTR (count)",
        dtrLines.rows.filter(
          (l) =>
            l.type === "PURCHASE" &&
            (l.refundDue || 0) > 0.005 &&
            !l.cashReturnFound &&
            returnIsDue(l.reportDate),
        ).length,
      ],
      [
        "Cash returns not found on the DTR (amount)",
        r2(
          dtrLines.rows
            .filter(
              (l) =>
                l.type === "PURCHASE" &&
                (l.refundDue || 0) > 0.005 &&
                !l.cashReturnFound &&
                returnIsDue(l.reportDate),
            )
            .reduce((acc, l) => acc + (l.refundDue || 0), 0),
        ),
      ],
    ];

    const bucketMeta: {
      id: keyof typeof reconciliation.buckets;
      title: string;
      side: string;
    }[] = [
      {
        id: "depositAsExpense",
        title: "Deposits to HO entered as expenses",
        side: "DTR",
      },
      {
        id: "pendingPurchase",
        title: "Purchases waiting for receipt",
        side: "DTR",
      },
      { id: "neverPushed", title: "DTR entries with no record", side: "DTR" },
      { id: "deleted", title: "Records deleted", side: "DTR" },
      { id: "otherMonth", title: "Recorded in a different month", side: "DTR" },
      { id: "amountDiff", title: "Amount differs", side: "DTR" },
      { id: "manual", title: "Records not on any DTR", side: "Records" },
    ];
    const differenceRows: Record<string, string | number>[] = [];
    for (const b of bucketMeta) {
      for (const i of reconciliation.buckets[b.id]) {
        differenceRows.push({
          Bucket: b.title,
          Affects: b.side,
          Date: i.date,
          Description: i.label,
          Amount: r2(i.amount),
          Note: i.note || "",
        });
      }
    }
    if (reconciliation.cashAdvance > 0.005) {
      differenceRows.push({
        Bucket: "Cash advances on the DTR",
        Affects: "DTR",
        Date: "",
        Description: "Counted in DTR Expenses, not kept in Expense Records",
        Amount: r2(reconciliation.cashAdvance),
        Note: "",
      });
    }
    if (differenceRows.length === 0) {
      differenceRows.push({
        Bucket: hasDtr
          ? "Every DTR entry matches a record"
          : "No DTR found for comparison",
        Affects: "",
        Date: "",
        Description: "",
        Amount: 0,
        Note: "",
      });
    }

    const recordRows = [...periodRecords]
      .sort((a, b) => dateToTime(a.date) - dateToTime(b.date))
      .map((e) => ({
        Date: e.date,
        "Incurred By": e.incurredBy,
        Company: e.company,
        Description: e.description,
        "Receipt No": e.receiptNo || "",
        Category: e.expenseCategory,
        "Source of Funds": e.sourceOfFunds || "",
        Amount: r2(e.amount),
        "Has Photo": e.receiptImageUri ? "Y" : "N",
        "No Receipt": isNoReceipt(e) ? "Y" : "N",
        "From DTR": e.id.startsWith("dtr-") ? "Y" : "N",
      }));

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary["!cols"] = [{ wch: 52 }, { wch: 34 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
    const wsDiff = XLSX.utils.json_to_sheet(differenceRows);
    wsDiff["!cols"] = [
      { wch: 36 },
      { wch: 9 },
      { wch: 12 },
      { wch: 60 },
      { wch: 14 },
      { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDiff, "Differences");
    const wsRecords =
      recordRows.length > 0
        ? XLSX.utils.json_to_sheet(recordRows)
        : XLSX.utils.aoa_to_sheet([["No records in this period"]]);
    wsRecords["!cols"] = [
      { wch: 12 },
      { wch: 22 },
      { wch: 20 },
      { wch: 50 },
      { wch: 16 },
      { wch: 24 },
      { wch: 18 },
      { wch: 14 },
      { wch: 10 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRecords, "Records");

    const safeBranch = (branchName || "BRANCH")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const periodKey =
      filterMonth === "All"
        ? `${dtrPeriod.from}_to_${dtrPeriod.to}`
        : dtrPeriod.from.slice(0, 7);
    XLSX.writeFile(
      wb,
      `${safeBranch}_${periodKey}_expense_reconciliation.xlsx`,
    );
  };

  useEffect(() => {
    if (editing && isNoReceipt(editing)) {
      const at = (editing.description || "").indexOf(NO_RECEIPT_SEP);
      setNoReceiptForm(true);
      setNoReceiptReasonForm(
        at >= 0 ? editing.description.slice(at + NO_RECEIPT_SEP.length) : "",
      );
      // show the plain description and an empty receipt no. in the form; the marker is added back on save
      setForm((f) => ({
        ...f,
        description:
          at >= 0 ? editing.description.slice(0, at) : editing.description,
        receiptNo: "",
      }));
    } else {
      setNoReceiptForm(false);
      setNoReceiptReasonForm("");
    }
  }, [editing]);

  const pickPhotoFor = (row: AuditExpense) => {
    photoTargetRef.current = row;
    photoInputRef.current?.click();
  };

  const handleAttachPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const row = photoTargetRef.current;
    e.target.value = "";
    photoTargetRef.current = null;
    if (!file || !row) return;
    setAttachingPhotoId(row.id);
    try {
      const result = await uploadReceiptImage(file, {
        folder: "finance",
        branch: row.branchName || branchName,
        description: row.description || row.company,
        filename: "expense",
      });
      const now = new Date().toISOString();
      await upsertAuditExpense({
        ...row,
        receiptImageUri: result.url,
        updatedBy: currentUserLabel,
        updatedAt: now,
        updateHistory: [
          ...(row.updateHistory || []),
          { action: "updated", by: currentUserLabel, at: now },
        ],
      });
      await reload();
    } catch (err) {
      console.error("[Expense Records] Attach receipt photo failed:", err);
      alert("Could not attach the photo. Please try again.");
    } finally {
      setAttachingPhotoId(null);
    }
  };

  // Adds the receipt to a purchase: creates the Expense Record and marks the DTR purchase line as received
  // (receipt no., actual amount, date, photo) in one call.
  const resolvePendingPurchase = async (
    target: PendingPurchase,
    r: ReceiptDialogResult,
  ) => {
    const token =
      localStorage.getItem("ashcol-token") ||
      sessionStorage.getItem("ashcol-token") ||
      "";
    const res = await fetch(
      `${API_BASE_URL}/v1/reports/purchases/${encodeURIComponent(target.id)}/resolve`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiptNo: r.receiptNo,
          actualAmount: parseFloat(r.amount),
          receiptDate: r.receiptDate,
          company: r.company,
          description: r.description,
          expenseCategory: r.expenseCategory,
          sourceOfFunds: r.sourceOfFunds,
          incurredBy: r.incurredBy,
          receiptImage: r.receiptImage,
          closeRemaining: r.closeRemaining,
        }),
      },
    );
    if (!res.ok) {
      let msg = `Could not save the receipt (HTTP ${res.status})`;
      try {
        const j = await res.json();
        msg = j.error || j.message || msg;
      } catch {
        /* keep default */
      }
      alert(msg);
      return;
    }
    const out = (await res.json()) as {
      refundDue?: number;
      cashReturnFound?: boolean;
      complete?: boolean;
      remaining?: number;
    };
    // Saved: close the dialog right away and refresh in the background instead of keeping the spinner up for the reload.
    setReceiptTarget(null);
    setDataVersion((v) => v + 1);
    void reload();
    const over = Math.round((parseFloat(r.amount) - target.amount) * 100) / 100;
    // Deferred so the dialog is gone before the (blocking) alert opens.
    const notify = (msg: string) => setTimeout(() => alert(msg), 60);
    if (out.complete === false && (out.remaining || 0) > 0.005) {
      notify(
        `Receipt saved to the DTR and Expense Records.\n\n₱${(out.remaining || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} of this purchase is still pending. Add the next receipt when you have it — it stays in Pending receipts until the receipts cover the cash given.`,
      );
    } else if (over > 0.005) {
      notify(
        `Receipt saved to the DTR and Expense Records (₱${target.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}, the cash given).\n\nThe receipt is ₱${over.toLocaleString("en-PH", { minimumFractionDigits: 2 })} higher than that. ${target.worker || "The member"} paid the extra, so add a REIMBURSE row for ₱${over.toLocaleString("en-PH", { minimumFractionDigits: 2 })} under Expenses with Receipts on the DTR — it is offered there ready-filled.`,
      );
    } else if ((out.refundDue || 0) > 0.005 && !out.cashReturnFound) {
      notify(
        `Receipt saved to the DTR and Expense Records.\n\nThe receipt is ₱${(out.refundDue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} lower than the cash given. Make sure that cash return is entered under Cash Returns on the DTR (pick the REFUND entry for this purchase).`,
      );
    }
  };

  // A part-receipted purchase whose rest was handed back as cash: close it; the Cash Return is then added on the DTR.
  const returnPendingAsCash = async (p: PendingPurchase) => {
    const amt = p.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 });
    // A purchase released today is closed tomorrow at the earliest: its cash return belongs on a later day's DTR.
    {
      const n = new Date();
      const todayIso = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
      if (p.date >= todayIso) {
        alert(
          `This purchase was released today (${p.date}). It can only be closed as returned from tomorrow — the cash return goes on a later day's DTR.`,
        );
        return;
      }
    }
    // The same budget is often returned and released again the next day, which leaves two pending purchases that look
    // alike. A return closes the OLDER one; closing the newer one by mistake makes it look like cash is missing.
    const older = agingPurchases.find(
      (o) =>
        o.id !== p.id &&
        o.date < p.date &&
        o.worker.toUpperCase() === p.worker.toUpperCase() &&
        Math.abs(o.given - p.given) < 0.01,
    );
    if (
      older &&
      !window.confirm(
        `Wait — there is an OLDER pending purchase for ${p.worker || "this member"} with the same amount:\n\n${older.date} · ${older.label}\n\nYou picked the NEWER one (${p.date}). Returned cash normally closes the older release, and the newer one stays pending.\n\nPress Cancel to go back and close the ${older.date} one instead.\nPress OK only if the ${p.date} release itself was returned.`,
      )
    )
      return;
    if (
      !window.confirm(
        `Close the purchase from the DTR of ${p.date}?\n\n${p.label}\n\nThis treats ${p.received > 0 ? "the remaining" : "all"} ₱${amt} as unspent cash returned by ${p.worker || "the member"}. If the same budget was released again on a later day, make sure this is the EARLIER one — the newer release must stay pending.\n\nIt is then added as a Cash Return (e.g. “MATERIAL CHANGE”) on the DTR — it is offered ready-filled under Cash Returns on the DTR of the day the cash comes back.`,
      )
    )
      return;
    const token =
      localStorage.getItem("ashcol-token") ||
      sessionStorage.getItem("ashcol-token") ||
      "";
    const res = await fetch(
      `${API_BASE_URL}/v1/reports/purchases/${encodeURIComponent(p.id)}/close`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      let msg = `Could not close the purchase (HTTP ${res.status})`;
      try {
        const j = await res.json();
        msg = j.error || j.message || msg;
      } catch {
        /* keep default */
      }
      alert(msg);
      return;
    }
    setDataVersion((v) => v + 1);
    await reload();
  };

  // A purchase closed as "returned as cash" by mistake (the cash is still with the member): put it back to pending.
  const reopenPurchase = async (id: string, label: string, why?: string) => {
    if (
      !window.confirm(
        `Reopen this purchase as pending?\n\n${label}\n\n${why || "Use this when the cash was NOT returned and is still with the member. It goes back to Pending purchases receipts and no Cash Return is expected for it."}`,
      )
    )
      return;
    const token =
      localStorage.getItem("ashcol-token") ||
      sessionStorage.getItem("ashcol-token") ||
      "";
    const res = await fetch(
      `${API_BASE_URL}/v1/reports/purchases/${encodeURIComponent(id)}/reopen`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      let msg = `Could not reopen the purchase (HTTP ${res.status})`;
      try {
        const j = await res.json();
        msg = j.error || j.message || msg;
      } catch {
        /* keep default */
      }
      alert(msg);
      return;
    }
    setDataVersion((v) => v + 1);
    await reload();
  };

  const saveExpense = async (expense: AuditExpense) => {
    setSavingReceipt(true);
    try {
      await upsertAuditExpense(expense);
      await reload();
    } finally {
      setSavingReceipt(false);
    }
    if (editing) {
      if (isEditingInModal) {
        setIsEditingInModal(false);
        setDetailRow(expense);
        setEditing(null);
        setForm(emptyForm(resolveFormBranchId(branchId)));
        setDateRaw(formatTodayReceiptDate());
        setDateError("");
        setScanPreview(null);
        setUploadedReceiptUrl(null);
      } else {
        // Updating an existing receipt — close the form
        setShowForm(false);
        setEditing(null);
        setForm(emptyForm(resolveFormBranchId(branchId)));
        setDateRaw(formatTodayReceiptDate());
        setDateError("");
        setScanPreview(null);
        setScannedFields(new Set());
        setScanError("");
        setUploadedReceiptUrl(null);
      }
    } else {
      // New receipt saved — ask whether to add another before deciding what happens to the form
      setShowAddAnotherPrompt(true);
    }
  };

  const handleAddAnother = () => {
    setShowAddAnotherPrompt(false);
    // Keep form open, clear fields (including date) for next entry
    setForm({ ...emptyForm(resolveFormBranchId(branchId)), date: "" });
    setDateRaw("");
    setDateError("");
    setScanPreview(null);
    setScannedFields(new Set());
    setScanError("");
    setUploadedReceiptUrl(null);
    // Focus the first field for quick next entry
    setTimeout(() => {
      document.getElementById("receipt-date")?.focus();
    }, 50);
  };

  const handleDoneAdding = () => {
    setShowAddAnotherPrompt(false);
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm(resolveFormBranchId(branchId)));
    setDateRaw(formatTodayReceiptDate());
    setDateError("");
    setScanPreview(null);
    setScannedFields(new Set());
    setScanError("");
    setUploadedReceiptUrl(null);
  };

  const confirmUpdateDuplicate = async () => {
    if (!duplicateModal) return;
    const { existingExpense, newExpense } = duplicateModal;
    if (!canModifyRecord(existingExpense)) {
      alert(`That record comes from a DTR. ${dtrLinkedHint(existingExpense)}.`);
      return;
    }
    if (
      isDtrLinked(existingExpense) &&
      !window.confirm(
        "This record comes from a DTR. Changing it here will not update the DTR. Continue?",
      )
    )
      return;
    const updatedExpense: AuditExpense = {
      ...newExpense,
      id: existingExpense.id,
      inputBy:
        existingExpense.inputBy ||
        existingExpense.createdBy ||
        newExpense.inputBy,
      createdBy:
        existingExpense.createdBy ||
        existingExpense.inputBy ||
        newExpense.createdBy,
      createdAt: existingExpense.createdAt || newExpense.createdAt,
      updatedBy: currentUserLabel,
      updateHistory: [
        ...(existingExpense.updateHistory || []),
        { action: "updated", by: currentUserLabel, at: newExpense.updatedAt },
      ],
    };
    setDuplicateModal(null);
    await saveExpense(updatedExpense);
  };

  const submitReceipt = async () => {
    if (!branchId) return;
    if (!editing && !canAddRecord) {
      alert(
        "Add branch expenses through the DTR — it creates the Expense Record for you.",
      );
      return;
    }
    const amount = parseFloat(form.amount.replace(/,/g, ""));
    if (!form.company.trim() && !form.description.trim()) {
      alert("Enter company or description.");
      return;
    }
    if (!amount || amount <= 0) {
      alert("Enter a valid amount.");
      return;
    }
    if (!form.date.trim()) {
      alert("Enter a valid date.");
      return;
    }
    // No receipt: allowed (with a reason) instead of the photo; a photo, if one is attached, wins.
    const noReceipt = noReceiptForm && !uploadedReceiptUrl;
    if (noReceipt && noReceiptReasonForm.trim().length < 5) {
      alert("Say why there is no receipt (at least 5 characters).");
      return;
    }
    const baseDescription = form.description.split(NO_RECEIPT_SEP)[0].trim();
    const finalDescription = noReceipt
      ? `${baseDescription}${NO_RECEIPT_SEP}${noReceiptReasonForm.trim()}`
      : baseDescription;
    const finalReceiptNo = noReceipt ? NO_RECEIPT_NO : form.receiptNo.trim();
    if (
      form.expenseCategory === "OTHER" &&
      form.description.trim().length < 10
    ) {
      alert(
        'Category "Other" needs a clear description (what and why) — at least 10 characters.',
      );
      return;
    }
    {
      const d = new Date(parseSmartDate(form.date.trim()) || form.date.trim());
      const needsPhoto =
        !isNaN(d.getTime()) && d >= new Date("2026-10-01T00:00:00");
      if (
        needsPhoto &&
        !noReceipt &&
        !uploadedReceiptUrl &&
        !editing?.receiptImageUri
      ) {
        alert(
          "Attach a photo of the receipt. From October 2026 every expense record needs its receipt.",
        );
        return;
      }
    }

    // Check future date
    const parsedDate = parseSmartDate(form.date.trim());
    if (parsedDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const inputDate = new Date(parsedDate);
      if (inputDate > today) {
        if (
          !window.confirm(
            `Warning: The date entered (${form.date.trim()}) is in the future. Are you sure you want to save this receipt?`,
          )
        ) {
          return;
        }
      }
    }

    if (
      editing &&
      isDtrLinked(editing) &&
      !window.confirm(
        "This record comes from a DTR. Changing it here will not update the DTR. Continue?",
      )
    )
      return;

    const now = new Date().toISOString();
    const targetBranchId = form.branchId || branchId;
    const targetBranchName =
      (allBranches.length > 0 ? allBranches : branches).find(
        (b) => b.id === targetBranchId,
      )?.name || branchName;

    const expense: AuditExpense = editing
      ? {
          ...editing,
          branchId: targetBranchId,
          branchName: targetBranchName,
          date: form.date.trim(),
          company: form.company.trim().toUpperCase(),
          incurredBy: (
            form.incurredBy.trim() ||
            user?.name ||
            "STAFF"
          ).toUpperCase(),
          description: finalDescription,
          receiptNo: finalReceiptNo,
          amount,
          expenseCategory: form.expenseCategory,
          sourceOfFunds: form.sourceOfFunds.trim(),
          receiptImageUri: uploadedReceiptUrl || undefined,
          updatedBy: currentUserLabel,
          updatedAt: now,
          updateHistory: [
            ...(editing.updateHistory || []),
            { action: "updated", by: currentUserLabel, at: now },
          ],
        }
      : {
          id: createExpenseId(),
          branchId: targetBranchId,
          branchName: targetBranchName,
          date: form.date.trim(),
          incurredBy: (
            form.incurredBy.trim() ||
            user?.name ||
            "STAFF"
          ).toUpperCase(),
          company: form.company.trim().toUpperCase(),
          description: finalDescription,
          receiptNo: finalReceiptNo,
          amount,
          expenseCategory: form.expenseCategory,
          sourceOfFunds: form.sourceOfFunds.trim(),
          receiptImageUri: uploadedReceiptUrl || undefined,
          inputBy: currentUserLabel,
          createdBy: currentUserLabel,
          updatedBy: currentUserLabel,
          createdAt: now,
          updatedAt: now,
          updateHistory: [{ action: "created", by: currentUserLabel, at: now }],
        };

    const normalizedReceiptNo = noReceipt
      ? ""
      : (form.receiptNo || "").trim().toUpperCase();
    if (normalizedReceiptNo) {
      // The page holds only the branch on screen, so the server is asked about every other branch.
      const duplicate =
        expenses.find(
          (e) =>
            (e.receiptNo || "").trim().toUpperCase() === normalizedReceiptNo &&
            e.id !== (editing?.id || ""),
        ) || (await findExpenseByReceiptNo(normalizedReceiptNo, editing?.id));
      if (duplicate) {
        setDuplicateModal({
          isOpen: true,
          existingExpense: duplicate,
          newExpense: expense,
        });
        return;
      }
    }

    await saveExpense(expense);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    const activeEl = document.activeElement as HTMLInputElement;
    if (!activeEl) return;

    const fields = [
      "receipt-branch",
      "receipt-date",
      "receipt-incurredBy",
      "receipt-description",
      "receipt-company",
      "receipt-receiptNo",
      "receipt-amount",
      "receipt-sourceOfFunds",
    ];

    const index = fields.indexOf(activeEl.id);
    if (index === -1) return;

    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = (index + 1) % fields.length;
      const nextEl = document.getElementById(
        fields[nextIndex],
      ) as HTMLInputElement;
      nextEl?.focus();
      nextEl?.select?.();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = (index - 1 + fields.length) % fields.length;
      const prevEl = document.getElementById(
        fields[prevIndex],
      ) as HTMLInputElement;
      prevEl?.focus();
      prevEl?.select?.();
    }
  };

  const startEdit = (row: AuditExpense) => {
    if (!canModifyRecord(row)) return;
    setDetailRow(null);
    setEditing(row);
    setDateRaw(row.date);
    setDateError("");
    setScanPreview(row.receiptImageUri || null);
    setUploadedReceiptUrl(row.receiptImageUri || null);
    const resolvedBranchId = resolveFormBranchId(row.branchId);
    setForm({
      date: row.date,
      company: row.company,
      description: row.description,
      receiptNo: row.receiptNo,
      amount: String(row.amount),
      expenseCategory: row.expenseCategory,
      sourceOfFunds: row.sourceOfFunds,
      incurredBy: row.incurredBy,
      branchId: resolvedBranchId,
    });
    setShowForm(true);
  };

  const startEditInModal = (row: AuditExpense) => {
    if (!canModifyRecord(row)) return;
    setEditing(row);
    setDateRaw(row.date);
    setDateError("");
    setScanPreview(row.receiptImageUri || null);
    setUploadedReceiptUrl(row.receiptImageUri || null);
    const resolvedBranchId = resolveFormBranchId(row.branchId);
    setForm({
      date: row.date,
      company: row.company,
      description: row.description,
      receiptNo: row.receiptNo,
      amount: String(row.amount),
      expenseCategory: row.expenseCategory,
      sourceOfFunds: row.sourceOfFunds,
      incurredBy: row.incurredBy,
      branchId: resolvedBranchId,
    });
    setIsEditingInModal(true);
  };

  const openDetails = (row: AuditExpense, e?: React.MouseEvent) => {
    e?.preventDefault();
    setDetailRow(row);
  };

  const handleDeleteRecord = async (row: AuditExpense) => {
    if (!canModifyRecord(row)) return;
    if (
      isDtrLinked(row) &&
      !window.confirm(
        "This record comes from a DTR. Deleting it here will not remove the DTR line. Continue?",
      )
    )
      return;
    if (!window.confirm("Delete this expense record?")) return;
    await deleteAuditExpense(row.id);
    setDetailRow(null);
    await reload();
  };

  const processImage = async (file: File) => {
    const url = URL.createObjectURL(file);
    setScanPreview(url);
    setScanning(true);
    setScanError("");
    setScannedFields(new Set());

    // Persist the receipt image to Supabase Storage (runs alongside the OCR scan below)
    setUploadedReceiptUrl(null);
    setUploadingReceipt(true);
    const resolvedBranchId = form.branchId || branchId;
    const resolvedBranchName =
      (allBranches.length > 0 ? allBranches : branches).find(
        (b) => b.id === resolvedBranchId,
      )?.name || branchName;
    uploadReceiptImage(file, {
      folder: "finance",
      branch: resolvedBranchName,
      description: form.description || form.company,
      filename: "expense",
    })
      .then((result) => setUploadedReceiptUrl(result.url))
      .catch((err) =>
        console.error("[Supabase Storage] Finance receipt upload failed:", err),
      )
      .finally(() => setUploadingReceipt(false));

    try {
      const token =
        localStorage.getItem("ashcol-token") ||
        sessionStorage.getItem("ashcol-token") ||
        "";
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${API_BASE_URL}/v1/receipts/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        let errorMsg = `Server error ${res.status}`;
        try {
          const errData = (await res.json()) as Record<string, unknown>;
          if (errData && errData.error) {
            errorMsg = String(errData.error);
          } else if (errData && errData.message) {
            errorMsg = String(errData.message);
          }
        } catch {
          // ignore
        }
        throw new Error(errorMsg);
      }
      const data = (await res.json()) as Record<string, unknown>;
      if (data.error) {
        setScanError(`Scan failed: ${data.error}`);
        return;
      }

      const scannedDate = data.date ? String(data.date) : "";
      const parsed = scannedDate
        ? (parseSmartDate(scannedDate) ?? scannedDate)
        : "";
      const filled = new Set<string>();

      setForm((f) => {
        const next = { ...f };
        if (parsed) {
          next.date = parsed;
          filled.add("date");
        }
        if (data.company) {
          next.company = String(data.company).toUpperCase();
          filled.add("company");
        }

        let desc = data.description ? String(data.description) : "";
        const cat = data.expenseCategory
          ? String(data.expenseCategory).toUpperCase()
          : "";

        if (cat) {
          next.expenseCategory = cat as AuditExpenseCategory;
          filled.add("expenseCategory");
        }

        if (desc) {
          if (cat === "INSTALLATION MATERIALS" || cat === "SERVICE MATERIALS") {
            if (!desc.toUpperCase().startsWith("MATERIALS:"))
              desc = `MATERIALS: ${desc}`;
          } else if (cat === "INCENTIVES") {
            if (!desc.toUpperCase().startsWith("INCENTIVES:"))
              desc = `INCENTIVES: ${desc}`;
          } else if (cat === "MOBILIZATION") {
            const dUpper = desc.toUpperCase();
            if (
              dUpper.includes("GAS") ||
              dUpper.includes("FUEL") ||
              dUpper.includes("DIESEL") ||
              dUpper.includes("PETRON") ||
              dUpper.includes("SHELL") ||
              dUpper.includes("CALTEX")
            ) {
              if (!dUpper.startsWith("GAS:")) desc = `GAS: ${desc}`;
            } else if (
              dUpper.includes("TOLL") ||
              dUpper.includes("NLEX") ||
              dUpper.includes("SLEX") ||
              dUpper.includes("SCTEX") ||
              dUpper.includes("CAVITEX") ||
              dUpper.includes("SKYWAY") ||
              dUpper.includes("AUTOSWEEP") ||
              dUpper.includes("EASYTRIP")
            ) {
              if (!dUpper.startsWith("TOLL:")) desc = `TOLL: ${desc}`;
            } else if (
              dUpper.includes("PASSWAY") ||
              dUpper.includes("PARKING")
            ) {
              if (!dUpper.startsWith("PASSWAY:")) desc = `PASSWAY: ${desc}`;
            } else {
              if (!dUpper.startsWith("MOBILIZATION:"))
                desc = `MOBILIZATION: ${desc}`;
            }
          }
          next.description = desc;
          filled.add("description");
        }

        if (data.receiptNo) {
          next.receiptNo = String(data.receiptNo);
          filled.add("receiptNo");
        }

        if (data.amount != null && data.amount !== "") {
          const numeric = parseFloat(String(data.amount).replace(/,/g, ""));
          if (!isNaN(numeric)) {
            next.amount = numeric.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          } else {
            next.amount = String(data.amount);
          }
          filled.add("amount");
        }

        let sof = data.sourceOfFunds ? String(data.sourceOfFunds) : "";
        if (!sof && cat) {
          const sourcesForCat = branchExpenses
            .filter((e) => e.expenseCategory === cat && e.sourceOfFunds)
            .map((e) => e.sourceOfFunds);
          if (sourcesForCat.length > 0) {
            const counts = sourcesForCat.reduce(
              (acc, curr) => {
                acc[curr] = (acc[curr] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            );
            sof = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
          }
        }
        if (sof) {
          next.sourceOfFunds = sof;
          filled.add("sourceOfFunds");
        }

        if (data.incurredBy) {
          next.incurredBy = String(data.incurredBy).toUpperCase();
          filled.add("incurredBy");
        }
        return next;
      });
      if (parsed) {
        setDateRaw(parsed);
        setDateError("");
      }
      setScannedFields(filled);
    } catch (err: unknown) {
      console.error("[ReceiptScan]", err);
      setScanError(
        err instanceof Error
          ? err.message
          : "Could not scan receipt. Make sure the backend is running.",
      );
    } finally {
      setScanning(false);
      if (scanRef.current) scanRef.current.value = "";
    }
  };

  const handleScanImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImage(file);
  };

  const handleCameraClick = () => {
    if (!showForm) {
      setEditing(null);
      setForm({ ...emptyForm(resolveFormBranchId(branchId)), date: "" });
      setDateRaw("");
      setDateError("");
      setShowForm(true);
      setTimeout(() => cameraRef.current?.click(), 150);
    } else {
      cameraRef.current?.click();
    }
  };

  const handleModalImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setScanPreview(localUrl);
    setUploadingReceipt(true);
    try {
      const resolvedBranchId = form.branchId || branchId;
      const resolvedBranchName =
        (allBranches.length > 0 ? allBranches : branches).find(
          (b) => b.id === resolvedBranchId,
        )?.name || branchName;
      const result = await uploadReceiptImage(file, {
        folder: "finance",
        branch: resolvedBranchName,
        description: form.description || form.company,
        filename: "expense",
      });
      setUploadedReceiptUrl(result.url);
    } catch (err) {
      console.error("[Finance Modal] Image upload failed:", err);
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleModalPaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "pasted-receipt.png", {
            type: imageType,
          });
          await handleModalImageUpload(file);
          return;
        }
      }
      alert("No image found in clipboard. Please copy an image first.");
    } catch {
      alert(
        "Unable to paste image. Please ensure clipboard permissions are allowed or click Upload.",
      );
    }
  };

  const handleModalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleModalImageUpload(files[0]);
    }
  };

  const processImageRef = useRef(processImage);
  useEffect(() => {
    processImageRef.current = processImage;
  });

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (scanning) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            const file = new File([blob], "pasted-receipt.png", {
              type: item.type,
            });
            void processImageRef.current(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [scanning]);

  const handlePasteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (scanning) return;

    if (!navigator.clipboard || !navigator.clipboard.read) {
      setScanError(
        "Clipboard button is disabled on HTTP. Please press Ctrl+V (or Cmd+V) anywhere on the page to paste the image.",
      );
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageTypes = item.types.filter((type) =>
          type.startsWith("image/"),
        );
        if (imageTypes.length > 0) {
          const blob = await item.getType(imageTypes[0]);
          const file = new File([blob], "pasted-receipt.png", {
            type: imageTypes[0],
          });
          await processImage(file);
          return;
        }
      }
      setScanError("No image found in clipboard. Please copy an image first.");
    } catch (err) {
      console.error("Paste error:", err);
      setScanError(
        "Could not read clipboard. Please check permissions or select a file instead.",
      );
    }
  };

  // Clear the "scanned" highlight when user manually edits a field
  const clearScanned = (field: string) =>
    setScannedFields((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });

  // Highlight style for scanned fields (amber = please review)
  const scanBorder = "#F59E0B";
  const scannedStyle = (field: string): React.CSSProperties =>
    scannedFields.has(field)
      ? { borderColor: scanBorder, boxShadow: `0 0 0 2px ${scanBorder}33` }
      : {};

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

  const noReceiptControl = uploadedReceiptUrl ? null : (
    <div className="flex flex-col gap-1.5">
      <label
        className="flex items-center gap-2 text-xs font-semibold cursor-pointer"
        style={{ color: textPrimary }}
      >
        <input
          type="checkbox"
          checked={noReceiptForm}
          onChange={(e) => setNoReceiptForm(e.target.checked)}
        />
        No receipt available for this expense
      </label>
      {noReceiptForm && (
        <input
          value={noReceiptReasonForm}
          onChange={(e) => setNoReceiptReasonForm(e.target.value)}
          placeholder="Why is there no receipt? (e.g. toll gate, no OR issued)"
          className="w-full rounded-lg px-3 py-2 text-xs outline-none"
          style={{
            backgroundColor: inputBg,
            border: `1px solid ${noReceiptReasonForm.trim().length < 5 ? danger : inputBorder}`,
            color: textPrimary,
          }}
        />
      )}
    </div>
  );

  if (!canAccess)
    return (
      <div className="p-8 text-center" style={{ color: textMuted }}>
        Expense records are available for branch employees, managers, and admins
        only.
      </div>
    );

  if (initialLoading || !revealed) {
    return (
      <div
        style={{ minHeight: "80vh", backgroundColor: bg }}
        className="flex items-center justify-center w-full"
      >
        <AshcolLoader />
      </div>
    );
  }

  return (
    <div
      style={{ minHeight: "100vh", backgroundColor: bg }}
      className="flex flex-col gap-3 px-2 py-3 md:p-6 pb-12"
    >
      {loadError && (
        <div
          className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm font-semibold"
          style={{ backgroundColor: "#ef444418", border: "1px solid #ef444466", color: "#b91c1c" }}
        >
          <span>Could not load the expense records — the server did not answer in time. What you see may be incomplete.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-9 px-4 rounded-full text-xs font-bold uppercase tracking-wide cursor-pointer"
            style={{ backgroundColor: "#b91c1c", color: "#fff" }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div
        className="rounded-2xl px-4 py-3.5 flex flex-col gap-3"
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
          boxShadow: isLight
            ? "0 1px 2px rgba(0,0,0,0.05)"
            : "0 1px 2px rgba(0,0,0,0.2)",
        }}
      >
        {/* Title + controls — one row on desktop */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${accent}1A`, color: accent }}
            >
              <ClipboardList size={18} />
            </div>
            <div className="flex flex-col min-w-0">
              <h1
                className="text-base font-extrabold tracking-tight leading-tight"
                style={{ color: textPrimary }}
              >
                Expense Records
              </h1>
              <div
                className="flex items-center gap-1.5 text-[11px] font-medium min-w-0"
                style={{ color: textMuted }}
              >
                <Building2 size={11} className="shrink-0" />
                <span className="truncate">
                  {branchName || "Select branch"}
                </span>
                {activeTab === "expenses" && branchId && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="truncate">
                      {filterMonth === "All" ? "All months" : filterMonth}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {/* Month picker */}
            {activeTab === "expenses" && branchId && (
              <div
                style={{ position: "relative" }}
                className="shrink-0 w-full lg:w-auto"
              >
                <CalendarDays
                  size={13}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: textMuted,
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                />
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="w-full lg:w-auto rounded-lg pl-8 pr-7 py-2 text-xs appearance-none outline-none cursor-pointer font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: inputBg,
                    border: `1px solid ${inputBorder}`,
                    color: textPrimary,
                    colorScheme: isLight ? "light" : "dark",
                    minWidth: 155,
                  }}
                >
                  <option value="All">All months</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={11}
                  style={{
                    position: "absolute",
                    right: 9,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: textMuted,
                    pointerEvents: "none",
                  }}
                />
              </div>
            )}

            {activeTab === "expenses" && (
              <>
                {/* Desktop actions */}
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  {!canAddRecord && (
                    <span
                      className="text-[11px] font-semibold px-3 py-2 rounded-lg"
                      style={{
                        color: textMuted,
                        border: `1px solid ${border}`,
                      }}
                    >
                      Add expenses through the DTR
                    </span>
                  )}
                  {canAddRecord && (
                    <button
                      type="button"
                      onClick={() => {
                        if (showForm) {
                          setShowForm(false);
                          setEditing(null);
                        } else {
                          setEditing(null);
                          setForm({
                            ...emptyForm(resolveFormBranchId(branchId)),
                            date: "",
                          });
                          setDateRaw("");
                          setDateError("");
                          setShowForm(true);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white shadow-sm transition-all hover:opacity-90"
                      style={{ backgroundColor: showForm ? "#EF4444" : accent }}
                    >
                      {showForm ? (
                        <>
                          <X size={13} /> Close
                        </>
                      ) : (
                        <>
                          <Plus size={13} /> Add Record
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Hidden inputs */}
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleScanImage}
                />
              </>
            )}
          </div>
        </div>

        {/* Mobile: 3-column action grid */}
        {activeTab === "expenses" && !canAddRecord && (
          <div
            className="sm:hidden w-full text-center text-[11px] font-semibold px-3 py-2 rounded-lg"
            style={{ color: textMuted, border: `1px solid ${border}` }}
          >
            Add expenses through the DTR
          </div>
        )}
        {activeTab === "expenses" && canAddRecord && (
          <div className="grid grid-cols-2 gap-2 sm:hidden w-full">
            <button
              type="button"
              onClick={() => {
                if (showForm) {
                  setShowForm(false);
                  setEditing(null);
                } else {
                  setEditing(null);
                  setForm({
                    ...emptyForm(resolveFormBranchId(branchId)),
                    date: "",
                  });
                  setDateRaw("");
                  setDateError("");
                  setShowForm(true);
                }
              }}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold text-white transition-all active:scale-95 shadow-sm"
              style={{ backgroundColor: showForm ? "#EF4444" : accent }}
            >
              {showForm ? <X size={20} /> : <Plus size={20} />}
              <span>{showForm ? "Close" : "Add Record"}</span>
            </button>
            <button
              type="button"
              disabled={scanning}
              onClick={handleCameraClick}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold text-white transition-all active:scale-95 shadow-sm"
              style={{
                backgroundColor: "#6366F1",
                opacity: scanning ? 0.6 : 1,
              }}
              title="Open camera to scan receipt"
            >
              <Camera size={20} />
              <span>Scan</span>
            </button>
          </div>
        )}
      </div>

      {/* ── ENTRY FORM (PORTALED) ── */}
      {showForm &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-6">
              <div
                onClick={(e) => e.stopPropagation()}
                className="fixed sm:relative inset-0 sm:inset-auto z-[100] sm:z-auto rounded-none sm:rounded-2xl flex flex-col gap-5 p-5 pb-8 sm:p-6 overflow-y-auto overscroll-contain h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-3xl sm:mx-auto"
                style={{
                  backgroundColor: cardBg,
                  boxShadow: `0 8px 40px rgba(0,0,0,0.35)`,
                }}
              >
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 w-full pt-2 sm:pt-0 pb-4 sm:pb-3 border-b"
                  style={{ borderColor: inputBorder }}
                >
                  <div className="flex items-center justify-between w-full sm:w-auto">
                    <h2
                      className="font-bold text-lg flex items-center gap-2"
                      style={{ color: textPrimary }}
                    >
                      {editing ? (
                        <span className="flex items-center gap-2 tracking-wide uppercase">
                          EDIT RECEIPT
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
                            style={{ backgroundColor: editAccent }}
                          >
                            EDITING
                          </span>
                        </span>
                      ) : (
                        <span className="tracking-wide uppercase">
                          ADD NEW RECEIPT
                        </span>
                      )}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setEditing(null);
                        setScanPreview(null);
                      }}
                      className="sm:hidden p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-red-500 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="grid grid-cols-3 sm:flex items-center gap-2 flex-1 sm:flex-none">
                      <button
                        type="button"
                        disabled={scanning}
                        onClick={handlePasteClick}
                        className="flex items-center justify-center gap-1 px-2.5 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-semibold transition-all hover:scale-105"
                        style={{
                          backgroundColor: scanning
                            ? `${accent}11`
                            : `${accent}18`,
                          border: `1px solid ${accent}44`,
                          color: accent,
                        }}
                        title="Paste an image from your clipboard"
                      >
                        <ClipboardPaste size={15} />
                        <span className="hidden sm:inline">Paste Image</span>
                        <span className="sm:hidden">Paste</span>
                      </button>
                      <button
                        type="button"
                        disabled={scanning}
                        onClick={() => scanRef.current?.click()}
                        className="flex items-center justify-center gap-1 px-2.5 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-semibold transition-all hover:scale-105 text-white"
                        style={{ backgroundColor: accent }}
                        title="Upload receipt image"
                      >
                        <Upload size={15} />
                        <span className="hidden sm:inline">Upload Receipt</span>
                        <span className="sm:hidden">Upload</span>
                      </button>
                      <button
                        type="button"
                        disabled={scanning}
                        onClick={() => cameraRef.current?.click()}
                        className="flex items-center justify-center gap-1 px-2.5 py-2.5 sm:hidden rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                        style={{
                          backgroundColor: "#6366F1",
                          opacity: scanning ? 0.6 : 1,
                        }}
                        title="Open camera"
                      >
                        <Camera size={15} />
                        <span>Camera</span>
                      </button>
                      <input
                        ref={scanRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleScanImage}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setEditing(null);
                        setScanPreview(null);
                      }}
                      className="hidden sm:flex shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      style={{ color: textMuted }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {editing && (
                  <div
                    className="rounded-xl p-3 flex items-start gap-2.5 text-xs border animate-fade-in"
                    style={{
                      backgroundColor: editAlertBg,
                      borderColor: editAlertBorder,
                      color: editAlertText,
                    }}
                  >
                    <Pencil
                      size={15}
                      className="mt-0.5 shrink-0"
                      style={{ color: editAlertText }}
                    />
                    <div>
                      <span
                        className="font-bold block mb-0.5"
                        style={{ color: textPrimary }}
                      >
                        Editing Persisted Record
                      </span>
                      <span style={{ color: textMuted }}>
                        You are modifying an existing receipt. Saving changes
                        will update the record and append to its history log.
                      </span>
                    </div>
                  </div>
                )}

                {/* ── Side-by-side: image reference + form fields ── */}
                <div className="flex flex-col lg:flex-row gap-4">
                  {/* Sticky receipt image reference */}
                  {scanPreview && (
                    <div className="flex-shrink-0 lg:w-44">
                      <p
                        className="text-xs font-semibold mb-1.5"
                        style={{ color: scanBorder }}
                      >
                        📄 Receipt reference
                      </p>
                      <div style={{ position: "relative" }}>
                        <img
                          src={scanPreview}
                          alt="Scanned receipt"
                          style={{
                            width: "100%",
                            maxWidth: 180,
                            borderRadius: 10,
                            border: `2px solid ${scanBorder}44`,
                            objectFit: "contain",
                            maxHeight: 320,
                          }}
                        />
                        {scanning && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              backgroundColor: "rgba(0,0,0,0.55)",
                              borderRadius: 10,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 8,
                            }}
                          >
                            <Loader2
                              size={28}
                              className="animate-spin"
                              style={{ color: accent }}
                            />
                            <span style={{ color: "#fff", fontSize: 11 }}>
                              Reading receipt…
                            </span>
                          </div>
                        )}
                      </div>
                      {!scanning && scannedFields.size > 0 && !scanError && (
                        <p
                          className="text-xs mt-2"
                          style={{ color: scanBorder }}
                        >
                          ⚠ Amber fields were auto-filled — review for accuracy.
                        </p>
                      )}
                      {!scanning && scanError && (
                        <p className="text-xs mt-2" style={{ color: danger }}>
                          ❌ {scanError}
                        </p>
                      )}
                      {uploadingReceipt && (
                        <p
                          className="text-xs mt-2 flex items-center gap-1"
                          style={{ color: textMuted }}
                        >
                          <Loader2 size={11} className="animate-spin" /> Saving
                          image to storage…
                        </p>
                      )}
                      {!uploadingReceipt && uploadedReceiptUrl && (
                        <p className="text-xs mt-2" style={{ color: accent }}>
                          ✓ Image saved to storage
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setScanPreview(null);
                          setScannedFields(new Set());
                          setScanError("");
                          setUploadedReceiptUrl(null);
                        }}
                        className="text-xs mt-2"
                        style={{ color: textMuted }}
                      >
                        × Clear
                      </button>
                    </div>
                  )}

                  {/* Form grid */}
                  <div
                    className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 sm:gap-x-4 sm:gap-y-3"
                    onKeyDown={handleFormKeyDown}
                  >
                    {/* Branch */}
                    {field(
                      "Branch",
                      <div style={{ position: "relative" }}>
                        <Building2
                          size={14}
                          style={{
                            position: "absolute",
                            left: 12,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: textMuted,
                            pointerEvents: "none",
                            zIndex: 1,
                          }}
                        />
                        <select
                          id="receipt-branch"
                          value={form.branchId}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            setForm((f) => ({ ...f, branchId: selectedId }));
                          }}
                          disabled={true}
                          className="w-full rounded-xl sm:rounded-lg pl-9 pr-9 py-2.5 sm:py-1.5 text-base sm:text-xs appearance-none outline-none cursor-not-allowed font-medium bg-slate-100 dark:bg-slate-900/50"
                          style={{
                            backgroundColor: isLight ? "#f1f5f9" : "#1e293b",
                            border: `1px solid ${inputBorder}`,
                            color: textMuted,
                            colorScheme: isLight ? "light" : "dark",
                          }}
                        >
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={14}
                          style={{
                            position: "absolute",
                            right: 12,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: textMuted,
                            pointerEvents: "none",
                          }}
                        />
                      </div>,
                    )}

                    {/* Date */}
                    {field(
                      (
                        <span className="flex items-center gap-1">
                          Date{" "}
                          {scannedFields.has("date") && (
                            <span style={{ color: scanBorder, fontSize: 10 }}>
                              ✦ from scan
                            </span>
                          )}
                        </span>
                      ) as unknown as string,
                      <div>
                        <input
                          value={dateRaw}
                          id="receipt-date"
                          onChange={(e) => {
                            setDateRaw(e.target.value);
                            setDateError("");
                            clearScanned("date");
                          }}
                          onBlur={(e) => handleDateBlur(e.target.value)}
                          placeholder={latestDateStr}
                          className="w-full rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 text-base sm:text-xs outline-none transition-all"
                          style={{
                            backgroundColor: inputBg,
                            border: `1px solid ${inputBorder}`,
                            color: textPrimary,
                            ...scannedStyle("date"),
                          }}
                        />
                        {dateError ? (
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: danger }}
                          >
                            {dateError}
                          </p>
                        ) : form.date ? (
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: accent }}
                          >
                            ✓ {form.date}
                          </p>
                        ) : null}
                      </div>,
                    )}

                    {/* Incurred By */}
                    {field(
                      (
                        <span className="flex items-center gap-1">
                          Incurred By{" "}
                          {scannedFields.has("incurredBy") && (
                            <span style={{ color: scanBorder, fontSize: 10 }}>
                              ✦ from scan
                            </span>
                          )}
                        </span>
                      ) as unknown as string,
                      <AutoSuggestInput
                        value={form.incurredBy}
                        id="receipt-incurredBy"
                        onChange={(v) => {
                          setForm((f) => ({ ...f, incurredBy: v }));
                          clearScanned("incurredBy");
                        }}
                        suggestions={suggestions.people}
                        placeholder="Who incurred this?"
                        {...{ inputBg, textPrimary, textMuted, accent }}
                        inputClassName="text-base sm:text-xs rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5"
                        inputBorder={
                          scannedFields.has("incurredBy")
                            ? scanBorder
                            : inputBorder
                        }
                      />,
                    )}

                    {/* Description */}
                    {field(
                      (
                        <span className="flex items-center gap-1">
                          Description{" "}
                          {scannedFields.has("description") && (
                            <span style={{ color: scanBorder, fontSize: 10 }}>
                              ✦ from scan
                            </span>
                          )}
                        </span>
                      ) as unknown as string,
                      <AutoSuggestInput
                        value={form.description}
                        id="receipt-description"
                        onChange={(v) => {
                          setForm((f) => ({ ...f, description: v }));
                          clearScanned("description");
                        }}
                        suggestions={suggestions.descs}
                        placeholder="What was purchased?"
                        {...{ inputBg, textPrimary, textMuted, accent }}
                        inputClassName="text-base sm:text-xs rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5"
                        inputBorder={
                          scannedFields.has("description")
                            ? scanBorder
                            : inputBorder
                        }
                      />,
                    )}

                    {/* Company */}
                    {field(
                      (
                        <span className="flex items-center gap-1">
                          Company / Vendor{" "}
                          {scannedFields.has("company") && (
                            <span style={{ color: scanBorder, fontSize: 10 }}>
                              ✦ from scan
                            </span>
                          )}
                        </span>
                      ) as unknown as string,
                      <AutoSuggestInput
                        value={form.company}
                        id="receipt-company"
                        onChange={(v) => {
                          setForm((f) => ({ ...f, company: v.toUpperCase() }));
                          clearScanned("company");
                        }}
                        suggestions={suggestions.companies}
                        placeholder="STORE OR VENDOR NAME"
                        {...{ inputBg, textPrimary, textMuted, accent }}
                        inputClassName="text-base sm:text-xs rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 uppercase"
                        inputBorder={
                          scannedFields.has("company")
                            ? scanBorder
                            : inputBorder
                        }
                      />,
                    )}

                    {/* Receipt No */}
                    {field(
                      (
                        <span className="flex items-center gap-1">
                          Receipt No.{" "}
                          {scannedFields.has("receiptNo") && (
                            <span style={{ color: scanBorder, fontSize: 10 }}>
                              ✦ from scan
                            </span>
                          )}
                        </span>
                      ) as unknown as string,
                      <input
                        value={form.receiptNo}
                        id="receipt-receiptNo"
                        onChange={(e) => {
                          setForm((f) => ({ ...f, receiptNo: e.target.value }));
                          clearScanned("receiptNo");
                        }}
                        placeholder="OR / SI number"
                        className="w-full rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 text-base sm:text-xs outline-none transition-all"
                        style={{
                          backgroundColor: inputBg,
                          border: `1px solid ${inputBorder}`,
                          color: textPrimary,
                          ...scannedStyle("receiptNo"),
                        }}
                      />,
                    )}

                    {/* No receipt option */}
                    {noReceiptControl && field("Receipt", noReceiptControl)}

                    {/* Amount */}
                    {field(
                      (
                        <span className="flex items-center gap-1">
                          Amount (₱){" "}
                          {scannedFields.has("amount") && (
                            <span style={{ color: scanBorder, fontSize: 10 }}>
                              ✦ from scan
                            </span>
                          )}
                        </span>
                      ) as unknown as string,
                      <input
                        type="text"
                        value={form.amount}
                        id="receipt-amount"
                        onChange={(e) => {
                          setForm((f) => ({ ...f, amount: e.target.value }));
                          clearScanned("amount");
                        }}
                        onBlur={(e) => {
                          const numeric = parseFloat(
                            e.target.value.replace(/,/g, ""),
                          );
                          if (!isNaN(numeric)) {
                            setForm((f) => ({
                              ...f,
                              amount: numeric.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }),
                            }));
                          }
                        }}
                        placeholder="0.00"
                        className="w-full rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 text-base sm:text-xs font-semibold outline-none transition-all"
                        style={{
                          backgroundColor: inputBg,
                          border: `1px solid ${inputBorder}`,
                          color: textPrimary,
                          ...scannedStyle("amount"),
                        }}
                      />,
                    )}

                    {/* Source of Funds */}
                    {field(
                      (
                        <span className="flex items-center gap-1">
                          Source of Funds{" "}
                          {scannedFields.has("sourceOfFunds") && (
                            <span style={{ color: scanBorder, fontSize: 10 }}>
                              ✦ from scan
                            </span>
                          )}
                        </span>
                      ) as unknown as string,
                      <AutoSuggestInput
                        value={form.sourceOfFunds}
                        id="receipt-sourceOfFunds"
                        onChange={(v) => {
                          setForm((f) => ({ ...f, sourceOfFunds: v }));
                          clearScanned("sourceOfFunds");
                        }}
                        suggestions={suggestions.sources}
                        placeholder="Petty cash, reimbursement…"
                        {...{ inputBg, textPrimary, textMuted, accent }}
                        inputClassName="text-base sm:text-xs rounded-xl sm:rounded-lg px-3.5 py-2.5 sm:px-2.5 sm:py-1.5"
                        inputBorder={
                          scannedFields.has("sourceOfFunds")
                            ? scanBorder
                            : inputBorder
                        }
                      />,
                    )}
                  </div>
                </div>

                {/* Category chips */}
                <div
                  className="pt-1 border-t"
                  style={{ borderColor: inputBorder }}
                >
                  <div className="flex items-center justify-between pt-4">
                    <label
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: textMuted }}
                    >
                      Expense Category
                    </label>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() =>
                          setIsEditingCategories(!isEditingCategories)
                        }
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all hover:scale-105"
                        style={{
                          border: `1.5px solid ${isEditingCategories ? accent : inputBorder}`,
                          backgroundColor: isEditingCategories
                            ? `${accent}18`
                            : inputBg,
                          color: isEditingCategories ? accent : textMuted,
                        }}
                      >
                        <Settings size={12} />
                        {isEditingCategories
                          ? "Done Managing"
                          : "Manage Categories"}
                      </button>
                    )}
                  </div>

                  {!isEditingCategories && (
                    <div className="relative mt-3">
                      <Search
                        size={13}
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: textMuted }}
                      />
                      <input
                        value={categoryQuery}
                        onChange={(e) => setCategoryQuery(e.target.value)}
                        placeholder="Search category…"
                        className="w-full pl-8 pr-8 py-2 rounded-lg text-xs font-semibold outline-none"
                        style={{
                          border: `1px solid ${inputBorder}`,
                          backgroundColor: inputBg,
                          color: textPrimary,
                        }}
                      />
                      {categoryQuery && (
                        <button
                          type="button"
                          onClick={() => setCategoryQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2"
                          style={{ color: textMuted }}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3 max-h-56 overflow-y-auto pr-1">
                    {isEditingCategories
                      ? // --- Edit Mode / Reorder Mode ---
                        sortedCategoryDetails.map((cat, idx) => {
                          const isEditingThis =
                            editingCategoryDetail?.id === cat.id;
                          return (
                            <div
                              key={cat.id}
                              draggable={false}
                              onDragStart={(e) => handleDragStart(e, idx)}
                              onDragOver={(e) => handleDragOver(e, idx)}
                              onDragEnd={handleDragEnd}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none shadow-sm"
                              style={{
                                border: `1.5px dashed ${draggedIndex === idx ? accent : inputBorder}`,
                                backgroundColor: inputBg,
                                color: textPrimary,
                                opacity: draggedIndex === idx ? 0.4 : 1,
                              }}
                            >
                              {isEditingThis ? (
                                <input
                                  value={editingCategoryName}
                                  onChange={(e) =>
                                    setEditingCategoryName(e.target.value)
                                  }
                                  onKeyDown={async (e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      await handleSaveCategoryName(cat);
                                    }
                                    if (e.key === "Escape") {
                                      setEditingCategoryDetail(null);
                                    }
                                  }}
                                  className="px-1 py-0.5 rounded border text-xs outline-none bg-transparent"
                                  style={{
                                    borderColor: accent,
                                    color: textPrimary,
                                    width: 90,
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onDoubleClick={() =>
                                    startEditingCategoryName(cat)
                                  }
                                  className="truncate max-w-[120px]"
                                  title="Double click to edit"
                                >
                                  {cat.name}
                                </span>
                              )}

                              <div
                                className="flex items-center gap-1 border-l pl-2"
                                style={{ borderColor: inputBorder }}
                              >
                                {isEditingThis ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSaveCategoryName(cat)}
                                    style={{ color: accent }}
                                    className="font-bold"
                                  >
                                    ✓
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startEditingCategoryName(cat)
                                    }
                                    style={{ color: textMuted }}
                                    className="hover:text-emerald-500"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (
                                      window.confirm(
                                        `Delete category "${cat.name}"?`,
                                      )
                                    ) {
                                      try {
                                        await deleteAuditExpenseCategory(
                                          cat.id,
                                        );
                                        await reloadCategories();
                                      } catch {
                                        alert("Failed to delete category.");
                                      }
                                    }
                                  }}
                                  style={{ color: danger }}
                                  className="hover:opacity-80"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      : // --- Normal Mode ---
                        visibleCategories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                expenseCategory: cat as AuditExpenseCategory,
                              }))
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-102"
                            style={{
                              border: `1px solid ${form.expenseCategory === cat ? accent : inputBorder}`,
                              backgroundColor:
                                form.expenseCategory === cat
                                  ? `${accent}22`
                                  : inputBg,
                              color:
                                form.expenseCategory === cat
                                  ? accent
                                  : textMuted,
                            }}
                          >
                            {cat}
                          </button>
                        ))}

                    {!isEditingCategories && visibleCategories.length === 0 && (
                      <span className="text-xs" style={{ color: textMuted }}>
                        No category matches "{categoryQuery}".
                        {isAdmin
                          ? " Use New to add one."
                          : " Pick the closest one, or Other."}
                      </span>
                    )}

                    {/* Add custom category (admins only — members pick from the general list) */}
                    {isAdmin &&
                      (addingCategory ? (
                        <div className="flex items-center gap-1">
                          <input
                            ref={newCategoryRef}
                            value={newCategoryInput}
                            onChange={(e) =>
                              setNewCategoryInput(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void saveCustomCategory();
                              }
                              if (e.key === "Escape") {
                                setAddingCategory(false);
                                setNewCategoryInput("");
                              }
                            }}
                            placeholder="Category name"
                            className="px-2 py-1 rounded-lg text-xs font-semibold outline-none w-32"
                            style={{
                              border: `1px solid ${accent}`,
                              backgroundColor: inputBg,
                              color: textPrimary,
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void saveCustomCategory()}
                            className="px-2 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-90"
                            style={{ backgroundColor: accent }}
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingCategory(false);
                              setNewCategoryInput("");
                            }}
                            className="px-2 py-1 rounded-lg text-xs font-semibold"
                            style={{
                              color: textMuted,
                              backgroundColor: inputBg,
                              border: `1px solid ${inputBorder}`,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingCategory(true)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 hover:scale-102"
                          style={{
                            border: `1px dashed ${inputBorder}`,
                            backgroundColor: inputBg,
                            color: textMuted,
                          }}
                        >
                          <Plus size={11} /> New
                        </button>
                      ))}
                  </div>
                </div>

                <div
                  className="flex flex-col sm:flex-row gap-3 justify-end pt-6 sm:pt-4 mt-2 border-t"
                  style={{ borderColor: inputBorder }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditing(null);
                    }}
                    className="flex-1 sm:flex-none px-4 py-3 sm:py-2.5 text-sm rounded-xl sm:rounded-lg font-semibold"
                    style={{
                      color: textMuted,
                      backgroundColor: inputBg,
                      border: `1px solid ${inputBorder}`,
                    }}
                    disabled={savingReceipt}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitReceipt}
                    className="flex-1 sm:flex-none px-5 py-3 sm:py-2.5 rounded-xl text-sm font-bold text-white shadow flex items-center gap-2 justify-center transition-all active:scale-95"
                    style={{ backgroundColor: activeAccent }}
                    disabled={savingReceipt}
                  >
                    {savingReceipt ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Saving…
                      </>
                    ) : editing ? (
                      "Apply Updates"
                    ) : (
                      "Save Record"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}

      {/* ── ADD ANOTHER RECEIPT? PROMPT (shown after saving a new record) ── */}
      <ExpensePromptModal
        open={showAddAnotherPrompt}
        onDone={handleDoneAdding}
        onAddAnother={handleAddAnother}
      />


      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleAttachPhoto(e)}
      />

      {receiptTarget && (
        <ReceiptScanDialog
          mode="expense"
          branchName={branchName}
          reportDate={receiptTarget.date}
          expectedAmount={receiptTarget.amount}
          initial={{ incurredBy: receiptTarget.worker, sourceOfFunds: "CASH" }}
          initialFile={receiptTargetFile}
          otherReceiptNos={branchExpenses
            .map((e) => e.receiptNo)
            .filter(Boolean)}
          onClose={() => {
            setReceiptTarget(null);
            setReceiptTargetFile(null);
          }}
          onConfirm={(r) => {
            setReceiptTargetFile(null);
            return resolvePendingPurchase(receiptTarget, r);
          }}
        />
      )}

      {/* ── Expense Records vs DTR summary ── */}
      {activeTab === "expenses" &&
        branchId &&
        dtrPeriod &&
        (() => {
          const fmt = (n: number) =>
            `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const signed = (n: number) =>
            `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmt(Math.abs(n))}`;
          const summaryLoading = dtrExpenses.loading || dtrLines.loading;
          const hasDtr =
            dtrExpenses.matched && !summaryLoading && dtrExpenses.total != null;
          // Expense Records hold both expenses and resolved purchases (materials), so compare them with
          // the DTR's Expenses + Purchases, not Expenses alone.
          const purchaseLines = dtrLines.rows.filter(
            (l) => l.type === "PURCHASE",
          );
          const linesTyped = dtrLines.rows.some((l) => !!l.type);
          const resolvedPurchases = purchaseLines.reduce(
            (acc, l) =>
              acc +
              (l.returnedAll
                ? 0
                : l.receiptReturned
                  ? Math.min(l.actualAmount || l.amount, l.amount)
                  : l.actualAmount || 0),
            0,
          );
          const todayKey = (() => {
            const n = new Date();
            return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
          })();
          const pendingPurchases = purchaseLines
            .filter(
              (l) =>
                !l.receiptReturned && (!l.reportDate || l.reportDate < todayKey),
            )
            .reduce(
              (acc, l) => acc + Math.max(0, l.amount - (l.actualAmount || 0)),
              0,
            );
          const dtrSpend =
            (dtrExpenses.total || 0) +
            (linesTyped ? resolvedPurchases : dtrExpenses.purchases);
          const diff = hasDtr ? recordsTotalForDtr - dtrSpend : null;
          const balanced = diff != null && Math.abs(diff) < 0.005;
          const diffColor =
            diff == null ? textMuted : balanced ? accent : danger;
          const depositDiff = depositsForDtr - dtrExpenses.deposits;
          const pulse = (
            <span
              className="inline-block h-6 w-28 rounded-md animate-pulse align-middle"
              style={{ backgroundColor: `${textMuted}2e` }}
            />
          );
          const miniStat = (
            label: string,
            value: React.ReactNode,
            color: string,
            title?: string,
          ) => (
            <div
              title={title}
              className="flex flex-col gap-0 rounded-lg px-3 py-1 min-w-[112px]"
              style={{ border: `1px solid ${border}` }}
            >
              <span
                className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"
                style={{ color: textMuted }}
              >
                {label}
              </span>
              <span
                className="text-base font-black tabular-nums leading-tight whitespace-nowrap"
                style={{ color }}
              >
                {value}
              </span>
            </div>
          );
          // Reasons the records and the DTR differ (shown in a popup, count in the header)
          const why =
            hasDtr && reconciliation
              ? (() => {
                  const { buckets, cashAdvance, sum } = reconciliation;
                  const rows: {
                    id: string;
                    title: string;
                    hint: string;
                    list: typeof buckets.manual;
                    amount: number;
                    side: "dtr" | "records";
                  }[] = [
                    {
                      id: "depositAsExpense",
                      title: "Deposits to HO entered as expenses",
                      hint: "Logged as DTR expense rows before the COH Deposit section existed. They inflate DTR Expenses; move them to COH Deposit on those DTRs.",
                      list: buckets.depositAsExpense,
                      amount: sum(buckets.depositAsExpense),
                      side: "dtr",
                    },
                    {
                      id: "pendingPurchase",
                      title: "Purchases waiting for receipt",
                      hint: "Not counted in the comparison until the receipt is returned — resolve them in Purchases so they become records.",
                      list: buckets.pendingPurchase,
                      amount: sum(buckets.pendingPurchase),
                      side: "dtr",
                    },
                    {
                      id: "neverPushed",
                      title: "DTR entries with no record",
                      hint: "Saved on the DTR but never sent to Expense Records (older DTRs or imported totals). Re-save the DTR to push them.",
                      list: buckets.neverPushed,
                      amount: sum(buckets.neverPushed),
                      side: "dtr",
                    },
                    {
                      id: "deleted",
                      title: "Records deleted",
                      hint: "The DTR entry was linked to a record that has since been deleted.",
                      list: buckets.deleted,
                      amount: sum(buckets.deleted),
                      side: "dtr",
                    },
                    {
                      id: "otherMonth",
                      title: "Recorded in a different month",
                      hint: "The record’s receipt date falls outside this month, so it is counted elsewhere.",
                      list: buckets.otherMonth,
                      amount: sum(buckets.otherMonth),
                      side: "dtr",
                    },
                    {
                      id: "amountDiff",
                      title: "Amount differs",
                      hint: "The DTR amount and the record amount do not match (positive = DTR higher).",
                      list: buckets.amountDiff,
                      amount: sum(buckets.amountDiff),
                      side: "dtr",
                    },
                    {
                      id: "manual",
                      title: "Records not on any DTR",
                      hint: "Added directly in Expense Records — they raise the records total.",
                      list: buckets.manual,
                      amount: sum(buckets.manual),
                      side: "records",
                    },
                  ];
                  const visible = rows.filter((r) => r.list.length > 0);
                  return { cashAdvance, visible };
                })()
              : null;
          const cashAdvance = why?.cashAdvance ?? 0;
          const visible = why?.visible ?? [];
          const whyCount = visible.length + (cashAdvance > 0.005 ? 1 : 0);
          return (
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                style={{ borderBottom: `1px solid ${border}` }}
              >
                <span
                  className="text-sm font-black uppercase tracking-wider"
                  style={{ color: textPrimary }}
                >
                  Summary
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={periodDupes.rows === 0}
                    onClick={() => setShowDupesOnly((v) => !v)}
                    title={
                      periodDupes.rows === 0
                        ? "No repeated receipts found"
                        : `${signed(periodDupes.extra)} extra · click to ${showDupesOnly ? "show all records" : "show only these"}`
                    }
                    className="flex flex-col text-left rounded-lg px-3 py-1 min-w-[112px] disabled:cursor-default"
                    style={{
                      border: `1px solid ${periodDupes.rows === 0 ? border : `${danger}66`}`,
                      cursor: periodDupes.rows === 0 ? "default" : "pointer",
                    }}
                  >
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: textMuted }}
                    >
                      Possible duplicates
                    </span>
                    <span
                      className="text-base font-black leading-tight whitespace-nowrap"
                      style={{
                        color: periodDupes.rows === 0 ? accent : danger,
                      }}
                    >
                      {periodDupes.rows === 0
                        ? "None"
                        : `${periodDupes.rows} rows`}
                    </span>
                  </button>
                  {miniStat(
                    "Deposit to HO",
                    fmt(hasDtr ? dtrExpenses.deposits : depositsForDtr),
                    textPrimary,
                    hasDtr
                      ? `Per DTR · in records ${fmt(depositsForDtr)} · ${signed(depositDiff)}`
                      : `${periodRecords.filter(isDepositRecord).length} deposit record(s)`,
                  )}
                  {miniStat(
                    "Expense Records",
                    fmt(recordsTotalForDtr),
                    textPrimary,
                    `${recordsForDtr.length} record${recordsForDtr.length === 1 ? "" : "s"} · excl. deposits`,
                  )}
                  {miniStat(
                    "DTR Exp. + Purchases",
                    summaryLoading
                      ? pulse
                      : !hasDtr
                        ? "Unavailable"
                        : fmt(dtrSpend),
                    textPrimary,
                    summaryLoading
                      ? "Loading this month…"
                      : !dtrExpenses.matched
                        ? "No DTR found for this branch"
                        : linesTyped
                          ? `Expenses ${fmt(dtrExpenses.total || 0)} · Purchases w/ receipt ${fmt(resolvedPurchases)}${pendingPurchases > 0 ? ` · ${fmt(pendingPurchases)} awaiting receipt (not counted)` : ""}`
                          : `Expenses ${fmt(dtrExpenses.total || 0)} · Purchases ${fmt(dtrExpenses.purchases)}`,
                  )}
                  {miniStat(
                    "Difference",
                    summaryLoading ? pulse : diff == null ? "—" : signed(diff),
                    diffColor,
                    "Records − DTR",
                  )}
                  {whyCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setWhyOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-full text-xs font-bold uppercase tracking-wide whitespace-nowrap min-w-[250px] cursor-pointer transition-opacity hover:opacity-80"
                      style={{
                        color: textPrimary,
                        border: `1px solid ${border}`,
                      }}
                    >
                      Why the difference? · {whyCount} reason
                      {whyCount === 1 ? "" : "s"}
                    </button>
                  )}
                  {diff != null && (
                    <span
                      className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-full text-xs font-bold uppercase tracking-wide whitespace-nowrap"
                      style={{
                        color: diffColor,
                        backgroundColor: `${diffColor}18`,
                        border: `1px solid ${diffColor}44`,
                      }}
                    >
                      {balanced
                        ? "Balanced"
                        : diff > 0
                          ? "Records exceed DTR"
                          : "DTR exceeds records"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleExportMonthReport}
                    disabled={
                      dtrLines.loading || dtrExpenses.loading || !reconciliation
                    }
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-full text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-50 cursor-pointer"
                    style={{
                      backgroundColor: `${accent}18`,
                      border: `1px solid ${accent}44`,
                      color: accent,
                    }}
                    title="Download Summary, Differences and Records for this period as an Excel file"
                  >
                    <Download size={14} /> Export month report
                  </button>
                </div>
              </div>
              {whyOpen &&
                why &&
                createPortal(
                  <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50">
                    <div
                      className="w-full max-w-5xl min-h-[60vh] max-h-[92vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
                      style={{
                        backgroundColor: cardBg,
                        border: `1px solid ${border}`,
                      }}
                    >
                      <div
                        className="flex items-center justify-between gap-3 px-4 py-3"
                        style={{ borderBottom: `1px solid ${border}` }}
                      >
                        <div className="flex flex-col">
                          <span
                            className="text-lg font-black uppercase tracking-wider"
                            style={{ color: textPrimary }}
                          >
                            Why the difference?
                          </span>
                          <span
                            className="text-[11px]"
                            style={{ color: textMuted }}
                          >
                            {filterMonth === "All"
                              ? `${dtrPeriod.from} to ${dtrPeriod.to}`
                              : filterMonth}{" "}
                            · Records vs DTR
                            {diff != null ? ` · ${signed(diff)}` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWhyOpen(false)}
                          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                          style={{ color: textMuted }}
                          title="Close"
                        >
                          <X size={22} />
                        </button>
                      </div>
                      <div className="overflow-y-auto" style={{ zoom: 1.2 }}>
                        {cashAdvance > 0.005 && (
                          <div
                            className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                            style={{ borderBottom: `1px solid ${border}` }}
                          >
                            <div className="flex flex-col">
                              <span
                                className="font-bold"
                                style={{ color: textPrimary }}
                              >
                                Cash advances on the DTR
                              </span>
                              <span
                                className="text-[10px]"
                                style={{ color: textMuted }}
                              >
                                Counted in DTR Expenses, but not kept in Expense
                                Records.
                              </span>
                            </div>
                            <span
                              className="font-black tabular-nums"
                              style={{ color: danger }}
                            >
                              -{fmt(cashAdvance)}
                            </span>
                          </div>
                        )}
                        {!dtrLines.loading &&
                          visible.length === 0 &&
                          cashAdvance <= 0.005 && (
                            <div
                              className="px-3 py-2 text-xs"
                              style={{ color: textMuted }}
                            >
                              Every DTR entry matches a record.
                            </div>
                          )}
                        {visible.map((r) => {
                          const open = openBucket === r.id;
                          const color = r.side === "records" ? accent : danger;
                          return (
                            <div
                              key={r.id}
                              style={{ borderBottom: `1px solid ${border}` }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenBucket(open ? null : r.id)
                                }
                                className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                              >
                                <div className="flex flex-col min-w-0">
                                  <span
                                    className="font-bold"
                                    style={{ color: textPrimary }}
                                  >
                                    {r.title}{" "}
                                    <span style={{ color: textMuted }}>
                                      · {r.list.length}
                                    </span>
                                  </span>
                                  <span
                                    className="text-[10px]"
                                    style={{ color: textMuted }}
                                  >
                                    {r.hint}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className="font-black tabular-nums"
                                    style={{ color }}
                                  >
                                    {r.side === "records" ? "+" : "-"}
                                    {fmt(Math.abs(r.amount))}
                                  </span>
                                  <ChevronDown
                                    size={13}
                                    style={{
                                      color: textMuted,
                                      transform: open
                                        ? "rotate(180deg)"
                                        : undefined,
                                    }}
                                  />
                                </div>
                              </button>
                              {open && (
                                <div className="px-3 pb-2 max-h-56 overflow-y-auto">
                                  {r.list.map((i) => (
                                    <div
                                      key={i.key}
                                      className="flex items-center justify-between gap-3 py-1 text-[11px]"
                                      style={{
                                        borderTop: `1px dashed ${border}`,
                                      }}
                                    >
                                      <span
                                        className="shrink-0 tabular-nums"
                                        style={{ color: textMuted }}
                                      >
                                        {i.date}
                                      </span>
                                      <span
                                        className="flex-1 min-w-0 truncate"
                                        style={{ color: textPrimary }}
                                        title={i.label}
                                      >
                                        {i.label}
                                        {i.note && (
                                          <span style={{ color: textMuted }}>
                                            {" "}
                                            · {i.note}
                                          </span>
                                        )}
                                      </span>
                                      <span
                                        className="shrink-0 font-bold tabular-nums"
                                        style={{ color: textPrimary }}
                                      >
                                        {fmt(i.amount)}
                                      </span>
                                      {r.id === "deleted" && (
                                        <button
                                          type="button"
                                          onClick={() => void reopenPurchase(i.key, i.label, "Its receipt record no longer exists. The purchase goes back to Pending purchases receipts — add the receipt there again (or, if the record still exists, link it with Link to purchase).")}
                                          title="Its receipt record is gone — put the purchase back in Pending receipts so the receipt can be added again"
                                          className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-md cursor-pointer"
                                          style={{ color: "#b45309", border: "1px solid #d9770655", backgroundColor: "#d9770612" }}
                                        >
                                          Re-add receipt
                                        </button>
                                      )}
                                      {r.id === "manual" && (() => {
                                        // purchases in this period that could own this receipt (not the ones handed back unspent)
                                        const options = dtrLines.rows.filter((l) => l.type === "PURCHASE" && !l.returnedAll);
                                        if (options.length === 0) return null;
                                        const labelOf = (l: DtrLine) => `${l.reportDate} · ${l.description.split("|").filter(Boolean).join(" · ")} · ${fmt(l.amount)}`;
                                        return (
                                          <select
                                            value=""
                                            onChange={(e) => {
                                              const line = options.find((l) => l.id === e.target.value);
                                              if (line) void linkRecordToPurchase(i.key, line.id, labelOf(line));
                                            }}
                                            title="This record is the receipt of a DTR purchase whose link was lost — pick the purchase"
                                            className="shrink-0 max-w-[180px] text-[11px] font-bold px-2 py-1 rounded-md cursor-pointer"
                                            style={{ color: accent, border: `1px solid ${accent}55`, backgroundColor: `${accent}12` }}
                                          >
                                            <option value="">Link to purchase…</option>
                                            {options.map((l) => (
                                              <option key={l.id} value={l.id}>{labelOf(l)}</option>
                                            ))}
                                          </select>
                                        );
                                      })()}
                                      {i.recIds && i.fixDate && (
                                        <button
                                          type="button"
                                          onClick={() => void moveRecordsToDtrDate(i.recIds!, i.fixDate!)}
                                          title="The receipt date was read wrong — date the record with its DTR"
                                          className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-md cursor-pointer"
                                          style={{ color: accent, border: `1px solid ${accent}55`, backgroundColor: `${accent}12` }}
                                        >
                                          Use DTR date
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>,
                  document.body,
                )}
              <div className="p-3 pb-0">
                {/* Everything still waiting for a receipt: purchases without one + records without a photo. Newest first. */}
                {(() => {
                  const isoOf = (t: number) => {
                    const d = new Date(t);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  };
                  const todayMid = new Date();
                  todayMid.setHours(0, 0, 0, 0);
                  type Pending = {
                    key: string;
                    kind: "purchase" | "record";
                    date: string;
                    label: string;
                    amount: number;
                    ageDays: number;
                    purchase?: PendingPurchase;
                    record?: AuditExpense;
                  };
                  // The dedicated pending fetch can be older than the DTR-lines feed (e.g. a DTR submitted after this page loaded),
                  // so also take every unreceipted purchase the DTR-lines feed shows — "Why the difference?" and this list must agree.
                  const agingIds = new Set(agingPurchases.map((p) => p.id));
                  const fromLines: PendingPurchase[] = dtrLines.rows
                    .filter(
                      (l) =>
                        l.type === "PURCHASE" &&
                        !l.receiptReturned &&
                        !!l.reportDate &&
                        !agingIds.has(l.id) &&
                        !l.description.startsWith("ORDER|"),
                    )
                    .map((l) => {
                      const d = new Date(`${l.reportDate}T00:00:00`);
                      const parts = l.description.split("|");
                      return {
                        id: l.id,
                        date: l.reportDate as string,
                        label:
                          parts
                            .map((x) => x.trim())
                            .filter(Boolean)
                            .join(" · ") || "Purchase",
                        worker: l.description.includes("|")
                          ? parts[0].trim()
                          : "",
                        detail: l.description.includes("|")
                          ? parts.slice(1).join(" ").trim()
                          : l.description.trim(),
                        amount: Math.max(0, l.amount - (l.actualAmount || 0)),
                        given: l.amount,
                        received: l.actualAmount || 0,
                        ageDays: Math.max(
                          0,
                          Math.round(
                            (todayMid.getTime() - d.getTime()) / 86400000,
                          ),
                        ),
                      };
                    });
                  const recordMissingIds = new Set(
                    dtrLines.rows
                      .filter((l) => l.receiptRecordMissing)
                      .map((l) => l.id),
                  );
                  const purchaseItems: Pending[] = [
                    ...agingPurchases,
                    ...fromLines,
                  ].map((p) => ({
                    key: `p-${p.id}`,
                    kind: "purchase",
                    date: p.date,
                    label: recordMissingIds.has(p.id)
                      ? `${p.label} — receipt record missing, add the receipt again`
                      : p.received > 0
                        ? `${p.label} — ${fmt(p.received)} receipted of ${fmt(p.given)}, remaining`
                        : p.label,
                    amount: p.amount,
                    ageDays: p.ageDays,
                    purchase: p,
                  }));
                  // Cash advances have no receipt; every other record (expenses, deposits) needs its photo / slip.
                  const recordItems: Pending[] = branchExpenses
                    .filter(
                      (e) =>
                        !e.receiptImageUri &&
                        !isNoReceipt(e) &&
                        !/^CASH ADVANCE/i.test(e.expenseCategory || ""),
                    )
                    .map((e) => {
                      const t = dateToTime(e.date);
                      return {
                        key: `r-${e.id}`,
                        kind: "record" as const,
                        date: t ? isoOf(t) : "",
                        label: `${isDepositRecord(e) ? "Deposit slip" : e.expenseCategory || "Expense"}: ${e.description || e.company || "Record"}`,
                        amount: e.amount,
                        ageDays: t
                          ? Math.max(
                              0,
                              Math.round((todayMid.getTime() - t) / 86400000),
                            )
                          : 0,
                        record: e,
                      };
                    });
                  // Newest first: today's, then yesterday's, and so on — the recent ones are the ones that can still be chased.
                  // The summary follows the month picker: only items dated inside the selected month. "All months" shows
                  // everything, with the pre-October backlog kept apart.
                  const byMonth = filterMonth !== "All";
                  const all = [...purchaseItems, ...recordItems]
                    // Focused on the selected month only; a month with nothing pending shows no box at all.
                    .filter(
                      (i) =>
                        !byMonth ||
                        (i.date >= dtrPeriod.from && i.date <= dtrPeriod.to),
                    )
                    // Today's are not pending yet: the receipt is chased from the next day (today's purchases first show up tomorrow).
                    .filter((i) => i.ageDays >= 1)
                    .sort((x, y) =>
                      (y.date || "0000").localeCompare(x.date || "0000"),
                    );
                  if (all.length === 0) {
                    return purchasesFeed.loading ? (
                      <div
                        className="mb-3 rounded-lg px-4 py-3 text-sm animate-pulse"
                        style={{
                          border: `1px solid ${border}`,
                          color: textMuted,
                        }}
                      >
                        Loading pending receipts…
                      </div>
                    ) : null;
                  }
                  const current = byMonth
                    ? all
                    : all.filter((i) => i.date >= PENDING_LEGACY_BEFORE);
                  const legacy = byMonth
                    ? []
                    : all.filter((i) => i.date < PENDING_LEGACY_BEFORE);
                  const total = current.reduce((acc, i) => acc + i.amount, 0);
                  const open = pendingOpen;
                  const ageColor = (d: number) =>
                    d >= 8 ? danger : d >= 3 ? "#D97706" : textMuted;
                  const ageLabel = (d: number) =>
                    d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`;
                  const row = (i: Pending) => (
                    <div
                      key={i.key}
                      className="flex items-center justify-between gap-3 py-2.5 text-xs"
                      style={{ borderTop: `1px dashed ${border}` }}
                    >
                      <span
                        className="shrink-0 tabular-nums"
                        style={{ color: textMuted }}
                      >
                        {i.date || "—"}
                      </span>
                      <span
                        className="shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          color: textMuted,
                          border: `1px solid ${border}`,
                        }}
                      >
                        {i.kind === "purchase" ? "Purchase" : "No photo"}
                      </span>
                      <span
                        className="flex-1 min-w-0 truncate"
                        style={{ color: textPrimary }}
                        title={i.label}
                      >
                        {i.label}
                      </span>
                      <span
                        className="shrink-0 font-bold tabular-nums"
                        style={{ color: ageColor(i.ageDays) }}
                      >
                        {ageLabel(i.ageDays)}
                      </span>
                      <span
                        className="shrink-0 font-bold tabular-nums"
                        style={{ color: textPrimary }}
                      >
                        {fmt(i.amount)}
                      </span>
                      {i.purchase && (
                        <button
                          type="button"
                          onClick={() => void returnPendingAsCash(i.purchase!)}
                          title="The rest was returned as cash — close this purchase and add it as a Cash Return"
                          className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer"
                          style={{
                            color: "#b45309",
                            border: "1px solid #f59e0b88",
                            backgroundColor: "#f59e0b14",
                          }}
                        >
                          Return {fmt(i.purchase.amount)} as cash
                        </button>
                      )}
                      {i.purchase ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setReceiptTargetFile(null);
                              setReceiptTarget(i.purchase!);
                            }}
                            className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer"
                            style={{
                              color: accent,
                              border: `1px solid ${accent}55`,
                              backgroundColor: `${accent}12`,
                            }}
                          >
                            <Upload size={13} /> Add receipt
                          </button>
                          <button
                            type="button"
                            onClick={() => void handlePasteForPurchase(i.purchase!)}
                            className="shrink-0 flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-md cursor-pointer"
                            style={{
                              color: accent,
                              border: `1px solid ${accent}55`,
                              backgroundColor: `${accent}12`,
                            }}
                            title="Paste receipt image from clipboard"
                          >
                            <ClipboardPaste size={13} /> Paste
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => pickPhotoFor(i.record!)}
                          disabled={attachingPhotoId === i.record!.id}
                          className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-60"
                          style={{
                            color: accent,
                            border: `1px solid ${accent}55`,
                            backgroundColor: `${accent}12`,
                          }}
                        >
                          {attachingPhotoId === i.record!.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Upload size={13} />
                          )}{" "}
                          Add photo
                        </button>
                      )}
                    </div>
                  );
                  return (
                    <div
                      className="mb-3 rounded-lg overflow-hidden"
                      style={{
                        border: "1px solid #f59e0b99",
                        backgroundColor: "#f59e0b14",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setPendingOpen((v) => !v)}
                        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="font-bold uppercase tracking-wider"
                            style={{ color: "#b45309" }}
                          >
                            Pending purchases receipts
                          </span>
                          <span
                            className="text-xs font-black px-2 py-0.5 rounded-full tabular-nums"
                            style={{
                              color: "#b45309",
                              border: "1px solid #f59e0b99",
                              backgroundColor: "#f59e0b22",
                            }}
                          >
                            {current.length}
                          </span>
                        </span>
                        <span className="flex items-center gap-3 shrink-0">
                          <span
                            className="font-black tabular-nums"
                            style={{ color: "#b45309" }}
                          >
                            {fmt(total)}
                          </span>
                          <ChevronDown
                            size={14}
                            style={{
                              color: "#d97706",
                              transform: open ? "rotate(180deg)" : undefined,
                            }}
                          />
                        </span>
                      </button>
                      {open && (
                        <div className="px-4 pb-3 max-h-[65vh] overflow-y-auto">
                          {current.map(row)}
                          {legacy.length > 0 && (
                            <div
                              className="mt-2 pt-1 text-[10px] font-black uppercase tracking-wider"
                              style={{
                                color: textMuted,
                                borderTop: `1px solid ${border}`,
                              }}
                            >
                              Before Oct 1, 2026 · {legacy.length}
                            </div>
                          )}
                          {legacy.map(row)}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Receipts above the cash given: the member is owed the extra, as a REIMBURSE row on a DTR */}
                {(() => {
                  const missing = dtrLines.rows.filter(
                    (l) =>
                      l.type === "PURCHASE" &&
                      (l.reimburseDue || 0) > 0.005 &&
                      !l.reimburseFound,
                  );
                  if (missing.length === 0) return null;
                  const total = missing.reduce(
                    (acc, l) => acc + (l.reimburseDue || 0),
                    0,
                  );
                  const open = openBucket === "reimburseMissing";
                  return (
                    <div
                      className="mb-3 rounded-lg overflow-hidden"
                      style={{ border: "1px solid #f59e0b88" }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenBucket(open ? null : "reimburseMissing")
                        }
                        className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <div className="flex flex-col min-w-0">
                          <span
                            className="font-bold"
                            style={{ color: "#b45309" }}
                          >
                            Reimbursements not found on the DTR:{" "}
                            {missing.length} ({fmt(total)})
                          </span>
                          <span
                            className="text-[10px]"
                            style={{ color: textMuted }}
                          >
                            The receipt was higher than the cash given, so the
                            member paid the extra. Add a REIMBURSE row for them
                            under Expenses with Receipts on a DTR dated on or
                            after the purchase.
                          </span>
                        </div>
                        <ChevronDown
                          size={13}
                          style={{
                            color: textMuted,
                            transform: open ? "rotate(180deg)" : undefined,
                          }}
                          className="shrink-0"
                        />
                      </button>
                      {open && (
                        <div className="px-3 pb-2 max-h-56 overflow-y-auto">
                          {missing.map((l) => (
                            <div
                              key={l.id}
                              className="flex items-center justify-between gap-3 py-1 text-[11px]"
                              style={{ borderTop: `1px dashed ${border}` }}
                            >
                              <span
                                className="shrink-0 tabular-nums"
                                style={{ color: textMuted }}
                              >
                                {l.reportDate}
                              </span>
                              <span
                                className="flex-1 min-w-0 truncate"
                                style={{ color: textPrimary }}
                                title={l.description}
                              >
                                {l.description
                                  .split("|")
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                              <span
                                className="shrink-0 tabular-nums"
                                style={{ color: textMuted }}
                              >
                                receipt {fmt(l.actualAmount || 0)} vs{" "}
                                {fmt(l.amount)} given
                              </span>
                              <span
                                className="shrink-0 font-bold tabular-nums"
                                style={{ color: "#b45309" }}
                              >
                                reimburse {fmt(l.reimburseDue || 0)}
                              </span>
                            </div>
                          )).flatMap((rowEl, idx) => {
                            // The receipt(s) linked to this purchase, so it is clear which receipt came in over the cash given.
                            const l = missing[idx];
                            const linkedRecs = (l.resolvedExpenseId || "")
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean)
                              .map((x) => expenses.find((e) => e.id === x))
                              .filter((x): x is AuditExpense => !!x);
                            // Link lost (e.g. the DTR was re-saved from an old copy): fall back to the receipt number on the purchase.
                            const recNo = (l.receiptNo || "").trim().toUpperCase();
                            const recs = linkedRecs.length > 0 || !recNo
                              ? linkedRecs
                              : expenses.filter((e) => (e.receiptNo || "").trim().toUpperCase() === recNo);
                            const findInList = (term: string) => {
                              setFilterMonth("All");
                              setSearch(term);
                              setWhyOpen(false);
                              setTimeout(() => document.getElementById("expense-records-table")?.scrollIntoView({ behavior: "smooth" }), 50);
                            };
                            return [
                              rowEl,
                              <div key={`${l.id}-receipts`} className="pl-[88px] pb-1.5 flex flex-col gap-1">
                                {recs.length === 0 ? (
                                  <div className="flex items-center gap-2 text-[10px]" style={{ color: textMuted }}>
                                    {l.receiptImage && (
                                      <a href={l.receiptImage} target="_blank" rel="noopener noreferrer" title="Open receipt">
                                        <img src={l.receiptImage} alt="Receipt" className="h-7 w-7 rounded object-cover" style={{ border: `1px solid ${border}` }} />
                                      </a>
                                    )}
                                    <span>
                                      {l.receiptImage ? "Receipt photo is on the purchase, but its record was not found" : "No receipt record linked to this purchase"}
                                      {l.receiptNo ? ` (OR ${l.receiptNo})` : ""}.
                                    </span>
                                  </div>
                                ) : (
                                  recs.map((r) => (
                                    <div key={r.id} className="flex items-center gap-2 text-[10px]" style={{ color: textMuted }}>
                                      {r.receiptImageUri ? (
                                        <a href={r.receiptImageUri} target="_blank" rel="noopener noreferrer" title="Open receipt">
                                          <img src={r.receiptImageUri} alt="Receipt" className="h-7 w-7 rounded object-cover" style={{ border: `1px solid ${border}` }} />
                                        </a>
                                      ) : (
                                        <span className="h-7 w-7 rounded flex items-center justify-center" style={{ border: `1px dashed ${border}` }}>—</span>
                                      )}
                                      <span>
                                        {r.company || r.description || "Receipt"}
                                        {r.receiptNo ? ` · OR ${r.receiptNo}` : ""} · {r.date} · recorded {fmt(r.amount)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => findInList(r.receiptNo || r.description || r.company || "")}
                                        title="Show this record in the list below (all months)"
                                        className="font-bold underline cursor-pointer"
                                        style={{ color: accent }}
                                      >
                                        Find in list
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>,
                            ];
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Resolved purchases whose receipt was lower than the cash given: the difference must be a DTR Cash Return */}
                {(() => {
                  const missing = dtrLines.rows.filter(
                    (l) =>
                      l.type === "PURCHASE" &&
                      (l.refundDue || 0) > 0.005 &&
                      !l.cashReturnFound &&
                      returnIsDue(l.reportDate),
                  );
                  if (missing.length === 0) return null;
                  const total = missing.reduce(
                    (acc, l) => acc + (l.refundDue || 0),
                    0,
                  );
                  const open = openBucket === "cashReturnMissing";
                  return (
                    <div
                      className="mb-3 rounded-lg overflow-hidden"
                      style={{ border: `1px solid ${danger}55` }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenBucket(open ? null : "cashReturnMissing")
                        }
                        className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold" style={{ color: danger }}>
                            Cash returns not found on the DTR: {missing.length}{" "}
                            ({fmt(total)})
                          </span>
                          <span
                            className="text-[10px]"
                            style={{ color: textMuted }}
                          >
                            The receipt was lower than the cash given, but no
                            matching Cash Return was entered on a DTR dated
                            after the purchase (a same-day return does not
                            count). Add it under Cash Returns on the DTR — or,
                            if the cash is still with the member, reopen the
                            purchase.
                          </span>
                        </div>
                        <ChevronDown
                          size={13}
                          style={{
                            color: textMuted,
                            transform: open ? "rotate(180deg)" : undefined,
                          }}
                          className="shrink-0"
                        />
                      </button>
                      {open && (
                        <div className="px-3 pb-2 max-h-56 overflow-y-auto">
                          {missing.map((l) => (
                            <div
                              key={l.id}
                              className="flex items-center justify-between gap-3 py-1 text-[11px]"
                              style={{ borderTop: `1px dashed ${border}` }}
                            >
                              <span
                                className="shrink-0 tabular-nums"
                                style={{ color: textMuted }}
                              >
                                {l.reportDate}
                              </span>
                              <span
                                className="flex-1 min-w-0 truncate"
                                style={{ color: textPrimary }}
                                title={l.description}
                              >
                                {l.description
                                  .split("|")
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                              <span
                                className="shrink-0 tabular-nums"
                                style={{ color: textMuted }}
                              >
                                receipt {fmt(l.actualAmount || 0)} of{" "}
                                {fmt(l.amount)}
                              </span>
                              <span
                                className="shrink-0 font-bold tabular-nums"
                                style={{ color: danger }}
                              >
                                return {fmt(l.refundDue || 0)}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceiptTargetFile(null);
                                    setReceiptTarget({
                                      id: l.id,
                                      date: l.reportDate || "",
                                      label: l.description
                                        .split("|")
                                        .filter(Boolean)
                                        .join(" · "),
                                      worker: l.description.includes("|")
                                        ? l.description.split("|")[0].trim()
                                        : "",
                                      detail: l.description.includes("|")
                                        ? l.description
                                            .split("|")
                                            .slice(1)
                                            .join(" ")
                                            .trim()
                                        : l.description,
                                      amount: l.refundDue || 0,
                                      given: l.amount,
                                      received: l.actualAmount || 0,
                                      ageDays: 0,
                                    });
                                  }}
                                  title="Add another receipt for the remaining amount (e.g. the toll gate receipt)"
                                  className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer"
                                  style={{
                                    color: accent,
                                    border: `1px solid ${accent}55`,
                                    backgroundColor: `${accent}12`,
                                  }}
                                >
                                  <Upload size={13} /> Add another receipt
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handlePasteForPurchase({
                                      id: l.id,
                                      date: l.reportDate || "",
                                      label: l.description
                                        .split("|")
                                        .filter(Boolean)
                                        .join(" · "),
                                      worker: l.description.includes("|")
                                        ? l.description.split("|")[0].trim()
                                        : "",
                                      detail: l.description.includes("|")
                                        ? l.description
                                            .split("|")
                                            .slice(1)
                                            .join(" ")
                                            .trim()
                                        : l.description,
                                      amount: l.refundDue || 0,
                                      given: l.amount,
                                      received: l.actualAmount || 0,
                                      ageDays: 0,
                                    })
                                  }
                                  title="Paste receipt image from clipboard"
                                  className="shrink-0 flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-md cursor-pointer"
                                  style={{
                                    color: accent,
                                    border: `1px solid ${accent}55`,
                                    backgroundColor: `${accent}12`,
                                  }}
                                >
                                  <ClipboardPaste size={13} /> Paste
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  void reopenPurchase(
                                    l.id,
                                    l.description
                                      .split("|")
                                      .filter(Boolean)
                                      .join(" · "),
                                  )
                                }
                                title="The cash was not returned — it is still with the member. Put this purchase back to pending."
                                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer"
                                style={{
                                  color: "#b45309",
                                  border: "1px solid #d9770655",
                                  backgroundColor: "#d9770612",
                                }}
                              >
                                Not returned — reopen
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}

      {/* ── RECEIPT TABLE / DAILY LOG / PURCHASES ── */}
      <div id="expense-records-table" />
      {activeTab === "expenses" && branchId && (
        <ExpenseTable
          branchName={branchName}
          search={search}
          setSearch={setSearch}
          filtered={filtered}
          totalFiltered={totalFiltered}
          handleExportExcel={handleExportExcel}
          attachingPhotoId={attachingPhotoId}
          pickPhotoFor={pickPhotoFor}
          openDetails={openDetails}
          startEdit={startEdit}
          handleDeleteRecord={handleDeleteRecord}
          canModifyRecord={canModifyRecord}
          dtrLinkedHint={dtrLinkedHint}
          setActionMenuRow={setActionMenuRow}
          setPreviewImage={setPreviewImage}
        />
      )}

      <ExpenseDetailModal
        detailRow={detailRow}
        isEditingInModal={isEditingInModal}
        setIsEditingInModal={setIsEditingInModal}
        setDetailRow={setDetailRow}
        startEditInModal={startEditInModal}
        handleDeleteRecord={handleDeleteRecord}
        canModifyRecord={canModifyRecord}
        dtrLinkedHint={dtrLinkedHint}
        setPreviewImage={setPreviewImage}
        submitReceipt={submitReceipt}
        savingReceipt={savingReceipt}
        dateRaw={dateRaw}
        setDateRaw={setDateRaw}
        dateError={dateError}
        setDateError={setDateError}
        handleDateBlur={handleDateBlur}
        latestDateStr={latestDateStr}
        form={form}
        setForm={setForm}
        branches={branches}
        allBranches={allBranches}
        suggestions={suggestions}
        noReceiptControl={noReceiptControl}
        scanPreview={scanPreview}
        setScanPreview={setScanPreview}
        uploadedReceiptUrl={uploadedReceiptUrl}
        setUploadedReceiptUrl={setUploadedReceiptUrl}
        uploadingReceipt={uploadingReceipt}
        handleModalImageUpload={handleModalImageUpload}
        handleModalPaste={handleModalPaste}
        handleModalDrop={handleModalDrop}
        modalFileInputRef={modalFileInputRef}
        modalCameraInputRef={modalCameraInputRef}
        setEditing={setEditing}
      />

      <ExpenseDuplicateModal
        modalData={duplicateModal}
        onClose={() => setDuplicateModal(null)}
        onConfirm={confirmUpdateDuplicate}
      />

      <ExpenseActionMenu
        row={actionMenuRow}
        onClose={() => setActionMenuRow(null)}
        onViewDetails={openDetails}
        onPickPhoto={pickPhotoFor}
        onEdit={startEdit}
        onDelete={(row) => void handleDeleteRecord(row)}
        canModifyRecord={canModifyRecord}
        dtrLinkedHint={dtrLinkedHint}
      />

      {/* ── Fullscreen Receipt Image Popup Modal ── */}
      <ExpenseReceiptPreview
        previewImage={previewImage}
        onClose={() => setPreviewImage(null)}
      />

    </div>
  );
}
