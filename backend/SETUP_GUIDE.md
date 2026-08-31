# Google Apps Script Setup & Deployment Guide

This guide walks you through setting up the Google Sheet and deploying the Apps Script API in 3 minutes.

---

## Step 1: Create a Google Sheet
1. Open [Google Sheets](https://sheets.new) in your browser.
2. Title your sheet: **"Freshie Fest 2026 - Attendees"**.

---

## Step 2: Add the Apps Script Code
1. In your Google Sheet menu bar, click **Extensions** → **Apps Script**.
2. Delete any default code in the editor (`function myFunction() {...}`).
3. Open [`backend/Code.gs`](file:///d:/vibes/freshie%20fest/backend/Code.gs) from this project, copy the entire content, and paste it into the Apps Script editor.
4. Click the **💾 Save** icon (or press `Ctrl + S` / `Cmd + S`).
5. (Optional) Customize the event name, date, venue, and `DEFAULT_ADMIN_CODE` at the top of the file in the `CONFIG` object.

---

## Step 3: Run One-Time Setup
1. In the Apps Script toolbar, make sure the function dropdown is set to **`initialSetup`**.
2. Click **▶ Run**.
3. Google will ask for permissions:
   - Click **Review permissions**
   - Select your Google Account
   - Click **Advanced** (small link at bottom left)
   - Click **Go to Untitled project (unsafe)**
   - Click **Allow**
4. Switch back to your Google Sheet tab — you will see a sheet named **`Attendees`** created with formatted headers!

---

## Step 4: Deploy as a Web App
1. At the top right of the Apps Script editor, click **Deploy** → **New deployment**.
2. Click the gear icon ⚙ next to "Select type" and choose **Web app**.
3. Fill in the deployment configuration:
   - **Description**: `Freshie Fest API v1`
   - **Execute as**: **Me (your-email@gmail.com)** *(Important!)*
   - **Who has access**: **Anyone** *(Important! This allows the static web pages to communicate with your sheet without requiring attendees or staff to log into Google)*
4. Click **Deploy**.
5. Copy the **Web App URL** (it looks like `https://script.google.com/macros/s/AKfycb.../exec`).

---

## Step 5: Configure the Web App
1. Open the Freshie Fest web app in your browser (or open `index.html`).
2. Click **⚙ Settings** in the top navigation bar.
3. Paste your **Web App URL** and enter your **Admin Code** (default is `FRESHIE2026`).
4. Click **Save & Test Connection**.
5. You're all set! All pass generation and QR scanning will now sync live to your Google Sheet in real time.

---

## Security & Best Practices
- **Admin Code**: Keep your admin code private. You can change it anytime in `Code.gs` or via **Project Settings > Script Properties** (add key `ADMIN_CODE` with your secret value).
- **Multiple Door Staff**: All door staff can open `scan.html` on their phones at the same time. Google Apps Script's `LockService` guarantees that even if two scanners read the same QR code at the exact same fraction of a second, only one will be marked `Valid` and the other will immediately show `Already Scanned`.
