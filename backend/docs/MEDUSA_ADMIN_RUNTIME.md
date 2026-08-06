# Medusa Admin Runtime — Operations Guide

## Quick Reference

| Purpose                    | Command                                       |
|----------------------------|-----------------------------------------------|
| Development (hot reload)   | `npm run dev`                                 |
| Development (PowerShell launcher) | `npm run dev:ps`                     |
| Development (clean start)  | `npm run dev:ps:clean`                        |
| Kill port 9000             | `npm run kill:9000`                           |
| Stable Admin (no Vite HMR) | `npm run admin:stable`                        |
| Stable Admin (rebuild)     | `npm run admin:stable:rebuild`                |
| Stable Admin (clean build) | `npm run admin:stable:clean`                  |
| TypeScript check           | `npx.cmd tsc --noEmit --pretty false`         |
| Build only                 | `npm run build`                               |
| Health check               | `GET http://localhost:9000/health`            |
| Admin URL (always)         | `http://localhost:9000/app`                   |

---

## Mode 1: Development Mode

**Command:** `npm run dev`  
**Underlying command:** `medusa develop` (via `scripts/start-dev.js`)

### What it does
- Starts the Medusa backend on port 9000
- Starts the Admin Vite dev server as a child process
- Vite watches source files and enables hot module replacement (HMR)
- TypeScript is compiled on-demand

### Ephemeral Vite port behavior

> **This is expected behavior, not a bug.**

When `medusa develop` starts, the Medusa Admin Vite child process binds to a **random ephemeral port** (e.g., 55091, 26497). This port changes on every restart.

**The stable Admin URL is always:**  
```
http://localhost:9000/app
```

**Never navigate directly to `http://localhost:<ephemeral-port>/`.**

The Medusa backend at port 9000 proxies the Admin bundle and serves it. The ephemeral port is only used internally by Vite for HMR WebSocket messages.

### After a backend restart

When the Node.js backend restarts:
1. The Vite child process gets a **new ephemeral port**
2. The browser's cached HMR WebSocket URL points to the **old port**
3. The browser console shows: `[vite] server connection lost. Polling for restart...`
4. Requests to the old port fail with `ERR_CONNECTION_REFUSED`

**Fix:** Do a **hard reload** on the stable Admin URL:
```
Ctrl+Shift+R  →  http://localhost:9000/app/usa-price-approval
```

This discards the cached HMR URL and loads the fresh bundle with the new port.

### Development launcher with safety checks

```powershell
# Basic start
npm run dev:ps

# Clean generated build output before starting (.medusa only)
npm run dev:ps:clean
```

Or run the PowerShell script directly:
```powershell
.\scripts\start-medusa-dev.ps1
.\scripts\start-medusa-dev.ps1 -Clean
```

The launcher:
- Validates `.env`, `node_modules`, and `package.json`
- Checks whether port 9000 is occupied
- Identifies whether the occupying process is a Medusa/Node process
- **Refuses to kill unrelated processes** (e.g., other apps, editors)
- Optionally removes only `.medusa` generated output
- Prints the stable Admin URL
- Never prints or depends on the ephemeral Vite port

---

## Mode 2: Stable Admin Mode

Stable Admin mode runs without any ephemeral Vite HMR ports by pre-building Admin assets. It supports two modes depending on Redis availability:

### Real Stable Mode (Production)
**Command:** `npm run admin:stable`  
**Underlying command:** `medusa build` → `medusa start`  
- Requires a configured and reachable `REDIS_URL` in `.env` (or environment).
- Performs a preflight TCP check to verify Redis connectivity before booting.
- Fails clearly if Redis is missing or unreachable.
- Recommended for all live pricing approvals and production data operations.

### Local Stable Mode
**Command:** `npm run admin:stable:local`  
**Underlying command:** `medusa build` → `EATSIE_ALLOW_FAKE_REDIS=true EATSIE_RUNTIME_MODE=local-stable medusa start`  
- Allows Medusa's in-memory local fake Redis when a real Redis server is unavailable.
- Displays a prominent warning banner.
- Still serves pre-built assets on port 9000 with zero Vite HMR polling.

### Quick Start Commands

```bash
# Real Stable Mode (with Redis)
npm run admin:stable
npm run admin:stable:rebuild
npm run admin:stable:clean

# Local Stable Mode (no Redis, fake Redis allowed)
npm run admin:stable:local
npm run admin:stable:local:rebuild
npm run admin:stable:local:clean
```

### Redis Connectivity Checks
If real stable mode fails, test your Redis server status using:

**Windows PowerShell:**
```powershell
Test-NetConnection localhost -Port 6379
```

**Bash / macOS / Linux:**
```bash
nc -zv localhost 6379
```

> **Warning:** Local fake Redis mode (`admin:stable:local`) is not suitable for production, multi-process setups, reliable event/job handling, or distributed background workflows. Use real Redis for production environments.

---

## Health Check

```bash
curl http://localhost:9000/health
# → {"status":"ok","timestamp":"...","uptime":...}
```

The Admin page classifies errors into distinct states:

