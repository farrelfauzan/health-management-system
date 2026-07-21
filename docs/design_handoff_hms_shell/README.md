# Handoff: Saling Jaga HMS — Sidebar Shell, Dashboard, Data Tables & Settings

## Overview
Responsive layout for the Saling Jaga Health Management System admin console: collapsible sidebar nav, top header, a Dashboard with stat cards + activity lists, six data-table screens (Admin Users, Patients, Doctors, Appointments, Registration, Pharmacy), and a new Settings screen for language selection (English / English+Bahasa Indonesia bilingual labels).

## About the Design Files
The bundled HTML file (`Saling Jaga HMS.dc.html`) is a **design reference**, not production code — it's a static prototype built to show layout, spacing, color, and interaction intent. Do not copy its markup or inline styles directly into the app.

Target codebase: `apps/web` — Next.js 16 App Router, React 19, Tailwind 4, TanStack Query, shadcn/ui (`components.json` present), path aliases `#components/*` `#hooks/*` `#lib/*`. Recreate this design using that stack:
- Sidebar/header/table shell → new components under `components/server` (layout, static) and `components/client` (interactive: sidebar collapse, tab switching, language setting).
- Tailwind utility classes instead of inline styles; extract repeated values (colors, radii) as Tailwind theme tokens if not already present.
- Real data via the generated Orval/TanStack Query hooks against `apps/api` endpoints (`admin-management`, `patient-management` modules exist; doctor/appointment/registration/pharmacy modules are still pending per AGENTS.md — use their planned shapes, or mock until built).
- RBAC visibility (nav items, action buttons) via `lib/rbac` CASL checks, mirroring backend permissions (`patient.read`, etc.) — visual-only, backend guard is source of truth.

## Fidelity
**High-fidelity.** Colors, spacing, type sizes, and copy in the HTML are final; recreate pixel-for-pixel using Tailwind + shadcn primitives (Table, Select, Input, Button, Badge) rather than hand-rolled equivalents.

## Screens / Views

### 1. App Shell (persistent across all screens)
- Root layout: `flex`, `height: 100vh`, font `'Space Grotesk', 'Segoe UI', sans-serif`, page background `#eef5fb`, text color `#0f2a43`.
- **Sidebar** (`aside`): width `236px` expanded / `76px` collapsed (animate width 0.18s ease). Background `linear-gradient(180deg, #0c4a6e 0%, #0a3d5c 100%)`, text white.
  - Brand row: 34×34 rounded-9px badge `#38bdf8` bg, `#0c4a6e` text, "SJ"; brand name "Saling Jaga" 16px/700 + "HEALTH MANAGEMENT" 10.5px uppercase `#9cc6e0` letter-spacing 0.08em. Collapse toggle button (28×28, rounded 6px, icon swaps between a "panel-left-open"/"panel-left-close" square+arrow icon), hover bg `rgba(255,255,255,0.12)`.
  - Nav list, 8 items each: Dashboard, Admin Users, Patients, Doctors, Appointments, Registration, Pharmacy, **Settings** (new). Each row: 9px 12px padding, 8px radius, 18px lucide icon + label (14px/600) + Indonesian subtitle (11px, `#86b6d4`) shown under the label when bilingual language is active. Active row bg `rgba(255,255,255,0.16)`, text `#ffffff`; inactive text `#c8e0f0`; hover bg `rgba(255,255,255,0.1)`.
  - **Profile block** (bottom): 32×32 circle avatar `#7dd3fc` bg / `#0c4a6e` text ("AN" initials), directly followed by name (13px/600, "Aditya Nugraha") + role (11px, `#9cc6e0`, "Super Admin") — avatar and name/role must sit flush together with a small gap (10px), left-aligned, never split apart with space-between (that was a bug we fixed — keep them adjacent).
  - When collapsed: labels hidden, nav items and profile center horizontally, brand row stacks to column.
- **Header** (sticky top, in main content): page title (20px/700) + Indonesian subtitle (12px, `#5b7690`) on the left; bell icon, current date, and a clinic-name pill (`#e0f2fe` bg / `#0369a1` text, 999px radius) on the right. Background `rgba(255,255,255,0.85)` with `backdrop-filter: blur(8px)`, bottom border `#d7e7f5`.

### 2. Dashboard
- 4-up stat card grid (`repeat(auto-fit, minmax(200px,1fr))`, gap 16px): Active Patients, Appointments Today, Pending Registrations, Low-stock Medications. Each card: white bg, 1px `#d7e7f5` border, 14px radius, 18/20px padding; label (12px/600 uppercase `#5b7690`) + 30×30 icon badge (`#e0f2fe` bg, `#0284c7` icon) top row; big number (30px/700) below; helper line (12px, green/amber/red per status).
- Below: 2-col grid (`minmax(340px,1fr)`, gap 20px) — "Today's Appointments" table card (time/patient/doctor/status columns) on the left with a "View all" link, "Recent Registrations" list card on the right (name/timestamp + status pill per row).

