# Testing Framework, Test Data Isolation & Security Guide

This document outlines the testing architecture, data segregation mechanisms, and security hardening implemented for the **Gurudev Books Store**.

---

## 1. Core Architecture & Highlights

| Feature | Production Behavior | Test / Sandbox Behavior |
| :--- | :--- | :--- |
| **Inventory Stock** | Decrements `books.stock_quantity` automatically | **Stock is NEVER altered** (preserved at 100%) |
| **Admin Stats** | Calculates real revenue ("Total Lakshmi") & order count | **Test orders are EXCLUDED** from production financials |
| **Public Tracking** | Shows genuine dispatch status & masked delivery destination | **Test orders are completely HIDDEN** from real customers |
| **Admin Dashboard** | Defaults to **📦 Real Orders** view | Test orders tagged with `[🧪 TEST ORDER]` badge |
| **Order Cleanup** | Protected by RLS | One-click **"Purge Test Orders"** button in admin dashboard |
| **Email Alerts** | Normal dispatch alert to admin | Prefixed with `[TEST ORDER - DO NOT DISPATCH]` |
| **Public Nav Security**| "Admin" link removed from customer header | Discreet "Staff Login" in footer; direct `/admin.html` |
| **PII & XSS Safety** | All inputs HTML-escaped (`escapeHtml`); addresses masked | Protected against stored XSS and PII harvesting |

---

## 2. Running the Testing Framework

### Method A: In-Browser Test Suite (Live Hosted Link or Local)
Open `test-runner.html` in your browser:
```
https://<your-live-link>.vercel.app/test-runner.html
```
- **One-Click Execution**: Click **"Run All Tests"** to execute all 26+ automated assertions in under 20ms right in your browser.
- **Visual Diagnostics**: Displays pass/fail status, execution time, and error traces.
- **Live Database Smoke Test**: Performs a non-destructive connectivity check against your live Supabase instance and checks schema compatibility.

### Method B: Terminal / CLI Runner (Node.js)
From your terminal inside the project directory:
```bash
npm test
```
*(or run directly with `node tests/run-tests.js`)*

All 26 tests across 4 suites run with zero external `npm` dependencies:
1. `tests/shipping.test.js`: India Post Pune courier tariffs, packaging weights, Maharashtra vs Other States slabs, and Goa postal prefix routing.
2. `tests/cart.test.js`: Shopping cart state, pricing totals, and stock limits.
3. `tests/security.test.js`: XSS script payload neutralization, PII masking, phone and PIN validation.
4. `tests/isolation.test.js`: Database stock preservation, public tracking isolation, and revenue exclusion.

---

## 3. How to Test on the Hosted Live Link

### Placing a Safe Test Order
1. Go to the checkout page with the test flag:
   ```
   https://<your-live-link>.vercel.app/checkout.html?test=1
   ```
2. You will see an amber banner: **"🧪 Test Mode Active"**.
3. Click **"Prefill Test Devotee"**:
   - Automatically fills sample devotee address details.
   - Automatically generates a synthetic test payment receipt image (no need to upload files or send real UPI money).
4. Click **"Place Order"**:
   - The order is created with `is_test: true`.
   - **Book inventory is NOT decremented**.
   - Admin notification email will clearly state: `[TEST ORDER - DO NOT DISPATCH]`.

---

## 4. Admin Dashboard Data Isolation

Open `/admin.html`:
1. **Data Scope Bar**:
   - **📦 Real Orders (Default)**: Shows only genuine customer orders. "Total Lakshmi" and total order counters reflect 100% real revenue.
   - **🧪 Test Orders Only**: Displays test orders for verification and debugging.
   - **All Orders**: Displays both combined.
2. **Visual Indicators**: Test order cards have a dashed amber border and a `🧪 TEST ORDER` badge.
3. **Purge Test Orders**: Click the red **"Purge Test Orders"** button to permanently delete test orders from the database in one click without touching real customer orders.

---

## 5. Security Hardening Details

1. **Customer Navigation Cleanup**:
   - The **"Admin"** button has been removed from the public navigation bar on `index.html`, `cart.html`, `checkout.html`, and `track.html`.
   - A subtle **"Staff Login"** link is placed in the footer, accessible via `/admin.html`.
2. **Stored & DOM XSS Prevention (`js/security.js`)**:
   - All customer-supplied inputs (`customer_name`, `address`, `phone`, `tracking_number`, `tracking_link`) are sanitized via `escapeHtml()` before rendering into the DOM in `admin.js` and `track.js`.
   - Malicious payloads such as `<script>`, `<img src=x onerror=...>`, and `<iframe...>` are safely converted into HTML entities.
3. **Customer PII Masking on Public Order Tracking (`js/track.js`)**:
   - Street and flat numbers are masked (e.g. `•••••••• | Pune, Maharashtra | 411038`).
   - Phone numbers are validated strictly (10-digit Indian mobile numbers).
   - Test orders are filtered out from public phone lookups so internal tests are never visible to real buyers.

---

## 6. Supabase Database Migration

To apply the database updates to your Supabase project:
1. Open your **[Supabase Dashboard](https://supabase.com/dashboard)**.
2. Select your project: `gurudev-books`.
3. Open the **SQL Editor** on the left sidebar.
4. Copy and paste the contents of [`MIGRATION_TESTING_FRAMEWORK.sql`](file:///Users/aroraji/Desktop/Desktop/Guru%20Maharaja%20Seva%20-%20CODE/Gurudev%20books/MIGRATION_TESTING_FRAMEWORK.sql).
5. Click **Run**.

This adds the `is_test` column, updates the stock management triggers, grants admin delete policies, and sets up the `delete_all_test_orders()` RPC function.