| Health result | Admin 401 | Admin behavior |
|---|---|---|
| ❌ Unreachable | — | **Backend connection lost** — all actions disabled |
| ✅ 200 | ✅ 401 | **Session expired** — login prompt shown |
| ✅ 200 | ✅ 200 | **Normal operation** |
| ✅ 200 | ✅ 5xx | **Server error** — check backend logs |

---

## Session Management

### Valid session
- `GET /admin/users/me → 200`
- `GET /admin/feature-flags → 200`
- `GET /admin/usa-price-review → 200`

### Expired session
 
The page shows:
> **Session Expired.** Your Admin session has expired. Please sign in again.
 
Actions:
- Click **Go to Login** → redirects to `/app/login` (preserving `/app/usa-price-approval` in `sessionStorage.eatsie_admin_return_path`).
- After successful login, you will land on the default dashboard where the global `EatsieRedirectionWidget` intercepts the path, validates it (same-origin `/app/*` only), redirects you back to USA Price Approval, and clears the path.
- Or click **Retry (I just logged in)** if you logged in via a different tab.

### Manual Browser Recovery & Cache Cleanup

If you recently switched between development mode (`npm run dev`) and stable mode (`npm run admin:stable:local`), your browser might contain a cached version of the development `index.html` referencing active Vite HMR ports (e.g. `21445`, `55091`, etc.).

Follow these one-time recovery steps to clean up:
1. Stop all running Medusa or Node processes.
2. Start the stable mode: `npm run admin:stable:local`.
3. Open Chrome DevTools (F12) → **Application** tab → **Storage** (on the left menu).
4. Click **Clear site data** (to flush the cached service workers, local/session storage, and cache storage for `http://localhost:9000`).
5. Close all old localhost Admin browser tabs.
6. Open a fresh tab and navigate to: `http://localhost:9000/app`.
7. Log in again.
8. Navigate to: `http://localhost:9000/app/usa-price-approval`.
9. Verify in the DevTools console that no Vite connection attempts or requests to ephemeral ports appear.

### How sessions work
 
Medusa Admin uses **HTTP-only cookies** set during login. The session is valid for the configured JWT expiry. Do not mix `localhost` and `127.0.0.1` — cookies are domain-specific.
 
---
 
## Clearing Stale Admin Session
 
If the Admin shows 401 after you know you are logged in:
 
1. Open DevTools → Application → Cookies → `localhost`
2. Delete any `medusa_session` cookies
3. Navigate to: `http://localhost:9000/app` (port 9000)
4. Log in fresh
 
Do not mix `localhost` with `127.0.0.1` — they have separate cookie jars.

---

## Multiple Backend Processes

Running two `medusa develop` processes causes port conflicts (`EADDRINUSE`).

**Detect:**
```powershell
Get-Process node | Format-List Id, ProcessName, MainWindowTitle
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 9000 }
```

**Stop Medusa-owned port 9000 process safely:**
```bash
npm run kill:9000
```

This only stops the process owning port 9000. It does not kill other Node processes.

---

## USA Price Approval — Connection Safety Rules

All Save, Validate, Dry Run, and Import buttons are **automatically disabled** when:

- Backend is unreachable (connection refused)
- Admin session is expired (HTTP 401)
- Backend returns a server error (HTTP 5xx)

**Unsaved edits are preserved** during connection loss — they exist in React state and are not lost when the banner appears.

### Import additional guards

Live import additionally requires:
- At least one `APPROVED` row
- A meaningful approval note (not the generic placeholder)
- Validate completed with zero errors
- Dry Run completed successfully
- Explicit body: `{ "confirm": "IMPORT_APPROVED_USD_PRICES" }`

---

## Current Approved Row Status

As of the last verified session:

| Field | Value |
|---|---|
| Total rows in CSV | 64 |
| APPROVED rows | 1 (`variant_01KVN02PMQNA2VAB5Z7RZ4HW9X`) |
| Proposed USD | `$9.00` |
| Approval note | `Merchant USD price required` ⚠️ **(generic — will fail validate)** |
| Product | `Final 1782042414` (handle: `final-1782042414-mqnq1lpn`) |
| Merchant confirmation | **Required before import** |
| Live import executed | ✅ `false` |
| Business data writes | ✅ `0` |

To proceed with import, the approval note must be changed from the placeholder to a meaningful merchant approval note.

---

## File Reference

| File | Purpose |
|---|---|
| `scripts/start-dev.js` | Development launcher (cross-platform Node.js) |
| `scripts/start-medusa-dev.ps1` | Windows PowerShell development launcher with safety checks |
| `scripts/start-stable.js` | Stable Admin launcher (build + medusa start) |
| `scripts/kill-port-9000.ps1` | Safely stops the process using port 9000 |
| `scripts/patch-medusa-dev-watcher.js` | Chokidar patch to suppress upload-triggered restarts |
| `src/admin/routes/usa-price-approval/page.tsx` | USA Price Approval Admin page |
| `src/api/admin/usa-price-review/` | Backend API endpoints |
| `src/api/admin/usa-price-review/lib/csv-helpers.ts` | CSV helpers and mutex |
| `reports/usa-missing-usd-price-review.csv` | Price review CSV (persisted state) |