### 3. Data table screens (Admin Users, Patients, Doctors, Appointments, Registration)
Each follows the same composition:
- **Filter/toolbar card**: white, 1px `#d7e7f5` border, 14px radius, 16/20px padding, flex-wrap row of labeled inputs (search with left icon, selects, date pickers) + Apply/Reset buttons + a primary "Create/New …" button pinned right (`margin-left: auto`), `#0284c7` bg (or `#0c4a6e` for Admin Users' Create User).
- **Table card**: separate white card below (18px gap from the toolbar), 1px border, 14px radius, header row `#f3f9fe` bg with 11.5px/700 uppercase `#5b7690` labels, data rows 13.5px, hover bg `#f8fbfe`, footer with "Page X of Y · N total" + Previous/Next buttons.
  - **Column sizing (important — this was the composition bug we fixed):** use `minmax(min, fr)` tracks per column, not fixed `fr`/px + a large `min-width` on the row — the earlier version forced tables wider than their card, clipping the last 1–2 columns with no visible scrollbar. Long-text cells (email, name, doctor list, specialty, schedule, reason) need `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` (Tailwind: `truncate`) so they degrade gracefully instead of blowing out the grid. Only fall back to horizontal scroll on very narrow (phone) widths.
  - Status/role values render as pill badges: 3px 10px padding, 999px radius, 11.5px/600, bg/fg pairs — active `#dbeafe`/`#1d4ed8`, inactive `#e2e8f0`/`#475569`, scheduled `#e0f2fe`/`#0369a1`, completed `#dcfce7`/`#15803d`, cancelled `#fee2e2`/`#b91c1c`, pending/low-stock `#fef3c7`/`#a16207`, out-of-stock/error `#fee2e2`/`#b91c1c`.
  - Row action (right-aligned, `justify-self: end`): icon + label, 13px/600, colored `#0369a1` (View/Edit/Open/Dispense/Schedule) or `#b91c1c` (Cancel).

### 4. Pharmacy
Two-column grid: "Medication Stock" table (name/code/stock/unit/status, stock number colored by threshold) with an inline search input in its own header; right column stacks "Pending Prescriptions" (patient/rx-no/items/status/dispense action) and "Recent Dispenses" list cards.

### 5. Settings (new)
Single centered card (max-width 560px): "Language" title + helper copy, then two selectable radio-style rows:
- **English** — "Show all labels in English only"
- **English & Bahasa Indonesia** — "Show Indonesian translation below each label" (default/current selection)

Each row: 14/16px padding, 10px radius, 1.5px border (selected: `#0284c7` border + `#f0f9ff` bg; unselected: `#d7e7f5` border + white bg), 18×18 radio circle (filled 9px dot `#0284c7` when selected) + label (14px/600) + description (12px, `#5b7690`). Clicking a row switches the whole app's language mode — this replaces the old dev-only "showIndonesian" design toggle with a real, user-facing settings control.

## Interactions & Behavior
- Sidebar collapse: toggle button flips `collapsed` boolean; width, label visibility, and alignment all react.
- Nav click: switches the active screen (client-side tab state in the prototype — in the real app this should be actual route navigation, e.g. `/admin/dashboard`, `/admin/users`, `/admin/patients`, `/admin/doctors`, `/admin/appointments`, `/admin/registrations`, `/admin/pharmacy`, `/admin/settings`).
- Language setting: selecting a row in Settings updates language state; nav labels and page-title subtitles immediately show/hide their Indonesian line. Persist this preference (user profile field or `localStorage`) rather than resetting on reload.
- Hover states throughout: subtle bg tint on nav rows, table rows, buttons, icon buttons.
- No loading/error/empty states are designed yet — ask before building screens for those, or default to your design system's existing patterns (skeleton rows for tables, standard empty-state card).

## State Management
- `activeScreen` (route-driven in production).
- `sidebarCollapsed` (boolean, local UI state, fine in `localStorage`).
- `language` ("english" | "bilingual") — should live wherever user/account preferences are stored server-side if this needs to persist across devices; otherwise `localStorage`.
- Table data/filters/pagination per screen come from TanStack Query hooks generated by Orval against the real API — no state management needed beyond query params (search, role/status filters, page).

## Design Tokens
- **Colors:** page bg `#eef5fb`; sidebar gradient `#0c4a6e → #0a3d5c`; card bg `#ffffff`; card border `#d7e7f5`; body text `#0f2a43`; secondary text `#5b7690`; sidebar secondary text `#9cc6e0` / `#86b6d4` / `#c8e0f0`; accent blue `#0284c7` (hover `#0369a1`); table header bg `#f3f9fe`; row hover `#f8fbfe`; row border `#eef5fb`. Status pill pairs listed above.
- **Typography:** Space Grotesk (already loaded via `--font-space-grotesk` in this repo), weights 400/500/600/700. Page title 20px/700, section title 15px/700, stat number 30px/700, body 13.5–14px, label/caption 11–12px (often uppercase, letter-spacing 0.08–0.12em).
- **Radius:** cards/tables 14px, buttons/inputs 8px, pills 999px, icon badges 6–9px, avatars 50%.
- **Spacing:** page padding 28px/32px, card padding 16–20px, grid/flex gaps 12–24px.

## Assets
Lucide-style inline SVG icons only (dashboard grid, users, user-circle, stethoscope, calendar, clipboard, pill, bell, search, plus, edit/pencil, eye, x-circle, external-link, settings gear, chevrons). No raster images or logos to source — swap the "SJ" badge for a real logo asset if/when available.

## Files
- `Saling Jaga HMS.dc.html` — full interactive prototype (all screens + Settings + language switch + sidebar collapse) in this bundle.
