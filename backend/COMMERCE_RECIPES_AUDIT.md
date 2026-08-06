# EATSIE Commerce Recipes Audit

This document maps the current commerce architecture, identifies existing capabilities and files to reuse, and outlines key gaps to avoid duplicate work.

---

## 1. Recipe Status Overview

### **Multi-Region**: `NOT_CONFIGURED`
* **Status Details**: Exactly 1 region configured (Canada, CAD). There is no secondary region configured (e.g., USA, USD), and 16 product variants are missing CAD prices.
* **Blocker**: Fewer than 2 usable regions exist.

### **OMS**: `PARTIAL`
* **Status Details**: Vendor order splitting, basic vendor order workflows, and fulfillment workflows are partially implemented under `src/workflows/split-order-workflow.ts` and `src/api/vendor/orders/`. However, advanced centralized OMS order views, allocation snapshotted records, returns, refunds, exchanges, SLA monitoring, and exception statuses are incomplete or unverified.

### **POS**: `PARTIAL`
* **Status Details**: POS sales channel script exists and links stock locations. The backend possesses endpoint files under `src/api/store/pos` (orders, cash payment, barcode, inventory-sync, quick-checkout) and the frontend has dashboard components under `frontend/src/pages/pos`. However, shift/session management, full catalog checkout, payment variance tracking, and in-store returns/receipt verification are unverified/partially missing.

### **Omnichannel**: `PARTIAL`
* **Status Details**: Storefront exists and POS Sales Channel exists. A specialized `omnichannel/sync-cart` cart-merging endpoint is created to synchronize offline/mobile cart sessions with active web sessions. Syncing inventory/reservations per channel and cross-channel return flows are missing or unverified.

---

## 2. Key Files to Reuse

### **Multi-Region**
* `backend/src/scripts/audit-multi-region.ts` — Checks regions, payment providers, and variant price gaps.
* `backend/src/scripts/ensure-default-region.ts` — Ensures default region is initialized.
* `backend/src/scripts/fix-region.ts` — Fixes default region configuration.

### **OMS**
* `backend/src/workflows/split-order-workflow.ts` — Splits unified customer orders into individual vendor orders.
* `backend/src/workflows/create-vendor-fulfillment.ts` — Workflow for executing vendor fulfillments.
* `backend/src/workflows/record-commission-workflow.ts` — Calculates and writes commissions.
* `backend/src/api/vendor/orders/route.ts` & child routes — Vendor order operations.

### **POS**
* `backend/src/scripts/setup-pos-channel.ts` — Automates the creation of the POS Sales Channel and links it to existing stock locations.
* `backend/src/api/store/pos/_utils.ts` — Validation, mapping, inventory deduction, and receipt compilation.
* `backend/src/api/store/pos/orders/route.ts` — Retrieval and creation of POS orders.
* `backend/src/api/store/pos/quick-checkout/route.ts` — Direct checkout without complex cart setups.
* `backend/src/workflows/pos-instant-fulfillment.ts` — Workflow performing instant cash capture, fulfillment creation, and manual inventory adjustments.
* `frontend/src/redux/posSlice.js` — Client state slice for cashier operations.
* `frontend/src/services/posApi.js` — Client API hooks for accessing `/api/store/pos/*`.

### **Omnichannel**
* `backend/src/api/store/omnichannel/sync-cart/route.ts` — Cart merger that processes offline/mobile cart elements and synchronizes them with web sessions.

---

## 3. Key Gaps & Target Actions

### **Multi-Region**
* **Gap**: Need a second region (USA, USD, ISO US).
* **Gap**: 16 variant price gaps for CAD, and missing USD prices for all variants.
* **Target**: Configure USA region, write price audit/repair script, ensure storefront updates cart region cleanly.

### **OMS**
* **Gap**: No formal transaction-safe allocations or allocation snapshot records.
* **Gap**: Returns/refunds with commission reversal and inventory restocks are incomplete.
* **Gap**: Centralized OMS admin view in dashboard with filters for channel, region, vendor, and SLA exceptions is not implemented.
* **Target**: Build allocation snapshot schema/records, implement return/refund logic, expose centralized admin routes.

### **POS**
* **Gap**: Staff/Cashier authorization checks are not fully restricted.
* **Gap**: No shift/session management (cash drawer tracking, closing count, variance).
* **Gap**: Cart totals are not fully validated against region/currency/taxes.
* **Target**: Implement shift/session state, restrict cashier permissions, and complete POS returns/refunds.

### **Omnichannel**
* **Gap**: Centralized customer history across channels (POS + Storefront) is missing.
* **Gap**: Unified inventory availability engine taking reservations and safety stock into account is missing.
* **Target**: Build channel inventory availability helper, link storefront/POS order profiles to unified customer profile.
