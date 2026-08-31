/**
 * Freshie Fest - API Client & Mock Store Layer
 * 
 * Implements CORS-safe communication with Google Apps Script Web App
 * plus an offline Mock Store for immediate local testing and demonstration.
 */

class MockBackendStore {
  constructor() {
    this.storageKey = 'freshie_fest_mock_sheet';
    this.init();
  }

  init() {
    if (!localStorage.getItem(this.storageKey)) {
      // Seed sample passes for instant testing
      const seedData = [
        {
          passId: 'FF-7K9M-2R8Q',
          name: 'Alex Rivera',
          email: 'alex.rivera@example.com',
          whatsapp: '+15550192834',
          status: 'unused',
          createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          scannedAt: '',
          notes: 'VIP Pass'
        },
        {
          passId: 'FF-3H8P-9W2X',
          name: 'Samantha Chen',
          email: 'samantha.c@example.com',
          whatsapp: '+15550183921',
          status: 'used',
          createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
          scannedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          notes: 'Early bird'
        },
        {
          passId: 'FF-4Y2L-8M5N',
          name: 'Jordan Miller',
          email: 'jordan.m@example.com',
          whatsapp: '+15550123456',
          status: 'unused',
          createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          scannedAt: '',
          notes: ''
        }
      ];
      this.save(seedData);
    }
  }

  load() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Failed to parse mock store data:', e);
      return [];
    }
  }

  save(data) {
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }

  generatePass(payload) {
    const adminCode = payload.adminCode;
    const expectedCode = window.appConfig.get('ADMIN_CODE') || 'FRESHIE2026';
    
    if (adminCode !== expectedCode) {
      return { success: false, error: 'Unauthorized: Invalid Admin Code' };
    }

    const name = (payload.name || '').trim();
    if (!name) {
      return { success: false, error: 'Attendee name is required.' };
    }

    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let p1 = '', p2 = '';
    for (let i = 0; i < 4; i++) {
      p1 += chars.charAt(Math.floor(Math.random() * chars.length));
      p2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const passId = `FF-${p1}-${p2}`;
    const nowIso = new Date().toISOString();
    const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(passId)}&size=400&ecLevel=H&margin=2`;

    const cleanPhone = String(payload.whatsapp || '').replace(/[^0-9]/g, '');
    const eventName = window.appConfig.get('EVENT_NAME');
    const eventDate = window.appConfig.get('EVENT_DATE');
    const eventVenue = window.appConfig.get('EVENT_VENUE');

    const message = 
      `🎉 *Hello ${name}!*\n\n` +
      `Your entry pass for *${eventName}* is confirmed!\n\n` +
      `🎫 *Pass ID:* \`${passId}\`\n` +
      `📅 *Date:* ${eventDate}\n` +
      `📍 *Venue:* ${eventVenue}\n\n` +
      `⚠️ *Important:* Please present your QR code pass at the door for entry. Each QR pass is valid for 1 entry only.\n\n` +
      `See you there! 🚀`;

    const whatsappLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}` : '';

    const newPass = {
      passId,
      name,
      email: payload.email || '',
      whatsapp: payload.whatsapp || '',
      status: 'unused',
      createdAt: nowIso,
      scannedAt: '',
      notes: payload.notes || '',
      qrUrl,
      whatsappLink
    };

    const passes = this.load();
    passes.unshift(newPass);
    this.save(passes);

    return {
      success: true,
      ...newPass,
      emailSent: Boolean(payload.email)
    };
  }

  checkAndScanPass(payload) {
    const rawPassId = (payload.passId || '').trim().toUpperCase();
    if (!rawPassId) {
      return { success: false, result: 'invalid', message: 'No Pass ID provided.' };
    }

    const passes = this.load();
    const index = passes.findIndex(p => p.passId.toUpperCase() === rawPassId);

    if (index === -1) {
      return {
        success: true,
        result: 'invalid',
        passId: rawPassId,
        message: 'Pass ID not found in system.'
      };
    }

    const pass = passes[index];
    if (pass.status === 'used') {
      return {
        success: true,
        result: 'already_used',
        passId: rawPassId,
        name: pass.name,
        scannedAt: pass.scannedAt,
        message: 'This pass has already been used!'
      };
    }

    // Mark as used
    const scanTimeIso = new Date().toISOString();
    pass.status = 'used';
    pass.scannedAt = scanTimeIso;
    this.save(passes);

    return {
      success: true,
      result: 'valid',
      passId: rawPassId,
      name: pass.name,
      scannedAt: scanTimeIso,
      message: `Entry Approved! Welcome ${pass.name}!`
    };
  }

  getStats(payload) {
    const passes = this.load();
    const total = passes.length;
    const scanned = passes.filter(p => p.status === 'used').length;
    const unused = total - scanned;
    const percentage = total > 0 ? Math.round((scanned / total) * 100) : 0;

    return {
      success: true,
      totalPasses: total,
      scannedPasses: scanned,
      unusedPasses: unused,
      scannedPercentage: percentage,
      recentPasses: passes
    };
  }

  getPasses(payload) {
    const stats = this.getStats(payload);
    const query = (payload.query || '').toLowerCase().trim();
    if (!query) return stats;

    const filtered = stats.recentPasses.filter(item => 
      item.name.toLowerCase().includes(query) ||
      item.passId.toLowerCase().includes(query) ||
      item.email.toLowerCase().includes(query) ||
      item.whatsapp.includes(query)
    );

    return {
      ...stats,
      passes: filtered
    };
  }
}

class ApiClient {
  constructor() {
    this.mockStore = new MockBackendStore();
  }

  async request(action, payload = {}) {
    const isMock = window.appConfig.isMockMode();

    if (isMock) {
      // Simulate realistic network delay of 150-350ms
      await new Promise(r => setTimeout(r, 200));

      switch (action) {
        case 'ping':
          return { success: true, message: 'Mock API is active and running locally.', mode: 'mock' };
        case 'generatePass':
          return this.mockStore.generatePass(payload);
        case 'checkAndScanPass':
          return this.mockStore.checkAndScanPass(payload);
        case 'getStats':
          return this.mockStore.getStats(payload);
        case 'getPasses':
          return this.mockStore.getPasses(payload);
        default:
          return { success: false, error: 'Unknown mock action: ' + action };
      }
    }

    const scriptUrl = window.appConfig.get('APPS_SCRIPT_URL');
    if (!scriptUrl) {
      throw new Error('Google Apps Script URL is not configured.');
    }

    const requestBody = JSON.stringify({
      action,
      ...payload
    });

    try {
      /**
       * CRITICAL: Use 'text/plain;charset=utf-8' to prevent the browser from issuing an OPTIONS preflight.
       * Google Apps Script Web Apps do not handle CORS preflight OPTIONS requests, but do handle standard simple POST requests!
       */
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: requestBody,
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('API Request Error:', err);
      throw new Error(`Failed to communicate with Google Apps Script: ${err.message}`);
    }
  }

  async ping() {
    return this.request('ping');
  }

  async generatePass(attendeeData, adminCode) {
    return this.request('generatePass', {
      ...attendeeData,
      adminCode
    });
  }

  async checkAndScanPass(passId) {
    return this.request('checkAndScanPass', { passId });
  }

  async getStats(adminCode) {
    return this.request('getStats', { adminCode });
  }

  async getPasses(query, adminCode) {
    return this.request('getPasses', { query, adminCode });
  }
}

window.apiClient = new ApiClient();
