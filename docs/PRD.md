# Product Requirements Document (PRD)
## Project: Task & Report Utility App

### 1. Overview
A mobile-friendly, frontend-only web application designed to help users capture, track, and report on various work tasks and projects. The primary goal is to streamline the generation of weekly status reports for management, track time spent on tasks, and organize work with flexible metadata. 

### 2. Core Objectives
- Allow quick entry and tracking of tasks and projects on the go (mobile-first design).
- Track time spent on individual tasks accurately using start/pause timers.
- Categorize work flexibly (e.g., internal work, unplanned work, specific projects) to reflect reality.
- Generate formatted, easy-to-read weekly reports to share with leadership.
- Improve task clarity and goal setting using AI rewrites.
- Ensure complete data privacy and zero backend maintenance by keeping all data local to the browser.

### 3. Key Features

**A. Task Management**
- **Creation & Editing:** Quickly add tasks with rich metadata.
- **Task Timer:** Start/pause timer on each task to accurately track time spent.
- **Flexible Metadata (Tags/Labels):** Custom tags to denote type (e.g., "internal work", "unplanned work", "project A") and health status (e.g., "on track", "at risk"). Labeling must be fast and low-friction (keyboard-first quick-add, suggestions/autocomplete from existing labels, and multi-select).
- **Universal Search, Filtering & Sorting:** Fast filtering and sorting across any task field (title, description, labels/tags, stakeholders, status, dates including deadline and next checkpoint, next action, and custom metadata). The experience should support free-text search, field-specific filters, and field-based sort controls (ascending/descending).
- **Task Attributes:**
  - Description / Title
  - Next Checkpoint (Date)
  - Deadline (Date)
  - Stakeholders (List)
  - Suggested Next Action (Text)
- **AI Rewrite Assistant:** Built-in AI helper to rewrite task descriptions to improve clarity, define clear goals, and make them measurable (e.g., SMART goals).

**B. Dashboard & Views**
- **Main Dashboard:** Displays active tasks. Ability to sort and filter tasks by next checkpoint, health status, project, etc.
- **Global Filter/Sort Consistency:** The same filter/search/sort model must be reusable across task list views, dashboard widgets, and report generation screens so users get consistent results everywhere.
- **Common Context:** A settings area to define "Common Context" (corporate terminology, acronyms, team names) that the AI and report generator can use for better formatting and accuracy.

**C. Integrations & Import**
- **Jira Import:** Ability to paste Jira text/CSV or connect via a simple client-side API to import tasks quickly.

**D. Reporting & Exporting**
- **Weekly Task Report Generator:** Automatically compile active, completed, and at-risk tasks, along with time spent, into a clean weekly report format designed for manager review.
- **Export Options:** 
  - View report on-screen.
  - Export reporting via Email (using `mailto:`).
  - Export raw data via CSV data downloads.

### 4. UI/UX & Design Guidelines
- **Mobile-Optimized but Responsive:** The UI and UX must be heavily optimized for mobile devices while still working flawlessly from regular desktop browsers.
- **Above-the-Fold Priority:** Keep the most important UI elements at the top of the screen so that most of them fit without scrolling. Scrolling should be reserved mostly for less critical, infrequently used UI elements.
- **Visuals & Icons:** Use icons and other graphical UI elements where appropriate to make the interface intuitive and quick to read.
- **Animations & WebGL:** Incorporate UI animations and WebGL effects where appropriate to enhance the modern feel and fluidity of the app.
- **Urgent Event Alerts:** Use sounds, device vibrations, UI alerts, and animations to draw the user's attention when appropriate for urgent events (e.g., missed deadlines, important checkpoints).

### 5. Security & Data Privacy
- **Client-Side Encryption:** All locally stored data (tasks, time logs, settings) must be stored in an encrypted format at rest.
- **Password-Based Access:** The user's password is the exclusive key for data decryption; it must be required during the "login" phase to unlock and use the app.
- **Clear Text Export:** Authenticated users have the right to export their own data in clear text format (CSV/Email).
- **No Cloud Storage:** No user data or passwords should ever be transmitted to or stored on a remote server.

### 6. Technical Constraints
- **Platform:** Web application, fully responsive.
- **Architecture:** Client-side only (SPA). No backend server, no cloud database.
- **Storage:** All user data, tasks, and settings must be stored locally in the browser (LocalStorage or IndexedDB).
- **Hosting:** Must be deployable as static files on platforms like Netlify, Vercel, or GitHub Pages.

### 6. Future Considerations (Out of Scope for V1)
- Syncing across multiple devices (since V1 is local-storage only).
- Multi-user collaboration.