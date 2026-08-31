/**
 * Freshie Fest - Configuration & Local Settings Manager
 */

const DEFAULT_CONFIG = {
  EVENT_NAME: 'Freshie Fest 2026',
  EVENT_DATE: 'Saturday, October 24, 2026',
  EVENT_VENUE: 'Grand Arena, Main Campus',
  // You can set a hardcoded deployment URL here or configure it in the UI settings
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwNAcgGHqIwqDF-K6GEQHKpJTMICvUAOjpRw5sf2rDEjjrgCmrHDtZobBtlKM6Ta6Vv/exec',
  ADMIN_CODE: 'FRESHIE2026',
  // If true or if no Apps Script URL is set, app will run in Demo/Mock Mode
  USE_MOCK_API: false,
  RESET_TIMEOUT_SECONDS: 3
};

class ConfigManager {
  constructor() {
    this.storageKey = 'freshie_fest_config';
    this.config = this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load config from localStorage:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  save(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.config));
    } catch (e) {
      console.warn('Failed to save config to localStorage:', e);
    }
  }

  get(key) {
    return this.config[key];
  }

  set(key, value) {
    this.config[key] = value;
    this.save(this.config);
  }

  isConfigured() {
    return Boolean(this.config.APPS_SCRIPT_URL && this.config.APPS_SCRIPT_URL.trim().length > 0);
  }

  isMockMode() {
    return !this.isConfigured() || Boolean(this.config.USE_MOCK_API);
  }
}

window.appConfig = new ConfigManager();
