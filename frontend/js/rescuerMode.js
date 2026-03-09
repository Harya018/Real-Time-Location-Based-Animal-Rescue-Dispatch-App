// =================================================
// RESCUER MODE - Incoming requests, availability & nav
// =================================================

class RescuerMode {
  constructor(app) {
    this.app = app;
    this.map = null;
    this.fullMap = null;
    this.isAvailable = false;
    this.rescuerLocation = null;
    this.incomingRequests = [];
    this.activeRequestId = null;
    this.profileHistory = null;
  }

  init() {
    // Initialize rescuer map
    this.map = new MapManager('rescuer-map').init();
    this.map.locateUser().then((loc) => {
      this.rescuerLocation = loc;
    }).catch(() => {
      this.rescuerLocation = { lat: 12.9716, lng: 77.5946 };
    });

    this.bindEvents();
    this.bindSocketEvents();
    this.bindNavigation();
    this.loadPendingReports();

    // Initialize profile & history
    this.profileHistory = new ProfileHistory(this.app, 'rescuer');
    this.profileHistory.init();
  }

  bindEvents() {
    // Availability toggle (Gravity Switch)
    const toggle = document.getElementById('rescuer-available');
    toggle.addEventListener('change', () => {
      this.isAvailable = toggle.checked;
      const label = document.getElementById('switch-label');

      if (this.isAvailable) {
        label.textContent = 'Online';
        label.style.color = '#10b981';
        this.app.socket.goAvailable({
          rescuerId: this.app.userId,
          location: this.rescuerLocation,
          name: 'Rescuer',
        });
        this.app.showToast('✅ You are now available for rescues', 'success');
      } else {
        label.textContent = 'Offline';
        label.style.color = '';
        this.app.socket.goOffline();
        this.app.showToast('🔴 You are now offline', 'info');
      }
    });
  }

