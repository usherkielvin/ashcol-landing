# Global Search - UI Preview

## 🎨 Visual Guide

This document shows what the Global Search feature looks like in the ASHCOL Portal.

---

## 1️⃣ Search Bar (Initial State)

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 🔍  Search customer name, ticket number, branch, store...   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Location:** Top of Overview Dashboard  
**Visible to:** Admin and Manager roles only

---

## 2️⃣ Search Bar (Active/Typing)

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 🔍  Juan Santos                                    ⏳  ✕    │ │ ← Blue border
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Blue border when focused
- Loading spinner (⏳) while searching
- Clear button (✕) to reset

---

## 3️⃣ Search Results Dropdown

```
┌────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 🔍  Juan Santos                                         ✕    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Filter: [Tickets (3)] [Service Reports (2)] Clear filters   │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │                                                              │ │
│  │  📄  Juan Santos                              [COMPLETED]   │ │
│  │      🎫 TKT-12345    🏢 Robinsons Tagum                     │ │
│  │      🔧 Installation  👷 Mario Reyes                        │ │
│  │      View Details →                                         │ │
│  │                                                              │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │                                                              │ │
│  │  🔧  Juan Santos                              [IN PROGRESS] │ │
│  │      📋 CTL-67890    🏢 SM Davao                            │ │
│  │      🔧 Repair       👷 Pedro Cruz                          │ │
│  │      View Details →                                         │ │
│  │                                                              │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │                                                              │ │
│  │  📄  Maria Santos                             [PENDING]     │ │
│  │      🎫 TKT-54321    🏢 Robinsons Tagum                     │ │
│  │      🔧 Cleaning     👷 Not assigned                        │ │
│  │      View Details →                                         │ │
│  │                                                              │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │              Showing 3 results                               │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Filter chips at top
- Color-coded status badges
- Icons for different types
- Hover effect on each result
- Result count at bottom

---

## 4️⃣ Detail Modal (Full View)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  📄  Ticket Details                                          ✕   │  │
│  │      TKT-12345                                                    │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────┐   │  │
│  │  │ 👤 Customer Information │  │ 🔧 Service Information      │   │  │
│  │  │                         │  │                             │   │  │
│  │  │ Name:                   │  │ Service Type:               │   │  │
│  │  │ Juan Santos             │  │ Installation                │   │  │
│  │  │                         │  │                             │   │  │
│  │  │ Contact:                │  │ Status:                     │   │  │
│  │  │ 📞 0917 123 4567        │  │ [COMPLETED]                 │   │  │
│  │  │                         │  │                             │   │  │
│  │  │ Address:                │  │ Branch:                     │   │  │
│  │  │ 📍 123 Main St,         │  │ 🏢 Robinsons Tagum          │   │  │
│  │  │    Tagum City           │  │                             │   │  │
│  │  │                         │  │ Store/Account:              │   │  │
│  │  │ District:               │  │ Robinsons Appliances        │   │  │
│  │  │ Tagum City              │  │                             │   │  │
│  │  │                         │  │ Assigned Technician:        │   │  │
│  │  └─────────────────────────┘  │ 👷 Mario Reyes              │   │  │
│  │                                └─────────────────────────────┘   │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────┐   │  │
│  │  │ 🌡️ Unit Details         │  │ 💰 Payment Information      │   │  │
│  │  │                         │  │                             │   │  │
│  │  │ AC Type / Brand:        │  │ Amount Charged:             │   │  │
│  │  │ Daikin Split Type       │  │ ₱15,000.00                  │   │  │
│  │  │                         │  │                             │   │  │
│  │  │ Serial Number:          │  │ Payment Status:             │   │  │
│  │  │ DKN-2024-12345          │  │ PAID                        │   │  │
│  │  │                         │  │                             │   │  │
│  │  │ Quantity:               │  │                             │   │  │
│  │  │ 1                       │  │                             │   │  │
│  │  └─────────────────────────┘  └─────────────────────────────┘   │  │
│  │                                                                   │  │
│  │  ┌───────────────────────────────────────────────────────────┐   │  │
│  │  │ ⚠️ Remarks / Notes                                        │   │  │
│  │  │                                                           │   │  │
│  │  │ Customer requested installation on Saturday morning.      │   │  │
│  │  │ Unit installed successfully. Customer satisfied.          │   │  │
│  │  └───────────────────────────────────────────────────────────┘   │  │
│  │                                                                   │  │
│  │  ┌───────────────────────────────────────────────────────────┐   │  │
│  │  │ 📅 Service History                                        │   │  │
│  │  │                                                           │   │  │
│  │  │  📄  Ticket created                                       │   │  │
│  │  │  │   May 20, 2026, 9:30 AM                               │   │  │
│  │  │  │                                                        │   │  │
│  │  │  👷  Assigned to Mario Reyes                             │   │  │
│  │  │  │   May 20, 2026, 10:15 AM                              │   │  │
│  │  │  │                                                        │   │  │
│  │  │  ⏰  Service started                                      │   │  │
│  │  │  │   May 21, 2026, 8:00 AM                               │   │  │
│  │  │  │                                                        │   │  │
│  │  │  ✅  Service completed                                    │   │  │
│  │  │      May 21, 2026, 11:30 AM                              │   │  │
│  │  └───────────────────────────────────────────────────────────┘   │  │
│  │                                                                   │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │  Last updated: May 21, 2026, 11:30 AM          [Close]           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Organized sections with icons
- Grid layout for information
- Timeline with visual indicators
- Clickable phone numbers
- Close button

---

## 5️⃣ Empty State (No Results)

```
┌────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 🔍  Nonexistent Customer                                ✕    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │                          🔍                                  │ │
│  │                                                              │ │
│  │              No matching records found                       │ │
│  │                                                              │ │
│  │        Try different keywords or check spelling              │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 6️⃣ Loading State

