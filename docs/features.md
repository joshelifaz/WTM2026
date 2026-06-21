# Features — Backlog חי

> עדכון אחרון: 2026-06-20 · ענף נוכחי: `chore/security-rules-hardening`

| ID | Feature Name | Priority | Status | Branch |
|----|-------------|----------|--------|--------|
| F-001 | Firebase Infrastructure Setup | P0 | Done | `feat/infrastructure-firebase-setup` |
| F-002 | MudLog UI Redesign | P0 | Done | `feat/mudlog-ui-redesign` |
| F-003 | Settings & Logo Fix | P1 | Done | `feat/settings-and-logo-fix` |
| F-004 | Hybrid Schedule Base (לוח תזונה) | P0 | Done | `feat/hybrid-schedule-base` |
| F-005 | Live Updates Infrastructure (גלריה + העלאה) | P0 | Done | `feat/live-update-infrastructure` |
| F-006 | Viewer-Friendly Dashboard | P1 | Done | `feat/viewer-friendly-dashboard` |
| F-007 | Admin Gallery Verification | P1 | Done | `feat/admin-gallery-verification` |
| F-008 | Admin Viewer Preview | P2 | Done | `feat/admin-viewer-preview` |
| F-009 | Cheer Board (לוח עידוד) | P1 | Done | `feat/cheer-board` |
| F-010 | Super Admin Access Logs | P2 | Done | `feat/super-admin-logs` |
| F-011 | Time Triggers (התראות סביבתיות) | P1 | Done | `feat/time-triggers` |
| F-012 | Offline Resilience (תור פעולות מרוץ) | P1 | Done | `feat/offline-resilience` |
| F-013 | Security Rules (Database) | P0 | Done | `chore/security-rules` |
| F-014 | Mobile Photo Upload Fix | P1 | Done | `fix/mobile-photo-upload` |
| F-015 | Auth Lifecycle Race Condition Fix | P0 | Done | `fix/auth-lifecycle-race-condition` |
| F-016 | Auth Listener Decoupling | P1 | Done | `fix/auth-listener-decoupling` |
| F-017 | Admin UID Production Fix | P0 | Done | `fix/admin-uid-production` |
| F-018 | Menu UX Polishing | P2 | Done | `chore/menu-ux-polishing` |
| F-019 | Gallery Lightbox + Download | P1 | In Progress | `feat/gallery-ux-enhancements` |
| F-020 | Storage Rules Hardening | P1 | In Progress | `chore/security-rules-hardening` |
| F-021 | PWA / Service Worker (offline מלא) | P3 | Backlog | — |
| F-022 | Gallery Swipe Navigation (בתוך Lightbox) | P3 | Backlog | — |
| F-023 | Push Notifications (טריגרים / עדכונים) | P3 | Backlog | — |

---

## פירוט ענף נוכחי (F-020)

**Storage Rules Hardening** — `chore/security-rules-hardening`

- [x] קריאה רק למשתמשים מחוברים (`request.auth != null`)
- [x] כתיבה/מחיקה ל-Super Admin UID + מיילי Admin מורשים
- [x] ולידציה: מקסימום 1MB, `contentType` חייב להיות `image/*`
- [ ] Deploy ל-Production (`firebase deploy --only storage`)
- [ ] Merge ל-`main`

---

## סטטוסים

| Status | משמעות |
|--------|--------|
| **Backlog** | מתוכנן, לא התחיל |
| **In Progress** | בעבודה / בענף פעיל |
| **Done** | ממומש ומוזג (או יציב ב-main) |