  // ===== NAVIGATION =====
  bindNavigation() {
    const nav = document.getElementById('rescuer-nav');
    if (!nav) return;

    nav.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;

        // Update active button
        nav.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Hide all views
        document.querySelectorAll('#rescuer-screen .rescuer-view').forEach((v) => {
          v.style.display = 'none';
          v.classList.remove('active-view');
        });

        // Show selected view
        const viewMap = {
          requests: 'rescuer-requests-view',
          map: 'rescuer-fullmap-view',
          history: 'rescuer-history-view',
          profile: 'rescuer-profile-view',
        };

        const viewEl = document.getElementById(viewMap[view]);
        if (viewEl) {
          viewEl.style.display = 'flex';
          viewEl.classList.add('active-view');
        }

        // Handle map views
        if (view === 'requests' && this.map) {
          this.map.invalidateSize();
        }
        if (view === 'map') {
          this.initFullMap();
        }
        if (view === 'history' && this.profileHistory) {
          this.profileHistory.loadHistory();
        }
      });
    });
  }

  initFullMap() {
    if (!this.fullMap) {
      this.fullMap = new MapManager('rescuer-fullmap').init();
      this.fullMap.locateUser().catch(() => {});
    }
    
    // Give it a moment to init if first time
    setTimeout(() => {
      this.fullMap.invalidateSize();
      // Plot current pending requests on full map
      this.incomingRequests.forEach((req) => {
        if (req.location) {
          this.fullMap.addIncidentMarker(req.id, req.location.lat, req.location.lng, req.severity);
        }
      });
    }, 500);
  }

  bindSocketEvents() {
    // Incoming rescue request (asteroid)
    this.app.socket.on('incoming_rescue_request', (data) => {
      if (!this.isAvailable) return;

      this.incomingRequests.push(data);
      this.renderRequests();
      this.app.showToast(`🚨 New ${data.severity || 'moderate'} rescue request!`, 'error');

      // Add marker on rescuer map
      if (data.location) {
        this.map.addIncidentMarker(data.id, data.location.lat, data.location.lng, data.severity);
        if (this.fullMap) {
          this.fullMap.addIncidentMarker(data.id, data.location.lat, data.location.lng, data.severity);
        }
      }
    });

    // Request cancelled
    this.app.socket.on('request_cancelled', (data) => {
      this.incomingRequests = this.incomingRequests.filter((r) => r.id !== data.requestId);
      this.renderRequests();
    });
  }

  // Load existing pending reports from API
  async loadPendingReports() {
    try {
      const res = await fetch('/api/reports?status=pending');
      if (!res.ok) throw new Error('HTTP error');
      const reports = await res.json();

      reports.forEach((r) => {
        const request = {
          id: r.id,
          severity: r.severity || 'moderate',
          description: r.description || 'Animal in distress',
          location: r.lat && r.lng ? { lat: Number(r.lat), lng: Number(r.lng) } : null,
          timestamp: r.created_at || new Date().toISOString(),
        };
        this.incomingRequests.push(request);

        // Add to map
        if (request.location) {
          this.map.addIncidentMarker(request.id, request.location.lat, request.location.lng, request.severity);
        }
      });

      this.renderRequests();
    } catch (err) {
      console.log('[Rescuer] Could not fetch pending reports:', err.message);
    }
  }

  renderRequests() {
    const container = document.getElementById('incoming-requests');
    const emptyState = document.getElementById('no-requests');

    if (this.incomingRequests.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = this.incomingRequests
      .map(
        (req) => `
      <div class="request-asteroid ${req.severity || 'moderate'}" data-id="${req.id}">
        <div class="asteroid-header">
          <h4>🆘 Animal in Distress</h4>
          <span class="asteroid-severity ${req.severity || 'moderate'}">${(req.severity || 'moderate').toUpperCase()}</span>
        </div>
        <div class="asteroid-body">
          <p>${req.description || 'Emergency reported — no description provided'}</p>
          <div class="asteroid-meta">
            <span>📍 ${req.location ? `${req.location.lat.toFixed(3)}, ${req.location.lng.toFixed(3)}` : 'Location available'}</span>
            <span>🕐 ${new Date(req.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
        <button class="accept-btn" onclick="window.app.rescuerMode.acceptRequest('${req.id}', ${req.location ? JSON.stringify(req.location).replace(/"/g, "'") : 'null'})">
          ⬆️ Accept & Rescue
        </button>
      </div>
    `
      )
      .join('');
  }

  acceptRequest(requestId, incidentLocation) {
    if (!this.rescuerLocation) {
      this.app.showToast('⚠️ Your location is not available', 'error');
      return;
    }

    // Parse incident location if it's a string
    let incLoc = incidentLocation;
    if (typeof incidentLocation === 'string') {
      try { incLoc = JSON.parse(incidentLocation.replace(/'/g, '"')); } catch (e) { incLoc = null; }
    }

    this.activeRequestId = requestId;

    this.app.socket.acceptRequest({
      requestId,
      rescuerId: this.app.userId,
      rescuerLocation: this.rescuerLocation,
      incidentLocation: incLoc,
    });

    // Remove from incoming
    this.incomingRequests = this.incomingRequests.filter((r) => r.id !== requestId);
    this.renderRequests();
    this.app.showToast('🚀 Request accepted! Navigate to the animal.', 'success');

    // Start simulated location updates
    this.startLocationBroadcast(requestId, incLoc);
  }

  // Simulate periodic location updates during active rescue
  startLocationBroadcast(requestId, incidentLocation) {
    if (this._broadcastInterval) clearInterval(this._broadcastInterval);

    this._broadcastInterval = setInterval(() => {
      if (!this.rescuerLocation) return;

      // Simulate movement toward the incident
      if (incidentLocation) {
        this.rescuerLocation.lat += (incidentLocation.lat - this.rescuerLocation.lat) * 0.1;
        this.rescuerLocation.lng += (incidentLocation.lng - this.rescuerLocation.lng) * 0.1;
      }

      this.app.socket.updateLocation({
        requestId,
        location: this.rescuerLocation,
        incidentLocation,
      });
    }, 3000);

    // Auto-stop after 60 seconds for demo
    setTimeout(() => {
      if (this._broadcastInterval) clearInterval(this._broadcastInterval);
    }, 60000);
  }
}

window.RescuerMode = RescuerMode;
