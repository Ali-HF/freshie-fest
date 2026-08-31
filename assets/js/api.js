/**
 * CSIT Event Pass - API Client & Mock Store Layer
 */

class MockBackendStore {
  constructor() {
    this.storageKey = 'freshie_fest_mock_sheet';
    this.init();
  }

  init() {
    if (!localStorage.getItem(this.storageKey)) {
      const seedData = [
        {
          passId: '#LSAD26-026',
          name: 'Aiza Asim',
          rollNo: '22F-BSCS-026',
          batch: 'CSIT Juniors',
          category: 'Standard Entry',
          email: 'aiza.asim@example.com',
          whatsapp: '+15550192834',
          status: 'unused',
          createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          scannedAt: '',
          notes: 'Table 4'
        },
        {
          passId: '#LSAD26-008',
          name: 'Hamza Tariq',
          rollNo: '21F-BSCS-008',
          batch: 'CSIT Seniors',
          category: 'VIP Pass',
          email: 'hamza.t@example.com',
          whatsapp: '+15550183921',
          status: 'used',
          createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
          scannedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          notes: 'Organizing Committee'
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

    const rollNo = (payload.rollNo || '').trim();
    const batch = (payload.batch || '').trim();
    const category = (payload.category || 'Standard Entry').trim();

    const passes = this.load();
    const count = passes.length + 1;
    const paddedNum = ('000' + count).slice(-3);
    const passId = `#LSAD26-${paddedNum}`;
    const nowIso = new Date().toISOString();
    const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(passId)}&size=400&ecLevel=H&margin=2`;

    const cleanPhone = String(payload.whatsapp || '').replace(/[^0-9]/g, '');
    const presenter = window.appConfig.get('PRESENTER') || 'CSIT JUNIORS PRESENTS';
    const eventName = window.appConfig.get('EVENT_NAME') || 'The Last Soiree';
    const eventDate = window.appConfig.get('EVENT_DATE') || '16 MAY 2026';
    const eventTime = window.appConfig.get('EVENT_TIME') || '07:00 PM ONWARDS';
    const eventVenue = window.appConfig.get('EVENT_VENUE') || 'Grand Arena';
    const tagline = window.appConfig.get('EVENT_TAGLINE') || 'AN EVENING OF CELEBRATION | CONNECTION | LEGACY';

    const message = 
      `✨ *${presenter}*\n` +
      `🌟 *${eventName}*\n\n` +
      `🎉 *Hello ${name}!*` + (rollNo ? `\n🎓 *Roll No:* \`${rollNo}\`` : '') + `\n` +
      `🎫 *Pass ID:* \`${passId}\`\n\n` +
      `📅 *Date:* ${eventDate}\n` +
      `⏰ *Time:* ${eventTime}\n` +
      `📍 *Venue:* ${eventVenue}\n\n` +
      `⚠️ *Important:* Please present your QR code pass at the door for entry. Each QR pass is valid for 1 entry only.\n\n` +
      `✨ _${tagline}_ 🚀`;

    const whatsappLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}` : '';

    const newPass = {
      passId,
      name,
      rollNo,
      batch,
      category,
      email: payload.email || '',
      whatsapp: payload.whatsapp || '',
      status: 'unused',
      createdAt: nowIso,
      scannedAt: '',
      notes: payload.notes || '',
      qrUrl,
      whatsappLink
    };

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
        rollNo: pass.rollNo || '',
        batch: pass.batch || '',
        scannedAt: pass.scannedAt,
        message: 'This pass has already been used!'
      };
    }

    const scanTimeIso = new Date().toISOString();
    pass.status = 'used';
    pass.scannedAt = scanTimeIso;
    this.save(passes);

    return {
      success: true,
      result: 'valid',
      passId: rawPassId,
      name: pass.name,
      rollNo: pass.rollNo || '',
      batch: pass.batch || '',
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
      (item.rollNo && item.rollNo.toLowerCase().includes(query)) ||
      (item.email && item.email.toLowerCase().includes(query)) ||
      (item.whatsapp && String(item.whatsapp).includes(query))
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
