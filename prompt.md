# PRD: Event QR Pass Generation & Scanning System

## Context
I'm hosting an event with ~150 attendees. Payments are collected manually (bank transfer/screenshot), confirmed by me personally — there is no payment gateway integration. I need a system to issue a unique QR-coded pass per attendee once I've confirmed their payment, and to validate those passes at the door on the day of the event.

## Goal
Build a lightweight ticketing system with **no traditional backend/server to host or maintain**. Attendee data should live in a spreadsheet I can open and inspect directly (Google Sheets, acting as the "Excel sheet"). The system has two layers:

1. **Google Apps Script** (free, hosted by Google, tied to the Sheet) acts purely as a **JSON API** — it reads/writes the Sheet, generates the QR data, and sends email. It does not serve any HTML pages.
2. **Static pages hosted on GitHub Pages** — a **Generator page** (I use this after manually confirming a payment, to create a pass and notify the attendee) and a **Scanner page** (door staff use this on any phone browser to validate passes as people arrive), plain HTML/JS, calling the Apps Script API via `fetch()`.

## Users
- **Me (organizer/admin)**: confirms payments, generates passes, needs to see the full attendee list at a glance.
- **Door staff**: no login needed, just opens a link on their phone and scans; needs an unambiguous valid/invalid/already-used signal.
- **Attendees**: receive a QR code via email and/or WhatsApp, present it at the door (digital or printed).

## Core Flow
1. Attendee pays me manually (bank transfer, screenshot, etc.) — I verify this myself, outside the system.
2. I open the Generator page, enter the attendee's name, email, and WhatsApp number.
3. System generates a unique Pass ID, writes a new row to the Sheet with status `unused`, generates a QR code encoding the Pass ID.
4. System emails the QR code automatically (as an image attachment) if an email was given.
5. System provides a pre-filled WhatsApp deep link (wa.me) for me to send manually if a WhatsApp number was given — the QR image must be attached manually since free-tier WhatsApp sending can't be automated.
6. On event day, door staff open the Scanner page on their phone, grant camera access, and scan each attendee's QR code.
7. System looks up the Pass ID in the Sheet in real time:
   - Not found → show a clear **Invalid** state.
   - Found, status `unused` → mark status `used` with a timestamp, show a clear **Valid** state with the attendee's name.
   - Found, status `used` → show a clear **Already scanned** state with the attendee's name (prevents re-entry via screenshot sharing).
8. Multiple door staff can scan simultaneously from different phones; the Sheet is the single source of truth, so a pass scanned at one entrance is immediately shown as used at another.

## Functional Requirements
- **Data store**: Google Sheet, one tab, columns: Pass ID, Name, Email, WhatsApp, Status, Created timestamp, Scanned-at timestamp.
- **Pass ID**: unique, unguessable enough to not be trivially forged (not sequential integers).
- **QR code**: encodes the Pass ID; generated via a QR API or library, no manual design work needed.
- **Apps Script API** (deployed as a Web App, JSON in/out via `doPost`, no HTML served):
  - `generatePass` endpoint: takes admin code, name, email, WhatsApp number; validates admin code; writes row to Sheet; sends email with QR attached (if email given); returns Pass ID, QR image URL, and a pre-filled WhatsApp deep link (if WhatsApp given) as JSON.
  - `checkAndScanPass` endpoint: takes a scanned Pass ID; looks it up in the Sheet; if unused, marks it used with a timestamp and returns valid + name; if already used, returns already-used + name; if not found, returns invalid. Returns JSON.
  - CORS must be handled so the GitHub Pages origin can call it via `fetch()`.
- **Generator page** (static HTML/JS on GitHub Pages):
  - Protected by a simple admin code (shared secret) so the page can't be used by randoms to mint fake passes if it leaks — sent to the API on each request, not just checked client-side.
  - Form fields: name, email, WhatsApp number.
  - On submit: calls the `generatePass` API via `fetch()`, then shows the QR image plus a WhatsApp send link (if WhatsApp given).
  - Clear error state if the admin code is wrong or name is missing.
- **Scanner page** (static HTML/JS on GitHub Pages):
  - No login required (multiple staff, multiple phones).
  - Uses the device camera to read QR codes (browser-based, no app install).
  - On each scan: calls the `checkAndScanPass` API via `fetch()`, then shows clearly distinguishable Valid / Already Scanned / Invalid states (color + icon + attendee name where applicable), then resets to ready-for-next-scan after a few seconds.
- **Delivery channels**: automated email; manual-assist WhatsApp (pre-filled deep link, image attached by hand).
- **No traditional backend**: Apps Script Web App deployment is the only "server," acting purely as an API tied to the Google Sheet; the actual pages are static files on GitHub Pages — nothing for me to separately host, patch, or pay hosting for.

## Non-Goals
- No online payment gateway integration — payment confirmation is manual and happens outside this system.
- No automated WhatsApp sending — free-tier constraint, out of scope unless WhatsApp Business API is explicitly requested later.
- No native mobile app — scanner must work from a plain mobile browser.
- No user accounts/login system for attendees or door staff.

## Constraints & Known Limitations
- Gmail sending via Apps Script has daily caps (~100/day on a free personal Google account, ~1,500/day on Google Workspace) — relevant given ~150 attendees if sent in one batch.
- WhatsApp delivery requires manual action (opening the chat + attaching the image) per attendee unless paid Business API is added later.
- Security relies on a shared admin code for the Generator page, not full authentication — acceptable for this scale but should be easy to change.
- Apps Script Web Apps have known quirks with CORS/preflight requests from external origins like GitHub Pages; the API layer needs to be built with this in mind (e.g. `doPost` returning the right headers, avoiding request patterns that trigger unsupported preflight behavior).

## Success Criteria
- I can confirm a payment and issue a working pass in under a minute.
- An attendee's QR code, once scanned as valid, cannot be reused to gain entry again.
- Door staff need zero setup beyond opening a link and allowing camera access.
- I can open the Google Sheet at any time during or after the event and see an accurate, live list of who has and hasn't checked in.