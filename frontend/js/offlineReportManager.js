// =================================================
// OFFLINE REPORT MANAGER — IndexedDB + Auto-Sync
// =================================================
class OfflineReportManager {
  constructor() {
    this.DB_NAME = 'JeevaRakshaOffline';
    this.DB_VERSION = 1;
    this.STORE_NAME = 'pendingReports';
    this.db = null;
    this.syncInterval = null;
    this.isSyncing = false;
  }

  async init() {
    await this.openDB();
    this.bindConnectivityEvents();
    this.startSyncLoop();
    this.updateQueueBadge();

    // Expose globally
    window.offlineManager = this;

    console.log('[Offline] Manager initialized');
  }

  // ── IndexedDB Setup ──────────────────────────────────────
  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'localId', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('[Offline] IndexedDB error:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  // ── Queue a report for offline storage ────────────────────
  async queueReport(reportData) {
    if (!this.db) await this.openDB();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);

      const record = {
        ...reportData,
        timestamp: new Date().toISOString(),
        queued_at: Date.now()
      };

      const request = store.add(record);
      request.onsuccess = () => {
        console.log('[Offline] Report queued:', request.result);
        this.updateQueueBadge();
        this.showBanner('offline');
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ── Get all queued reports ────────────────────────────────
  async getQueuedReports() {
    if (!this.db) await this.openDB();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // ── Remove a report from queue ────────────────────────────
  async removeReport(localId) {
    if (!this.db) await this.openDB();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.delete(localId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ── UI Integration & Local Management ─────────────────────
  async renderOfflineList() {
    const listContainer = document.getElementById('offline-reports-list');
    const panel = document.getElementById('offline-reports-panel');
    if (!listContainer || !panel) return;

    const reports = await this.getQueuedReports();
    
    if (reports.length === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';
    listContainer.innerHTML = reports.map(report => `
      <div class="offline-report-card" data-id="${report.localId}">
        <div class="off-report-info">
          <h4>${report.description.substring(0, 30)}${report.description.length > 30 ? '...' : ''}</h4>
          <p>📅 ${new Date(report.timestamp).toLocaleString()} • ${report.severity}</p>
        </div>
        <div class="off-report-actions">
          <button class="btn-off-upload" onclick="window.offlineManager.uploadSingle(${report.localId})">🚀 Upload</button>
          <button class="btn-off-delete" onclick="window.offlineManager.deleteSingle(${report.localId})">🗑️ Delete</button>
        </div>
      </div>
    `).join('');

    // Wire up Upload All button
    const uploadAllBtn = document.getElementById('upload-all-btn');
    if (uploadAllBtn) {
      uploadAllBtn.onclick = () => this.syncAll();
    }
  }

  async uploadSingle(localId) {
    if (!navigator.onLine) {
      window.app?.showToast('📡 Still offline. Please wait for connection.', 'error');
      return;
    }

    const reports = await this.getQueuedReports();
    const report = reports.find(r => r.localId === localId);
    if (!report) return;

    window.app?.showToast('🚀 Uploading report...', 'info');
    
    try {
      const { localId: lid, queued_at, ...payload } = report;
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      await this.removeReport(localId);
      window.app?.showToast('✅ Report uploaded successfully!', 'success');
      
      this.renderOfflineList();
      this.updateQueueBadge();
      
      if (window.app?.citizenMode) {
        window.app.citizenMode.loadIncidentsFromAPI();
      }
    } catch (err) {
      console.error('[Offline] Single upload error:', err);
      window.app?.showToast('❌ Upload failed', 'error');
    }
  }

  async deleteSingle(localId) {
    if (confirm('Are you sure you want to delete this saved report?')) {
      await this.removeReport(localId);
      this.renderOfflineList();
      this.updateQueueBadge();
      window.app?.showToast('🗑️ Report deleted', 'info');
    }
  }

  // ── Sync all queued reports ───────────────────────────────
  async syncAll() {
    if (this.isSyncing) return;
    if (!navigator.onLine) {
      window.app?.showToast('📡 You are still offline!', 'error');
      return;
    }

    const reports = await this.getQueuedReports();
    if (reports.length === 0) return;

    this.isSyncing = true;
    console.log(`[Offline] Syncing ${reports.length} queued reports...`);
    this.showBanner('syncing', reports.length);

    try {
      // Strip localId and queued_at before sending
      const payloads = reports.map(r => {
        const { localId, queued_at, ...rest } = r;
        return rest;
      });

      const res = await fetch('/api/reports/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: payloads })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Remove successfully synced reports from IndexedDB
      let synced = 0;
      for (let i = 0; i < data.results.length; i++) {
        if (data.results[i].success) {
          await this.removeReport(reports[i].localId);
          synced++;
        }
      }

      console.log(`[Offline] Synced ${synced}/${reports.length} reports`);
      window.app?.showToast(`✅ ${synced} offline report${synced > 1 ? 's' : ''} synced successfully!`, 'success');

      // Refresh incidents on citizen map
      if (window.app?.citizenMode) {
        window.app.citizenMode.loadIncidentsFromAPI();
      }

    } catch (err) {
      console.error('[Offline] Sync error:', err.message);
      window.app?.showToast('⚠️ Sync failed — will retry automatically', 'error');
    }

    this.isSyncing = false;
    this.updateQueueBadge();
    this.hideBanner();
  }

  // ── Connectivity Events ───────────────────────────────────
  bindConnectivityEvents() {
    window.addEventListener('online', () => {
      console.log('[Offline] Connection restored');
      window.app?.showToast('🌐 Connection restored — syncing reports...', 'success');
      this.hideBanner();
      // Delay sync slightly to let connection stabilize
      setTimeout(() => this.syncAll(), 2000);
    });

    window.addEventListener('offline', () => {
      console.log('[Offline] Connection lost');
      window.app?.showToast('📡 No internet connection — reports will be saved locally', 'error');
      this.showBanner('offline');
    });

    // Initial state
    if (!navigator.onLine) {
      this.showBanner('offline');
    }
  }

  // ── Auto-sync loop (every 30s) ────────────────────────────
  startSyncLoop() {
    this.syncInterval = setInterval(async () => {
      if (navigator.onLine && !this.isSyncing) {
        const reports = await this.getQueuedReports();
        if (reports.length > 0) {
          this.syncAll();
        }
      }
    }, 30000);
  }

  // ── Offline Banner ────────────────────────────────────────
  showBanner(type = 'offline', count = 0) {
    let banner = document.getElementById('offline-banner');
    if (!banner) return;

    if (type === 'syncing') {
      banner.className = 'offline-banner syncing visible';
      banner.innerHTML = `
        <span class="offline-icon">🔄</span>
        <span>Syncing ${count} offline report${count > 1 ? 's' : ''}...</span>
        <span class="offline-pulse"></span>
      `;
    } else {
      banner.className = 'offline-banner visible';
      banner.innerHTML = `
        <span class="offline-icon">📡</span>
        <span>No internet — reports will be saved locally</span>
        <span class="offline-pulse"></span>
      `;
    }
  }

  hideBanner() {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.classList.remove('visible');
  }

  // ── Queue Badge on SOS Button ──────────────────────────────
  async updateQueueBadge() {
    try {
      const reports = await this.getQueuedReports();
      const badge = document.getElementById('queued-badge');
      if (badge) {
        if (reports.length > 0) {
          badge.textContent = reports.length;
          badge.classList.add('active');
        } else {
          badge.classList.remove('active');
        }
      }
    } catch (e) {
      // Silently ignore — badge is cosmetic
    }
  }

  // ── Check if currently offline ────────────────────────────
  static isOffline() {
    return !navigator.onLine;
  }
}

window.OfflineReportManager = OfflineReportManager;
