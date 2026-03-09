// =================================================
// PROFILE & HISTORY - View management and data display
// =================================================

class ProfileHistory {
  constructor(app, role) {
    this.app = app;
    this.role = role; // 'citizen' or 'rescuer'
    this.historyData = [];
  }

  init() {
    this.setupProfileInfo();
    this.loadHistory();
  }

  setupProfileInfo() {
    const prefix = this.role === 'citizen' ? 'citizen' : 'rescuer';
    const nameEl = document.getElementById(`${prefix}-profile-name`);
    const idEl = document.getElementById(`${prefix}-profile-id`);

    if (nameEl) nameEl.textContent = this.role === 'citizen' ? 'Citizen' : 'Rescuer';
    if (idEl) idEl.textContent = `ID: ${this.app.userId}`;
  }

  async loadHistory() {
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) throw new Error('Failed to fetch');
      this.historyData = await res.json();
      this.renderHistory();
      this.updateStats();
    } catch (err) {
      console.log('[ProfileHistory] Using empty history (API not available):', err.message);
    }
  }

  renderHistory() {
    const prefix = this.role === 'citizen' ? 'citizen' : 'rescuer';
    const container = document.getElementById(`${prefix}-history-list`);
    if (!container) return;

    if (this.historyData.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon antigravity-float">${this.role === 'citizen' ? '📭' : '🏆'}</span>
          <p>No ${this.role === 'citizen' ? 'rescue history' : 'completed rescues'} yet</p>
        </div>`;
      return;
    }

    container.innerHTML = this.historyData
      .map(
        (item, i) => `
          <div class="history-item" style="animation-delay: ${i * 0.05}s">
            <div class="history-severity-dot ${item.severity || 'moderate'}"></div>
            <div class="history-details">
              <h4>${item.description || 'Rescue Request'}</h4>
              <p>${item.citizen_name ? `Reported by ${item.citizen_name}` : 'Anonymous report'}</p>
              <div class="history-meta">
                <span>📍 ${item.lat ? `${Number(item.lat).toFixed(3)}, ${Number(item.lng).toFixed(3)}` : 'N/A'}</span>
                <span>🕐 ${item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recent'}</span>
              </div>
            </div>
            <span class="history-status ${item.status || 'pending'}">${(item.status || 'pending').toUpperCase()}</span>
          </div>`
      )
      .join('');
  }

  updateStats() {
    const prefix = this.role === 'citizen' ? 'citizen' : 'rescuer';

    if (this.role === 'citizen') {
      const sosEl = document.getElementById('citizen-sos-count');
      const rescuedEl = document.getElementById('citizen-rescued-count');
      const activeEl = document.getElementById('citizen-active-count');

      if (sosEl) sosEl.textContent = this.historyData.length;
      if (rescuedEl) rescuedEl.textContent = this.historyData.filter((r) => r.status === 'rescued').length;
      if (activeEl) activeEl.textContent = this.historyData.filter((r) => r.status === 'pending' || r.status === 'accepted').length;
    } else {
      const completedEl = document.getElementById('rescuer-completed-count');
      if (completedEl) completedEl.textContent = this.historyData.filter((r) => r.status === 'rescued').length;
    }
  }
}

window.ProfileHistory = ProfileHistory;
