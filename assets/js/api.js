/**
 * CSIT Event Operations - API Client & Offline Mock Store
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
          passId: '#LSAD26-001',
          name: 'Aiza Asim',
          rollNo: '22F-BSCS-026',
          amount: 2500,
          email: 'aiza.asim@example.com',
          whatsapp: '+923001234567',
          status: 'unused',
          createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          scannedAt: ''
        },
        {
          passId: '#LSAD26-002',
          name: 'Hamza Tariq',
          rollNo: '21F-BSCS-008',
          amount: 2500,
          email: 'hamza.t@example.com',
          whatsapp: '+923007654321',
          status: 'used',
          createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
          scannedAt: new Date(Date.now() - 3600000 * 2).toISOString()
        },
        {
          passId: '#LSAD26-003',
          name: 'Bilal Khan',
          rollNo: '22F-BSCS-014',
          amount: 2500,
          email: 'bilal.k@example.com',
          whatsapp: '+923009876543',
          status: 'unused',
          createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          scannedAt: ''
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
    const amount = Number(payload.amount) || 0;

    const passes = this.load();
    const count = passes.length + 1;
    const paddedNum = ('000' + count).slice(-3);
    const passId = `#LSAD26-${paddedNum}`;
    const nowIso = new Date().toISOString();
    const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(passId)}&size=400&ecLevel=H&margin=2`;

    const cleanPhone = String(payload.whatsapp || '').replace(/[^0-9]/g, '');
    const presenter = window.appConfig.get('PRESENTER') || 'CSIT OPERATIONS';
    const eventName = window.appConfig.get('EVENT_NAME') || 'The Last Soiree 2026';
    const eventDate = window.appConfig.get('EVENT_DATE') || '16 MAY 2026';
    const eventTime = window.appConfig.get('EVENT_TIME') || '07:00 PM ONWARDS';
    const eventVenue = window.appConfig.get('EVENT_VENUE') || 'Grand Arena';

    const message = 
      `*${presenter}*\n` +
      `*${eventName}*\n\n` +
      `Hello ${name},\n` +
      (rollNo ? `Roll No: ${rollNo}\n` : '') +
      `Pass ID: ${passId}\n` +
      (amount ? `Amount Paid: Rs. ${amount}\n` : '') +
      `\n` +
      `Date: ${eventDate}\n` +
      `Time: ${eventTime}\n` +
      `Venue: ${eventVenue}\n\n` +
      `Please present your QR code credential at the entrance gate. Valid for 1 entry.`;

    const whatsappLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}` : '';

    const newPass = {
      passId,
      name,
      rollNo,
      amount,
      email: payload.email || '',
      whatsapp: payload.whatsapp || '',
      status: 'unused',
      createdAt: nowIso,
      scannedAt: '',
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
        amount: pass.amount || 0,
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
      amount: pass.amount || 0,
      scannedAt: scanTimeIso,
      message: `Entry Approved: ${pass.name}`
    };
  }

  getStats(payload) {
    const passes = this.load();
    const total = passes.length;
    const scanned = passes.filter(p => p.status === 'used').length;
    const unused = total - scanned;
    const totalRevenue = passes.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const percentage = total > 0 ? Math.round((scanned / total) * 100) : 0;

    return {
      success: true,
      totalPasses: total,
      scannedPasses: scanned,
      unusedPasses: unused,
      totalRevenue: totalRevenue,
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
      await new Promise(r => setTimeout(r, 150));

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
