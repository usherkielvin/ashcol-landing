# ServiceHub — Implementation Plan

> **Ashcol integration note:** The production Ashcol codebase uses **Flyway** migrations under the Spring API (`src/main/resources/db/migration/`), domain tables **`tickets`** and **UUID** keys (not the standalone `work_orders` / BIGINT sketch below). Treat sections 3–4 as conceptual; align new DDL with Flyway + Ashcol entities.

> **Stack:** Spring Boot (Backend) · React + Vite (Web Portal) · Expo (Technician & Client Apps)
> **DB:** MySQL · **AI:** Custom Scoring Agent · **Maps:** Leaflet · **Storage:** Local File Server · **Structure:** Monorepo · **Version:** 1.0 Draft

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Database Schema](#3-database-schema)
4. [Backend — Spring Boot](#4-backend--spring-boot)
5. [Web Portal — React + Vite](#5-web-portal--react--vite)
6. [Expo Technician App](#6-expo-technician-app)
7. [Expo Client App](#7-expo-client-app)
8. [Directory Structure](#8-directory-structure)
9. [Dependencies & Packages](#9-dependencies--packages)
10. [Implementation Phases](#10-implementation-phases)
11. [Open Questions](#11-open-questions)

---

## 1. Project Overview

ServiceHub bridges field operations with intelligent dispatching for HVAC/AC service companies. The system replaces manual coordination with an agentic AI that assigns technicians, tracks inventory, forecasts maintenance, and exposes real-time status to all stakeholders.

### Research Objectives Addressed
| SOP | Objective | System Module |
|-----|-----------|---------------|
| SOP #2.1 | Intelligent Dispatching | Agentic Scoring Engine |
| SOP #2.2 | Real-time Inventory Sync | Inventory Management System |
| SOP #4 | Manual vs. AI Efficiency | Analytics / KPI Dashboard |
| Maintenance | Automated Forecasting | Cron Job + AC Unit Profiles |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────┐
│                  CLIENT LAYER                    │
│  React Web Portal  │  Expo Tech App  │  Expo     │
│  (Admin/Manager)   │  (Technician)   │  Client   │
└────────┬──────────────────┬──────────────┬───────┘
         │    REST / WS     │              │
┌────────▼──────────────────▼──────────────▼───────┐
│              Spring Boot API Gateway              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────┐  │
│  │  Dispatch   │  │  Inventory   │  │Analytics│  │
│  │  Service    │  │  Service     │  │Service  │  │
│  └──────┬──────┘  └──────┬───────┘  └────┬────┘  │
│  ┌──────▼──────────────────▼─────────────▼────┐  │
│  │           Agentic AI Scoring Engine         │  │
│  └─────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────┐  │
│  │         MySQL Database (Centralized)        │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
         │
┌────────▼───────────────┐
│  Firebase Cloud        │
│  Messaging (Push Notif)│
└────────────────────────┘
```

---

## 3. Database Schema

### 3.1 Core Tables

```sql
-- Branches
CREATE TABLE branches (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  branch_name   VARCHAR(100) NOT NULL,
  address       VARCHAR(255),
  latitude      DECIMAL(10, 8),
  longitude     DECIMAL(11, 8),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Technicians
CREATE TABLE technicians (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id         BIGINT NOT NULL,
  branch_id       BIGINT REFERENCES branches(id),
  current_lat     DECIMAL(10, 8),
  current_lng     DECIMAL(11, 8),
  last_ping       TIMESTAMP,
  is_active       BOOLEAN DEFAULT TRUE,
  skills          JSON,        -- ["Inverter Specialist", "Refrigerant Certified"]
  active_tickets  INT DEFAULT 0
);

-- Clients
CREATE TABLE clients (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  full_name   VARCHAR(150),
  email       VARCHAR(100) UNIQUE,
  phone       VARCHAR(20),
  address     VARCHAR(255),
  latitude    DECIMAL(10, 8),
  longitude   DECIMAL(11, 8)
);

-- AC Units (per client)
CREATE TABLE ac_units (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  client_id         BIGINT REFERENCES clients(id),
  brand             VARCHAR(100),
  horsepower        DECIMAL(4,2),
  unit_type         VARCHAR(50),   -- Inverter, Window, Cassette
  last_cleaned_date DATE,
  installation_date DATE,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Work / Service Tickets
CREATE TABLE work_orders (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  client_id       BIGINT REFERENCES clients(id),
  ac_unit_id      BIGINT REFERENCES ac_units(id),
  branch_id       BIGINT REFERENCES branches(id),
  technician_id   BIGINT REFERENCES technicians(id),
  service_type    ENUM('Cleaning','Repair','Installation','Inspection'),
  status          ENUM('PENDING','ASSIGNED','EN_ROUTE','IN_PROGRESS','COMPLETED','CANCELLED'),
  priority        ENUM('LOW','MEDIUM','HIGH','EMERGENCY'),
  description     TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_at     TIMESTAMP,
  completed_at    TIMESTAMP,
  before_photo    VARCHAR(255),
  after_photo     VARCHAR(255),
  match_score     DECIMAL(5,2)     -- Score from AI engine at assignment time
);
```

### 3.2 Inventory Tables (SOP #2.2)

```sql
-- Master Parts Catalog
CREATE TABLE parts_inventory (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  part_name     VARCHAR(150) NOT NULL,
  part_number   VARCHAR(100) UNIQUE NOT NULL,
  category      ENUM('Capacitor','Refrigerant','Compressor','Filter','Fan Motor','Other'),
  unit_price    DECIMAL(10,2),
  description   TEXT
);

-- Stock per Branch
CREATE TABLE branch_stock (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
  branch_id           BIGINT REFERENCES branches(id),
  part_id             BIGINT REFERENCES parts_inventory(id),
  quantity_available  INT NOT NULL DEFAULT 0,
  reorder_level       INT NOT NULL DEFAULT 5,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch_part (branch_id, part_id)
);

-- Parts Used Per Ticket
CREATE TABLE work_order_parts (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  work_order_id   BIGINT REFERENCES work_orders(id),
  part_id         BIGINT REFERENCES parts_inventory(id),
  quantity_used   INT NOT NULL,
  recorded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Part Requests (from tech → branch manager)
CREATE TABLE part_requests (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  work_order_id   BIGINT REFERENCES work_orders(id),
  part_id         BIGINT REFERENCES parts_inventory(id),
  quantity_needed INT,
  status          ENUM('PENDING','APPROVED','DENIED','FULFILLED'),
  requested_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Backend — Spring Boot

### 4.1 Project Structure

```
servicehub-backend/
├── src/main/java/com/servicehub/
│   ├── config/
│   │   ├── SecurityConfig.java
│   │   └── WebSocketConfig.java
│   ├── controller/
│   │   ├── InventoryController.java
│   │   ├── DispatchController.java
│   │   ├── TechnicianController.java
│   │   ├── WorkOrderController.java
│   │   └── AnalyticsController.java
│   ├── service/
│   │   ├── AgentScoringService.java     ← AI Agent
│   │   ├── InventoryService.java
│   │   ├── DispatchService.java
│   │   ├── NotificationService.java
│   │   └── MaintenanceCronService.java  ← Cron Job
│   ├── repository/
│   ├── model/
│   └── dto/
└── src/main/resources/
    └── application.yml
```

### 4.2 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/inventory/branch/{id}` | Fetch stock levels for a branch |
| `GET` | `/api/inventory/low-stock/{branchId}` | Items below reorder level |
| `POST` | `/api/inventory/deduct` | Decrement stock on job COMPLETED |
| `POST` | `/api/dispatch/auto-assign` | Trigger Agentic AI to assign pending tickets |
| `GET` | `/api/dispatch/score/{ticketId}` | View match scores for a ticket |
| `PATCH` | `/api/technician/location` | Update GPS from Expo background task |
| `GET` | `/api/technician/active/{branchId}` | All active techs with last ping |
| `GET` | `/api/analytics/efficiency` | SOP #4 KPI data |
| `GET` | `/api/analytics/dispatch-time` | Avg time from PENDING → ASSIGNED |
| `POST` | `/api/workorders` | Create new ticket |
| `PATCH` | `/api/workorders/{id}/status` | Update ticket status |
| `POST` | `/api/parts/request` | Tech requests part from branch |
| `GET` | `/api/units/due-cleaning` | Units overdue for cleaning |

### 4.3 Agentic Scoring Engine

**Formula:**
```
Score = (SkillWeight × SkillMatch)
      + (ProximityWeight × NormalizedDistance)
      - (WorkloadWeight × ActiveTickets)
```

**`AgentScoringService.java` Logic:**
```java
// Pseudocode
public double calculateScore(Technician tech, WorkOrder ticket) {
    // 1. Skill Match (Boolean → 1.0 or 0.0)
    boolean skillMatch = tech.getSkills().contains(ticket.getRequiredSkill());
    double skillScore = skillMatch ? 1.0 : 0.0;

    // 2. Distance via Haversine Formula
    double distance = haversine(
        tech.getCurrentLat(), tech.getCurrentLng(),
        ticket.getClientLat(), ticket.getClientLng()
    );
    double proximityScore = 1.0 / (1.0 + distance); // Normalized inverse

    // 3. Workload Penalty
    double workloadPenalty = tech.getActiveTickets() > 3
        ? tech.getActiveTickets() * 10.0
        : tech.getActiveTickets() * 2.0;

    return (40 * skillScore) + (40 * proximityScore) - (20 * workloadPenalty / 100);
}

// Haversine Formula
private double haversine(double lat1, double lon1, double lat2, double lon2) {
    final int R = 6371; // Earth radius km
    double dLat = Math.toRadians(lat2 - lat1);
    double dLon = Math.toRadians(lon2 - lon1);
    double a = Math.sin(dLat/2) * Math.sin(dLat/2)
             + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
             * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

**Auto-Assignment Flow:**
```
Ticket Created (PENDING)
    ↓
ClusterByBranchID
    ↓
Fetch Active Technicians in Branch
    ↓
Calculate Score for Each Tech
    ↓
Best Score > 85 threshold?
  YES → Status: ASSIGNED → Send FCM Push Notification
  NO  → Flag for Manual Review → Notify Coordinator
```

### 4.4 Inventory Deduction Logic

Triggered automatically when a `WorkOrder.status` transitions to `COMPLETED`:

```java
// In WorkOrderService.java
@Transactional
public void completeWorkOrder(Long workOrderId) {
    WorkOrder order = workOrderRepo.findById(workOrderId).orElseThrow();
    order.setStatus(COMPLETED);
    order.setCompletedAt(LocalDateTime.now());

    // Deduct parts used
    List<WorkOrderPart> parts = workOrderPartsRepo.findByWorkOrderId(workOrderId);
    for (WorkOrderPart part : parts) {
        BranchStock stock = branchStockRepo.findByBranchAndPart(
            order.getBranchId(), part.getPartId()
        );
        stock.setQuantityAvailable(stock.getQuantityAvailable() - part.getQuantityUsed());
        branchStockRepo.save(stock);

        // Trigger low stock alert if below reorder level
        if (stock.getQuantityAvailable() < stock.getReorderLevel()) {
            notificationService.alertLowStock(stock);
        }
    }
    workOrderRepo.save(order);
}
```

### 4.5 Maintenance Forecasting Cron Job

```java
@Component
public class MaintenanceCronService {

    @Scheduled(cron = "0 0 8 * * *") // Every day at 8:00 AM
    public void scanUnitsForCleaning() {
        LocalDate sixMonthsAgo = LocalDate.now().minusMonths(6);
        List<AcUnit> overdueUnits = acUnitRepo.findUnitsNotCleanedSince(sixMonthsAgo);

        for (AcUnit unit : overdueUnits) {
            // Avoid duplicate pending tickets
            boolean alreadyPending = workOrderRepo.existsPendingCleaningFor(unit.getId());
            if (!alreadyPending) {
                WorkOrder ticket = new WorkOrder();
                ticket.setAcUnitId(unit.getId());
                ticket.setClientId(unit.getClientId());
                ticket.setServiceType(ServiceType.Cleaning);
                ticket.setStatus(Status.PENDING);
                ticket.setDescription("Automated: Unit overdue for cleaning (6+ months).");
                workOrderRepo.save(ticket);

                // Notify client
                notificationService.sendClientAlert(unit.getClientId(),
                    "Your AC unit is due for cleaning. Tap to confirm a schedule.");
            }
        }
    }
}
```

---

## 5. Web Portal — React + Vite

### 5.1 Directory Structure

```
servicehub-web/
├── public/
├── src/
│   ├── components/
│   │   ├── Inventory/
│   │   │   ├── StockTable.tsx          ← Color-coded low stock alerts
│   │   │   ├── ReorderForm.tsx
│   │   │   └── PartRequestQueue.tsx
│   │   ├── Dispatch/
│   │   │   ├── TechnicianMap.tsx       ← Leaflet/Mapbox live map
│   │   │   ├── TicketQueue.tsx
│   │   │   └── ScoreCard.tsx           ← AI match score visualizer
│   │   ├── Analytics/
│   │   │   ├── KPICard.tsx
│   │   │   ├── DispatchTimeChart.tsx
│   │   │   └── ResolutionRateChart.tsx
│   │   └── ui/
│   │       ├── Badge.tsx
│   │       ├── DataTable.tsx
│   │       └── StatusPill.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── InventoryPage.tsx
│   │   ├── DispatchPage.tsx
│   │   ├── AnalyticsPage.tsx
│   │   └── WorkOrdersPage.tsx
│   ├── services/
│   │   ├── aiService.ts                ← Visualize AI decisions
│   │   ├── inventoryService.ts
│   │   └── analyticsService.ts
│   ├── hooks/
│   │   ├── useTechnicianLocations.ts   ← WebSocket polling for GPS
│   │   └── useLowStockAlerts.ts
│   └── App.tsx
```

### 5.2 Branch Inventory Dashboard (`StockTable.tsx`)

**Color-Coding Rules:**
| Condition | Color | Badge |
|-----------|-------|-------|
| `qty > reorder_level * 2` | Green | `IN STOCK` |
| `qty > 0 && qty <= reorder_level` | Amber | `LOW STOCK` |
| `qty === 0` | Red | `OUT OF STOCK` |

### 5.3 Analytics KPIs (SOP #4)

```ts
// src/services/analyticsService.ts
export interface EfficiencyMetrics {
  avgDispatchTimeMinutes: number;   // createdAt → assignedAt
  resolutionRate: number;           // completedTickets / totalTickets * 100
  avgCompletionTimeHours: number;   // assignedAt → completedAt
  technicianUtilizationRate: number;
}
```

**Charts to implement:**
- `DispatchTimeChart` — Bar chart: AI-assigned vs. manually-assigned dispatch times
- `ResolutionRateChart` — Donut: Completed / Cancelled / Pending
- `TechnicianLoadChart` — Horizontal bar: Active tickets per tech

### 5.4 Real-Time Technician Map

- **Library:** `react-leaflet` + `leaflet` ✅ *(decided)*
- **Markers:** Green dot = Active (ping < 5 min), Grey dot = Inactive
- **Updates:** Poll `GET /api/technician/active/{branchId}` every 30s via `useTechnicianLocations` hook
- **Popup on click:** Name, skills, active tickets, last ping time

---

## 6. Expo Technician App

### 6.1 Key Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Dashboard | `/tech/dashboard` | Active tickets, today's schedule |
| Ticket Detail | `/tech/ticket/:id` | Full job info, before/after photos |
| Inventory Request | `/tech/parts-request` | Request missing parts from branch |
| Navigation | `/tech/navigate/:id` | Opens Google Maps deep link |
| Offline Sync | Auto (background) | Stores actions when offline |

### 6.2 Offline Data Persistence (`useOfflineSync.ts`)

```ts
// src/hooks/useOfflineSync.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const QUEUE_KEY = 'offline_action_queue';

export interface OfflineAction {
  id: string;
  type: 'CLOCK_IN' | 'STATUS_UPDATE' | 'PHOTO_UPLOAD' | 'PARTS_USED';
  payload: Record<string, unknown>;
  timestamp: string;        // ISO string — timestamped at capture
  synced: boolean;
}

export function useOfflineSync() {
  const enqueue = async (action: Omit<OfflineAction, 'id' | 'synced'>) => {
    const queue = await getQueue();
    const newAction: OfflineAction = {
      ...action,
      id: Date.now().toString(),
      synced: false,
    };
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, newAction]));
  };

  const syncPending = async () => {
    const state = await NetInfo.fetch();
    if (!state.isConnected) return;

    const queue = await getQueue();
    const pending = queue.filter(a => !a.synced);

    for (const action of pending) {
      try {
        await uploadAction(action);          // POST to Spring Boot
        action.synced = true;
      } catch (e) {
        console.warn('Sync failed for action', action.id);
      }
    }
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  };

  const getQueue = async (): Promise<OfflineAction[]> => {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  };

  return { enqueue, syncPending };
}
```

**When to sync:** Listen to `NetInfo.addEventListener` — auto-trigger `syncPending()` when network is restored.

### 6.3 GPS Background Task

```ts
// Runs as Expo background task every 5 minutes
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

const LOCATION_TASK = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const { latitude, longitude } = locations[0].coords;

  await fetch('/api/technician/location', {
    method: 'PATCH',
    body: JSON.stringify({ latitude, longitude }),
    headers: { 'Content-Type': 'application/json' }
  });
});
```

### 6.4 Before/After Photo + Offline Storage

- Capture photos via `expo-image-picker`
- If offline: store base64 in AsyncStorage queue with `type: 'PHOTO_UPLOAD'`
- On sync: upload to Spring Boot → store on **local file server** (`/uploads/photos/`) ✅ *(decided — migrate to cloud later if needed)*

### 6.5 Google Maps Navigation Deep Link

```ts
const openNavigation = (destLat: number, destLng: number) => {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;
  Linking.openURL(url);
};
```

---

## 7. Expo Client App

### 7.1 Key Screens

| Screen | Route | Description |
|--------|-------|-------------|
| My Units | `/client/units` | List of AC units with last cleaned date |
| Add Unit | `/client/units/add` | Register brand, HP, type |
| Service History | `/client/history` | Past tickets |
| Live ETA | `/client/track/:id` | Live progress bar + tech location map |
| Notifications | `/client/alerts` | Maintenance alerts, ETA updates |

### 7.2 Unit Profile Schema

```ts
interface AcUnit {
  id: string;
  brand: string;           // e.g., "Daikin"
  horsepower: number;      // e.g., 1.5
  unitType: 'Inverter' | 'Window' | 'Cassette' | 'Ceiling' | 'Floor';
  lastCleanedDate: string; // ISO date
  installationDate: string;
  warrantyExpiry?: string;
}
```

### 7.3 Live ETA Progress Bar

**States (in order):**
```
[●]─────────────────────────────────────────
Request Received → Assigned → En Route → Job Started → Completed
```

- `EN_ROUTE` state: Show live mini-map with technician's GPS pin moving toward client
- WebSocket or 30s polling on `GET /api/workorders/{id}/status`

---

## 8. Directory Structure

### Complete Monorepo Layout

```
servicehub/                          ← Monorepo root ✅
├── backend/                         ← Spring Boot
│   └── src/main/java/com/servicehub/
│       ├── controller/
│       ├── service/
│       │   └── AgentScoringService.java
│       ├── repository/
│       ├── model/
│       ├── dto/
│       ├── cron/
│       │   └── MaintenanceCronService.java
│       └── uploads/photos/          ← Local photo storage ✅
│
├── web/                             ← React + Vite Admin Portal
│   └── src/
│       ├── components/
│       │   ├── Inventory/
│       │   ├── Dispatch/
│       │   └── Analytics/
│       ├── services/
│       │   └── aiService.ts
│       ├── hooks/
│       └── pages/
│
├── tech-app/                        ← Expo Technician App
│   └── src/
│       ├── components/
│       ├── hooks/
│       │   └── useOfflineSync.ts
│       └── screens/
│
├── client-app/                      ← Expo Client App
│   └── src/
│       ├── components/
│       └── screens/
│
└── shared/                          ← Shared TypeScript types & utils ✅
    ├── types/
    │   ├── WorkOrder.ts
    │   ├── AcUnit.ts
    │   ├── Technician.ts
    │   └── Inventory.ts
    └── utils/
        └── dateHelpers.ts           ← date-fns wrappers
```

---

## 9. Dependencies & Packages

### Spring Boot (`pom.xml`)
```xml
<!-- Spring Data JPA, Web, Security -->
<!-- MySQL Connector -->
<!-- Spring Boot Scheduler (built-in @Scheduled) -->
<!-- Firebase Admin SDK (FCM push notifications) -->
<!-- Lombok -->
```

### React Web Portal (`web/package.json`)
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "vite": "^6.0.0",
    "lucide-react": "^0.400.0",
    "date-fns": "^3.0.0",
    "react-leaflet": "^4.2.1",
    "leaflet": "^1.9.4",
    "@types/leaflet": "^1.9.0",
    "recharts": "^2.12.0",
    "axios": "^1.7.0",
    "@tanstack/react-query": "^5.0.0"
  }
}
```

### Expo Apps (shared)
```json
{
  "dependencies": {
    "expo": "~54.0.0",
    "expo-location": "~18.0.0",
    "expo-task-manager": "~12.0.0",
    "expo-image-picker": "~17.0.0",
    "@react-native-community/netinfo": "^11.0.0",
    "@react-native-async-storage/async-storage": "^2.0.0",
    "date-fns": "^3.0.0",
    "lucide-react-native": "^1.8.0"
  }
}
```

---

## 10. Implementation Phases

### Phase 1 — Foundation (Weeks 1–2)
- [ ] MySQL schema: all tables created and seeded with test data
- [ ] Spring Boot project scaffold: entities, repositories, DTOs
- [ ] Auth: JWT-based login for Admin, Technician, Client roles
- [ ] Base CRUD endpoints for WorkOrders, Branches, Technicians

### Phase 2 — Inventory System (Weeks 3–4)
- [ ] `branch_stock` and `work_order_parts` endpoints
- [ ] Deduction logic on job COMPLETED event
- [ ] Low-stock alert notification (FCM)
- [ ] React Portal: `StockTable` with color-coded badges
- [ ] Expo Tech: Part request screen → `part_requests` table

### Phase 3 — Agentic Dispatch (Weeks 5–6)
- [ ] `AgentScoringService` with Haversine + scoring formula
- [ ] `POST /api/dispatch/auto-assign` endpoint
- [ ] Auto-assignment threshold logic (Score > 85)
- [ ] FCM push notification on assignment
- [ ] React Portal: `TicketQueue` + `ScoreCard` visualizer

### Phase 4 — Real-Time & Maps (Weeks 7–8)
- [ ] Expo Tech: Background GPS task → `PATCH /api/technician/location`
- [ ] React Portal: Leaflet map with live tech markers
- [ ] Expo Client: Live ETA progress bar + mini-map
- [ ] WebSocket or polling for status updates

### Phase 5 — Offline & Photos (Weeks 9–10)
- [ ] `useOfflineSync` hook in Expo Tech app
- [ ] Before/After photo capture + offline queue
- [ ] Auto-sync on network restore
- [ ] Spring Boot: accept and store photo uploads

### Phase 6 — Analytics & Cron (Weeks 11–12)
- [ ] `MaintenanceCronService` — daily AC unit scan
- [ ] `GET /api/analytics/efficiency` with all KPI data
- [ ] React Portal: Analytics page with charts
- [ ] SOP #4: Manual vs. AI dispatch comparison report

### Phase 7 — Polish & Testing (Weeks 13–14)
- [ ] Unit tests: scoring algorithm, deduction logic, cron job
- [ ] Integration tests: dispatch flow end-to-end
- [ ] UI polish on all three apps
- [ ] Documentation and API spec (Swagger/OpenAPI)

---

## 11. Open Questions

| # | Question | Status | Decision |
|---|----------|--------|----------|
| 1 | Monorepo vs. separate repos? | ✅ Resolved | **Monorepo** — single root with `backend/`, `web/`, `tech-app/`, `client-app/`, `shared/` |
| 2 | Push notifications: Firebase FCM or OneSignal? | ⏳ Open | — |
| 3 | Map provider: Leaflet or Mapbox? | ✅ Resolved | **Leaflet** (free, no API key needed) |
| 4 | Photo storage: local or cloud? | ✅ Resolved | **Local file server** for now (`/uploads/photos/`) — migrate to S3 later |
| 5 | AI score threshold for auto-assignment? (currently 85) | ⏳ Open | — |
| 6 | Client app: Expo or separate React Native? | ⏳ Open | — |
| 7 | Can technicians be reassigned cross-branch for emergencies? | ⏳ Open | — |

---

*Last updated: May 2026 — ServiceHub v1.0 Implementation Plan*
