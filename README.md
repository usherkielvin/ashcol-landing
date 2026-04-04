# Web Portal - Capstone Project

A modern web portal built for air conditioning service and management. This project serves as a comprehensive platform for handling service tickets, managing staff and customers, and tracking activities across various AC brands.

## 🚀 Tech Stack

- **Frontend Framework:** [React](https://react.dev/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Deployment:** [Vercel](https://vercel.com/)

## ✨ Key Features

- **Authentication System:** Secure login, registration, password recovery, and profile management.
- **Dashboard:** Overview of system activities and metrics.
- **Ticket Management:** Create, view, and manage service tickets.
- **User Management:** 
  - **Staff/Employees:** Manage employee profiles and assignments.
  - **Customers:** Handle customer information and service history.
- **Activity Tracking:** Monitor system events and updates.
- **Multi-Brand Support:** Dedicated assets and support for major AC brands (Daikin, Carrier, LG, Panasonic, Samsung, etc.).

## 📁 Project Structure

- `src/pages/` & `src/(web)/` - Application routes and views (Dashboard, Tickets, Login, etc.)
- `src/components/` - Reusable UI components (Modals, Pickers, etc.)
- `src/contexts/` - Global state management (Auth, Theme)
- `src/assets/` - Static files including brand logos and system imagery
- `src/assets/raw/` - Source/original images kept for reference
- `src/data/` - Static data like Philippine address structures
- `src/utils/` - API configurations and utility functions
- `scripts/` - One-off maintenance and refactor scripts
- `workspace/` - Local editor workspace files

## 🛠️ Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the required configuration values
4. Start the development server:
   ```bash
   npm run dev
   ```

### Building for Production

To create a production build:
```bash
npm run build
```

The output will be generated in the `dist/` directory.
