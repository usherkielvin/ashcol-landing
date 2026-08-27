# ServiceHub Integrated FSMS: Audit & Financial Blueprint

## 1. System Overview
ServiceHub is an **Enterprise Resource Planning (ERP)** specifically designed for HVAC operations. It replaces manual paper logs and Excel-based auditing with a real-time data synchronization pipeline between the field (Expo App), the branch managers, and the executive office (React Portal).

This document outlines the blueprint for the **Daily Auditing, Profits, and Expenses** subsystem.

---

## 2. Core Modules

### Module 1: Intelligent Dispatching & Workload Management
**The "Brain" (Backend: Spring Boot | Frontend: React Dashboard)**
* **Purpose:** Automates "Manual Coordination" assignments.
* **Agentic Logic:** Uses a weighted scoring algorithm (Skill + Distance + Current Workload) to autonomously route technicians.
* **Web Portal View:** Gantt-style timeline and Live Map showing technician status.

### Module 2: Digital Work Order & Service Reporting
**The "Field Data" (Mobile: Expo Tech App | Backend: MySQL)**
* **Function:** Technicians log unit details (Brand, HP, Inverter/Non-Inverter) and job progress directly on-site.
* **Features:** High-accuracy tracking of AC brand and age, digital closure of tickets, and offline SQLite sync.

### Module 3: Daily Sales and Expenses Encoder
**The "Cash Management" (Web Portal / Manager View)**
* **Manual Source:** Digitizing the paper "Daily Sales and Expenses Report".
* **Function:** Reconciles physical cash collection, online remits, and branch expenses.
* **Features:**
  * **Cash Denomination Counter:** A UI grid to input bill quantities (1000s, 500s, etc.) that auto-calculates totals.
  * **Digital Receipts:** Managers upload receipts for Parking, Gas (e.g., "Dominic Gas Allowance"), and Food.
  * **Expense Categories:** Cash Limits (Sales), Check/Online Remits, Expenses with Receipt, and For Purchase.
  * **Auto-Calculation:** `Total Cash For Office = Total Cash Remits - Total Expenses - Total For Purchase`.

### Module 4: All-Branch Daily Audit Monitoring
**The "Finance Hub" (Frontend: React 19 Dashboard)**
* **Manual Source:** Digitizing the "All Branch Daily Audit Report Monitoring" Excel sheet.
* **Function:** Centralized dashboard providing a "traffic light" view of branch performance.
* **Key Logic:**
  * **Aggregated Sales:** Auto-sums Cash and Online collections from the daily branch reports.
  * **Quota Comparison:** Compares `Gross Sales` against `Target Daily Quota`.
  * **Traffic Light UI:** Automatically flags branches as **ABOVE QUOTA (Green)** or **BELOW QUOTA (Red)**.
  * **Expense Audit:** Pulls total payroll and purchase expenses into the "Total Expenses" column.

---

## 3. Technical Implementation Plan

### Phase 1: Database Setup (MySQL)
We will introduce new entities to capture the daily financial data and replace the manual Excel entries.

1. **`DailyBranchReport` Table**:
   * Links to `Branch`.
   * Fields: `reportDate`, `totalCashRemits`, `totalOnlineRemits`, `totalExpenses`, `totalForPurchase`, `totalCashForOffice`, `cashBreakdownJson`, `signatureUrl`.
2. **`ReportItem` Table**:
   * Links to `DailyBranchReport`.
   * Fields: `type` (CASH_SALE, ONLINE_SALE, EXPENSE, PURCHASE), `description`, `amount`.
3. **`Branch` Table Updates**:
   * Add `targetDailyQuota` and `cohPreviousDay` for baseline calculations.

### Phase 2: API Development (Spring Boot)
1. **Report Submission API**: `POST /api/v1/reports/branch-daily`
   * Accepts the digitized end-of-day branch report, calculates the totals on the backend to prevent frontend manipulation, and stores the items.
2. **Dynamic Aggregation API**: `GET /api/v1/audit/summary?date=YYYY-MM-DD`
   * Queries all `DailyBranchReport` records for a given date.
   * Joins with the `Branch` table to calculate `Difference = (Total Cash + Total Online) - Target Daily Quota`.
   * Returns a clean JSON array directly mapping to the columns required by the Audit Table.

### Phase 3: Portal UI Development (React 19 & Tailwind CSS)
1. **Daily Sales & Expenses Form**:
   * Recreates the paper form with interactive grids for cash denominations.
   * Includes a digital signature pad for the "Received By" sign-off.
2. **All-Branch Audit Dashboard**:
   * A dense, data-rich table (using Tailwind `table-auto`).
   * **Conditional Formatting**: `${diff >= 0 ? 'bg-green-500' : 'bg-red-500'}` applied to rows and the `Remarks` column.
   * **Drill-Down Capability**: Clicking on any "Total Expenses" amount opens a modal showing the individual receipts and line items submitted by the branch manager.

### Phase 4: Tech App Development (Expo)
1. **Service Report Screen**:
   * Technicians capture the initial "Before/After" photos and input the raw cash/GCash collected from the client. 
   * This raw data provides an independent verification layer against the Branch Manager's end-of-day report.
