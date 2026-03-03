# Architecture & Tech Stack Document

## 1. Architecture Overview
The Task & Report Utility is designed as a **Single Page Application (SPA)** with a completely serverless architecture. All application logic runs in the user's browser, and all user data is stored entirely on the local device. This ensures maximum privacy, offline capability, and zero backend hosting costs.

### Security & Data Privacy
- **Encryption at Rest:** All local stored data must be kept in an encrypted format.
- **Authentication/Decryption:** The user's password during login is used as the key to decrypt and use the data within the app.
- **Clear Text Export:** Only logged-in (authenticated) users can export their data in clear text (e.g., via CSV or email).

## 2. Tech Stack Recommendations (For Review)
Since the app needs to be easily deployed to Netlify and run entirely in the browser, the following stack is recommended:

- **Frontend Framework:** React (via Vite) or Vue.js. (React is highly recommended for rich ecosystem).
- **Styling:** Tailwind CSS (for rapid, responsive, mobile-first UI development).
- **Animation & Effects:** Framer Motion (for UI animations) and Three.js/React Three Fiber (if WebGL effects are used for specific delightful interactions or alerts).
- **State Management & Storage:**
  - **IndexedDB wrapper:** `Dexie.js` or `localForage` (better than LocalStorage for complex objects and larger data like task histories and time logs).
  - **Encryption Layer:** Standard Web Crypto API or a library like `crypto-js` to handle AES encryption/decryption of the IndexedDB payloads using the user's password.
  - **State:** Zustand or React Context for global state management.
- **Icons & UI Components:** Lucide React (icons) + Radix UI / shadcn/ui (for accessible, unstyled components).
- **Browser APIs:** 
  - `navigator.vibrate` for urgent event device vibrations.
  - Web Audio API or HTML5 Audio for alert sounds.
- **AI Integration:** Direct client-side API calls to an LLM provider (e.g., OpenAI or Anthropic). *Note: The user will need to provide their own API key in the app settings to use the AI rewrite feature, as there is no backend to safely hide a shared key.*
- **Deployment:** Netlify (Static site hosting).

## 3. Data Model (Draft)

**Task Object:**
```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "enum (active, completed, archived)",
  "health": "enum (on-track, at-risk, blocked)",
  "tags": ["string"],
  "nextCheckpoint": "timestamp",
  "deadline": "timestamp",
  "stakeholders": ["string"],
  "suggestedNextAction": "string",
  "timeSpentSeconds": "number",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Time Log Object (for accurate timer tracking):**
```json
{
  "id": "uuid",
  "taskId": "uuid",
  "startTime": "timestamp",
  "endTime": "timestamp",
  "durationSeconds": "number"
}
```

## 4. Key Flows
- **Time Tracking:** When a user clicks "Start", a timestamp is recorded. An interval updates the UI. Clicking "Pause" calculates the delta and adds a Time Log entry for that task.
- **Reporting & Exporting:** The app queries all tasks and time logs within the last 7 days. It formats them into a markdown or HTML template, injecting the "Common Context" settings, and presents it to the user. 
  - **Email Export:** Generates a `mailto:` link populated with the report body.
  - **CSV Export:** Uses client-side logic to generate a CSV string and trigger a file download via a Blob URI.
- **Jira Import:** A text parser that accepts pasted Jira ticket summaries/CSV and maps them to the Task Object.
- **Alerts & Notifications:** A central notification system that listens for missed deadlines or urgent checkpoints and triggers UI animations, sounds, and device vibrations.

## 5. UI/UX Paradigm
- **Mobile-First Layout:** The core layout prioritizes mobile screens with a top-heavy design. The most important actions (timers, add task, current report) remain pinned or highly visible without scrolling.
- **Visual Cues:** Heavy use of icons and color-coding for task health/status instead of text walls.

## 6. Deployment Pipeline
- Code hosted on GitHub.
- Netlify connected to the repository.
- Commits to the `main` branch trigger an automatic build (`npm run build`) and deployment of the `dist`/`build` folder.