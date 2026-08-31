/**
 * Freshie Fest - Common UI Controller (Header, Settings Modal, Toasts)
 */

function renderHeader(activePage = 'hub') {
  const headerHtml = `
    <header class="header">
      <div class="container nav-wrapper">
        <a href="index.html" class="brand">
          <div class="brand-icon">CS</div>
          <div class="brand-text">
            CSIT OPERATIONS
            <span>TICKETING & GATE ADMISSION</span>
          </div>
        </a>

        <ul class="nav-links">
          <li><a href="index.html" class="nav-link ${activePage === 'hub' ? 'active' : ''}">Dashboard</a></li>
          <li><a href="generate.html" class="nav-link ${activePage === 'generate' ? 'active' : ''}">Pass Generator</a></li>
          <li><a href="scan.html" class="nav-link ${activePage === 'scan' ? 'active' : ''}">Gate Scanner</a></li>
        </ul>

        <div class="nav-actions">
          <div id="connection-pill" class="status-badge" onclick="openSettingsModal()" title="Click to configure backend API connection">
            <span class="status-dot"></span>
            <span id="connection-status-text">Checking...</span>
          </div>
          <button class="btn btn-secondary btn-icon" onclick="openSettingsModal()" title="API Settings">
            ⚙️
          </button>
        </div>
      </div>
    </header>

    <!-- Settings Modal -->
    <div id="settings-modal" class="modal-backdrop">
      <div class="modal-card">
        <div class="card-header">
          <div class="card-title">⚙️ API & Backend Settings</div>
          <button class="btn btn-secondary btn-icon" onclick="closeSettingsModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="alert alert-info">
            <div class="alert-icon">💡</div>
            <div>
              <strong>Serverless Google Sheets API:</strong> Deploy <code>backend/Code.gs</code> to your Google Sheet as a Web App and paste the deployment URL below.
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Google Apps Script Web App URL</label>
            <input type="text" id="setting-script-url" class="form-input" placeholder="https://script.google.com/macros/s/.../exec">
            <div class="form-hint">Leave blank to use Demo / Mock Mode with built-in test data.</div>
          </div>

          <div class="form-group">
            <label class="form-label">Admin Security Code</label>
            <input type="password" id="setting-admin-code" class="form-input" placeholder="FRESHIE2026">
            <div class="form-hint">Required to issue passes and view organizer stats.</div>
          </div>

          <div class="form-group">
            <label class="form-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="setting-mock-mode" style="width: 18px; height: 18px; accent-color: var(--primary-purple);">
              <span>Force Local Demo / Mock Mode</span>
            </label>
            <div class="form-hint">Simulates Google Sheet database locally in your browser for testing.</div>
          </div>

          <div id="settings-test-result" style="display: none; margin-top: 16px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="testConnection()">⚡ Test Connection</button>
          <button class="btn btn-primary" onclick="saveSettings()">💾 Save Settings</button>
        </div>
      </div>
    </div>

    <!-- Toast Notifications Container -->
    <div id="toast-container"></div>
  `;

  document.body.insertAdjacentHTML('afterbegin', headerHtml);
  updateConnectionBadge();
}

function updateConnectionBadge() {
  const pill = document.getElementById('connection-pill');
  const text = document.getElementById('connection-status-text');
  if (!pill || !text) return;

  pill.className = 'status-badge';

  if (window.appConfig.isMockMode()) {
    pill.classList.add('mock');
    text.textContent = 'Demo Mode';
  } else if (window.appConfig.isConfigured()) {
    pill.classList.add('connected');
    text.textContent = 'Google Sheet Live';
  } else {
    pill.classList.add('error');
    text.textContent = 'Setup Needed';
  }
}

function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const urlInput = document.getElementById('setting-script-url');
  const codeInput = document.getElementById('setting-admin-code');
  const mockInput = document.getElementById('setting-mock-mode');
  const resultDiv = document.getElementById('settings-test-result');

  if (urlInput) urlInput.value = window.appConfig.get('APPS_SCRIPT_URL') || '';
  if (codeInput) codeInput.value = window.appConfig.get('ADMIN_CODE') || '';
  if (mockInput) mockInput.checked = Boolean(window.appConfig.get('USE_MOCK_API'));
  if (resultDiv) resultDiv.style.display = 'none';

  if (modal) modal.classList.add('open');
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.remove('open');
}

async function testConnection() {
  const resultDiv = document.getElementById('settings-test-result');
  const urlInput = document.getElementById('setting-script-url');
  const codeInput = document.getElementById('setting-admin-code');
  const mockInput = document.getElementById('setting-mock-mode');

  if (!resultDiv) return;
  resultDiv.style.display = 'block';
  resultDiv.className = 'alert alert-info';
  resultDiv.innerHTML = '<span>⏳ Testing connection to API...</span>';

  // Temporarily store values in memory
  const prevUrl = window.appConfig.get('APPS_SCRIPT_URL');
  const prevCode = window.appConfig.get('ADMIN_CODE');
  const prevMock = window.appConfig.get('USE_MOCK_API');

  window.appConfig.set('APPS_SCRIPT_URL', urlInput.value.trim());
  window.appConfig.set('ADMIN_CODE', codeInput.value.trim());
  window.appConfig.set('USE_MOCK_API', mockInput.checked);

  try {
    const res = await window.apiClient.ping();
    if (res && res.success) {
      resultDiv.className = 'alert alert-success';
      resultDiv.innerHTML = `<strong>✅ Connection Successful!</strong><br>${res.message || 'API responded OK.'}`;
    } else {
      resultDiv.className = 'alert alert-danger';
      resultDiv.innerHTML = `<strong>❌ Connection Failed:</strong><br>${res.error || 'Unknown error'}`;
    }
  } catch (err) {
    resultDiv.className = 'alert alert-danger';
    resultDiv.innerHTML = `<strong>❌ Error connecting:</strong><br>${err.message}`;
  }

  // Restore until user clicks Save
  window.appConfig.set('APPS_SCRIPT_URL', prevUrl);
  window.appConfig.set('ADMIN_CODE', prevCode);
  window.appConfig.set('USE_MOCK_API', prevMock);
}

function saveSettings() {
  const urlInput = document.getElementById('setting-script-url');
  const codeInput = document.getElementById('setting-admin-code');
  const mockInput = document.getElementById('setting-mock-mode');

  window.appConfig.set('APPS_SCRIPT_URL', urlInput.value.trim());
  window.appConfig.set('ADMIN_CODE', codeInput.value.trim());
  window.appConfig.set('USE_MOCK_API', mockInput.checked);

  updateConnectionBadge();
  showToast('Settings saved successfully!', 'success');
  closeSettingsModal();

  // Trigger reload of stats if on dashboard/generator
  if (typeof window.refreshDashboardStats === 'function') {
    window.refreshDashboardStats();
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
