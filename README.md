# 🌬️ Ashcol Airconditioning Services - Web Portal

A professional, full-featured web portal for **Ashcol Airconditioning Corporation**. This platform streamlines service management, connecting customers with technical experts for air conditioning installation, maintenance, and repair.

---

## 🚀 Tech Stack

- **Frontend:** [React 19](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
- **Build Tool:** [Vite 8](https://vitejs.dev/)
- **Styling:** [Tailwind CSS 3](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Authentication:** Google OAuth 2.0 & JWT
- **Deployment:** [Vercel](https://vercel.com/)

## ✨ Key Features

### 👤 User Roles
- **Customers:** Book services, track ticket status, and manage their AC units.
- **Staff/Employees:** View assigned tasks, update ticket progress, and manage service details.
- **Admin/Managers:** Full system oversight, branch management, and analytics.

### 🎫 Service Management
- **Smart Ticketing System:** Create detailed service requests for Cleaning, Maintenance, Repair, or Installation.
- **Unit Tracking:** Detailed tracking of AC units including brand, HP, technology (Inverter/Non-inverter), and age.
- **Real-time Status:** Track tickets through `PENDING`, `ASSIGNED`, `IN_PROGRESS`, and `COMPLETED` states.

### 🏢 Multi-Branch Support
- Management of multiple branches including **Head Office (Makati/Taguig)**, **Pampanga**, **Bulacan**, **Rizal**, **Candelaria**, **Dasmarinas**, and **Sta. Rosa**.
- Branch-specific contact information and service handling.

### 🛡️ Security & UX
- **Google OAuth Integration:** Quick and secure login options.
- **Dark/Light Mode:** Full theme support for comfortable viewing in any environment.
- **Responsive Design:** Fully optimized for desktop, tablet, and mobile devices.

## 📁 Project Structure

- `src/pages/` - Main application views (Dashboard, Tickets, Profile, Branches, etc.)
- `src/components/` - Reusable UI components (Modals, Address Pickers, Calendar Pickers).
- `src/contexts/` - Global state management for Authentication and Theme.
- `src/data/` - Static data structures (Philippine addresses, service constants).
- `src/layouts/` - Shared UI structures like the Dashboard Layout.

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone [repository-url]
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Copy `.env.example` to `.env` (the real `.env` is not committed). Then set:
   ```env
   VITE_API_BASE_URL=http://localhost:8080/api
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   ```

4. **Run Development Server:**
   ```bash
   npm run dev
   ```

## 🏗️ Building for Production

```bash
npm run build
```
The production-ready files will be in the `dist/` directory.

---
© 2026 Ashcol Airconditioning Corporation. All rights reserved.
