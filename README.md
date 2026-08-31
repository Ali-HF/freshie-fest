# ⚡ Freshie Fest 2026 - Event QR Pass & Door Scanning System

A lightweight, serverless event ticketing and live check-in system designed for ~150 attendees. Built with **Google Sheets + Apps Script** as the zero-cost JSON database API and **modern static web pages** ready for GitHub Pages hosting.

---

## 🌟 Key Features

1. **Zero-Maintenance Serverless Architecture**:
   - Google Sheet acts as the primary database you can open and inspect anytime.
   - Google Apps Script provides atomic write/read endpoints with built-in concurrency locks (`LockService`) to prevent race conditions during high-volume door check-ins.
   - Frontend is 100% static HTML5/CSS/JavaScript with no server runtime or cloud hosting fees.

2. **Organizer Pass Generator (`generate.html`)**:
   - Protected by a secret **Admin Code**.
   - Issues unguessable unique Pass IDs (`FF-XXXX-XXXX`).
   - Automatically writes to Google Sheet with status `unused` and timestamps.
   - Auto-emails the QR pass directly to the attendee (via `GmailApp`).
   - Generates 1-click **WhatsApp deep links (`wa.me`)** with pre-formatted message text.
   - Live **Digital Ticket Card Preview** with instant high-resolution PNG image download and print support.

3. **Door Staff Live Scanner (`scan.html`)**:
   - No login or app installation required for staff — works in any mobile browser (Safari, Chrome).
   - High-speed QR camera scanner powered by `html5-qrcode` with front/rear camera flip and flashlight toggle.
   - Unambiguous instant feedback:
     - **✅ VALID** (Emerald glow, checkmark, attendee name, victory chime, haptic vibration).
     - **⚠️ ALREADY SCANNED** (Amber glow, caution badge, attendee name, previous scan timestamp, warning tone).
     - **❌ INVALID** (Crimson alert, error tone).
   - 3-second auto-reset timer with manual "Scan Next" override.
   - Real-time session scan counter and history log.
   - Manual Pass ID entry fallback for damaged phone screens.

4. **Event Hub & Live Dashboard (`index.html`)**:
   - Real-time check-in stats (Total Passes Issued, Checked-in at Door, Pending Arrival, Attendance Rate %).
   - Live searchable attendee activity table.
   - Quick settings drawer to connect live Google Sheet Web App URL or toggle instant local demo mode.

---

## 🚀 Quick Start Guide

### 1. Test Locally (Demo Mode Out-of-the-Box)
You can open `index.html` directly in your browser or run a simple local web server:
```bash
# Using Python
python -m http.server 8000

# Or using npx serve
npx serve .
```
The app includes a built-in **Demo Mock Store** in `localStorage` seeded with sample attendees so you can test generating and scanning passes immediately!

---

### 2. Connect Your Live Google Sheet in 3 Minutes

Follow the step-by-step instructions in [`backend/SETUP_GUIDE.md`](file:///d:/vibes/freshie%20fest/backend/SETUP_GUIDE.md):

1. Create a new Google Sheet named **"Freshie Fest 2026 - Attendees"**.
2. Click **Extensions > Apps Script** and paste the code from [`backend/Code.gs`](file:///d:/vibes/freshie%20fest/backend/Code.gs).
3. Run `initialSetup` once to format your sheet columns.
4. Click **Deploy > New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployed Web App URL.
6. Open your web app, click **⚙️ Settings**, paste the URL and Admin Code (`FRESHIE2026`), and click **Save**.

---

### 3. Deploy to GitHub Pages (Free Hosting)

1. Create a new GitHub repository and push this folder:
   ```bash
   git init
   git add .
   git commit -m "Freshie Fest Ticketing System"
   git branch -M main
   git remote add origin https://github.com/your-username/freshie-fest.git
   git push -u origin main
   ```
2. In your repository on GitHub:
   - Go to **Settings > Pages**.
   - Under **Build and deployment**, set **Source** to `Deploy from a branch` and select `main` branch `/ (root)`.
   - Click **Save**.
3. Your event portal is now live at `https://your-username.github.io/freshie-fest/`!

---

## 🛡️ Security & Concurrency

- **Race Condition Prevention**: When multiple door staff scan tickets simultaneously, Google Apps Script uses `LockService.getScriptLock()` with a 10-second timeout to ensure atomic status updates. A pass scanned at Entrance A cannot be reused at Entrance B a split-second later.
- **Admin Protection**: The `generatePass` and `getStats` endpoints require the `adminCode` header/payload, preventing unauthorized users from minting passes if the generator URL is discovered.
- **CORS Preflight Compatibility**: To avoid Google Apps Script's known CORS `OPTIONS` preflight limitations, client-side requests use plain-text JSON payloads (`Content-Type: text/plain;charset=utf-8`), ensuring reliable cross-origin communication from GitHub Pages.

---

## 📁 Project Structure

```
freshie-fest/
├── index.html              # Main Hub & Live Check-in Dashboard
├── generate.html           # Organizer Pass Generator & Ticket Exporter
├── scan.html               # Mobile-first Door Staff QR Scanner
├── prompt.md               # Original Product Requirements Document
├── README.md               # Project documentation and quick start
├── assets/
│   ├── css/
│   │   └── style.css       # Custom design system (Dark neon & glassmorphism)
│   └── js/
│       ├── api.js          # API client with Mock Store & Apps Script bridge
│       ├── audio.js        # Web Audio API chime/warning sound synthesizer
│       ├── common.js       # Shared header, settings modal, and toasts
│       └── config.js       # Configuration and localStorage manager
└── backend/
    ├── Code.gs             # Google Apps Script Web App API for Google Sheets
    └── SETUP_GUIDE.md      # Detailed 3-minute Google deployment guide
```
