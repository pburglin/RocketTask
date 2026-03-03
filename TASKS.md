# TASKS.md - Development Backlog

## Phase 1: Foundation (Current)
- [ ] Setup Tailwind CSS & Framer Motion configuration <!-- id: task_setup_styles -->
- [ ] Implement local database schema with Dexie.js (Tasks, TimeLogs, Settings) <!-- id: task_db_schema -->
- [ ] Implement Encryption Layer (Web Crypto API wrapper for AES-GCM) <!-- id: task_encryption -->
- [ ] Create Login/Authentication UI & logic (Password-based key generation) <!-- id: task_auth_ui -->

## Phase 2: Core Task Management
- [ ] Task Dashboard (Mobile-first, above-the-fold priority) <!-- id: task_dashboard -->
- [ ] Task Creation/Edit Form (Flexible metadata, tags, quick labeling UX with suggestions) <!-- id: task_form -->
- [ ] Universal Task Filter Engine (query by title, description, labels, stakeholders, status, dates, and custom fields) <!-- id: task_filter_engine -->
- [ ] Reusable Filter UI (free-text + field filters/chips, saved filter presets optional) <!-- id: task_filter_ui -->
- [ ] Task Timer (Start/Pause logic with TimeLog persistence) <!-- id: task_timer -->

## Phase 3: AI & Integrations
- [ ] AI Rewrite Integration (Client-side API calls, settings for API keys) <!-- id: task_ai_rewrite -->
- [ ] Jira Import Utility (Text/CSV parser) <!-- id: task_jira_import -->

## Phase 4: Reporting & Export
- [ ] Weekly Report Generator (Formatted summary + time stats) <!-- id: task_report_gen -->
- [ ] Apply universal filters to reports/export (same criteria as task lists/dashboard) <!-- id: task_report_filters -->
- [ ] Export via Mailto & CSV Download <!-- id: task_export -->

## Phase 5: Polish & UX
- [ ] Animations & WebGL Effects (Delightful interactions) <!-- id: task_ux_polish -->
- [ ] Sounds, Vibrations, and Urgent Alerts <!-- id: task_alerts -->
