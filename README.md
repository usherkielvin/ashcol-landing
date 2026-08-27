# ❄️ ASHCOL PORTAL — Enterprise Web Operations Platform

> **Proprietary & Confidential**  
> *Production Operations & Enterprise Service Management Platform for **Ashcol Airconditioning Corporation**.*

---

## 📌 Overview

**ASHCOL PORTAL** is the central digital operating system for Ashcol Airconditioning Corporation. It unifies field dispatch, multi-branch HVAC service coordination, installer logistics, warranty registration, customer ticketing, and operational finance into an interconnected, real-time web platform.

Designed for high reliability and multi-branch scalability, the platform coordinates nationwide branch operations across **Taguig (Sales & Services)**, **Calauan**, **Silang**, **Dasmarinas**, **Pampanga**, **Bulacan**, **Rizal**, and **Candelaria**.

---

## ⚡ Core Operational Capabilities

### 1. 📋 Service Relays & Smart Ticketing
- **Live Ticket Lifecycle**: Full tracking across Intake, Scheduled, Dispatched, In-Progress, and Completed workflows.
- **Multi-Service Handling**: Native support for Survey & Installation, Cleaning/PMS, Checkup, Repair, Backjob, Dismantling, and Mounting.
- **Store & Dealer Management**: Searchable store catalog with strict duplicate prevention and encoded-by audit trails.
- **Warranty Registration**: Direct integration linking installation tickets with warranty activation records.

### 2. 🚛 Line-Up & Field Logistics Planner
- **Fleet Dispatch Engine**: Vehicle trip planner mapping drivers, service technicians, and route districts.
- **Smart Roster Derivation**: Dynamic employee resolution extracting technician rosters scoped strictly to their respective branches.
- **One-Click Showcase & Exports**: High-definition presentation modal and instant PDF schedule generation for daily field briefings.

### 3. 📦 Permanent Historical Archives
- **Immutable Service Records**: Protected audit logs capturing completed installations and repairs with zero accidental data loss.
- **Multi-Status Backfilling**: Automatic aggregation of all completed service types, collection details, and mode of payments.
- **Granular Branch Filtering**: Instant lookup across active and historical monthly accounting periods.

### 4. 👥 Workforce & Enterprise Operations
- **Branch Scope Isolation**: Strict segregation between commercial Sales departments and technical Services divisions.
- **Integrated Operations Forms**: Digital intake for surveys, repair authorizations, and client satisfaction certificates.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for Administrators, Branch Managers, Officers-in-Charge (OIC), Coordinators, and Technicians.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [React 19](https://react.dev/) with [TypeScript 5](https://www.typescriptlang.org/) |
| **Build System** | [Vite 8](https://vitejs.dev/) with SWC compiler optimization |
| **Styling & Design System** | Tailored Modern Glassmorphism & High-Contrast Dark/Light Themes via [Tailwind CSS](https://tailwindcss.com/) |
| **Iconography** | [Lucide React](https://lucide.dev/) |
| **Security & Auth** | JWT Authentication, Enterprise RBAC & Google Identity Services |
| **Data Synchronization** | Multi-tier Local Cache + Broadcast Channels for cross-tab realtime updates |
| **Document Generation** | [jsPDF](https://github.com/parallax/jsPDF) & [jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable) |

---

## 🔒 Security & Data Integrity

- **Environment Protection**: All sensitive endpoints, API secrets, and encryption keys are isolated in secure production environment stores.
- **Sanitized Data Pipelines**: Strict input validation and text sanitization against script injection and formatting corruption.
- **Audit Trails**: Real-time user attribution on all critical actions (record encoding, schedule modifications, and status transitions).

---

## 🚀 Deployment & Operations

### Build Pipeline
```bash
# Install dependencies
npm ci

# Type-check and produce optimized production bundle
npm run build
```

The production bundle is compiled into `/dist` with tree-shaking, vendor chunking, and asset minification.

---

## 🏢 Enterprise Support & Licensing

This software and associated documentation files are the proprietary and confidential property of **Ashcol Airconditioning Corporation**. Unauthorized copying, distribution, or commercial use without prior written consent is strictly prohibited.

*© 2026 Ashcol Airconditioning Corporation. All Rights Reserved.*