```
┌────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 🔍  Juan                                           ⏳  ✕    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │                          ⏳                                  │ │
│  │                                                              │ │
│  │                      Searching...                            │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 7️⃣ Filtered Results

```
┌────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 🔍  Installation                                        ✕    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Filter: [Tickets (5)] [Service Reports (8)] Clear filters   │ │ ← Active filter
│  ├──────────────────────────────────────────────────────────────┤ │
│  │                                                              │ │
│  │  🔧  Juan Santos                              [COMPLETED]   │ │
│  │      📋 CTL-11111    🏢 Robinsons Tagum                     │ │
│  │      🔧 Installation  👷 Mario Reyes                        │ │
│  │      View Details →                                         │ │
│  │                                                              │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │  ... (more service reports)                                 │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │              Showing 8 results (filtered)                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Color Scheme

### Status Colors
- **🟢 Green (#10B981)** - Completed
- **🔵 Blue (#3B82F6)** - In Progress / Assigned
- **🟡 Yellow (#F59E0B)** - Pending
- **🔴 Red (#EF4444)** - Cancelled
- **⚪ Gray (#94a3b8)** - Other

### UI Colors (Light Theme)
- **Background:** White (#ffffff)
- **Border:** Light Gray (#e2e8f0)
- **Text Primary:** Dark Blue (#0f172a)
- **Text Muted:** Gray (#64748b)
- **Input Background:** Very Light Gray (#f8fafc)

### UI Colors (Dark Theme)
- **Background:** Dark Blue (#0A1120)
- **Border:** Dark Gray (#1E2D48)
- **Text Primary:** Light Blue (#F0F6FF)
- **Text Muted:** Medium Blue (#7A95B8)
- **Input Background:** Dark Blue (#0F1A2E)

---

## 📱 Mobile View

```
┌─────────────────────────┐
│                         │
│  ┌───────────────────┐  │
│  │ 🔍  Search...  ✕ │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ Filter:           │  │
│  │ [Tickets (3)]     │  │
│  │ [Services (2)]    │  │
│  ├───────────────────┤  │
│  │                   │  │
│  │ 📄 Juan Santos    │  │
│  │    [COMPLETED]    │  │
│  │ 🎫 TKT-12345      │  │
│  │ 🏢 Robinsons      │  │
│  │ View Details →    │  │
│  │                   │  │
│  ├───────────────────┤  │
│  │ ... more results  │  │
│  └───────────────────┘  │
│                         │
└─────────────────────────┘
```

**Features:**
- Stacked layout
- Touch-friendly buttons
- Swipe to close modal
- Responsive grid

---

## 💡 Interactive Elements

### Hover Effects
- **Search bar:** Border changes to blue
- **Result cards:** Background changes to light gray/dark blue
- **Buttons:** Slight scale increase
- **Links:** Underline appears

### Click Actions
- **Search bar:** Focus and show cursor
- **Clear button (✕):** Clear search and close dropdown
- **Filter chips:** Toggle filter on/off
- **Result card:** Open detail modal
- **Phone number:** Open phone dialer
- **Close button:** Close modal
- **Outside click:** Close dropdown/modal

---

## 🎯 Key UI Features

1. **Instant Feedback**
   - Loading spinner appears immediately
   - Results update in real-time
   - Smooth animations

2. **Clear Visual Hierarchy**
   - Icons for quick recognition
   - Color-coded status badges
   - Organized sections

3. **Accessibility**
   - High contrast colors
   - Clear labels
   - Keyboard navigation support

4. **Professional Design**
   - Clean, modern interface
   - Consistent spacing
   - Rounded corners
   - Subtle shadows

---

## 📸 Screenshot Locations

When the feature is deployed, screenshots should be taken of:
1. Search bar (empty state)
2. Search bar (with results)
3. Filter chips in action
4. Detail modal (full view)
5. Mobile view
6. Dark theme view

---

**Note:** This is a text-based preview. Actual UI includes smooth animations, hover effects, and interactive elements that enhance the user experience.

For a live demo, log in to the ASHCOL Portal as an Admin or Manager and navigate to the Dashboard.
