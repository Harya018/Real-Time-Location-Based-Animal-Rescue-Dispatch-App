// =================================================
// RESCUER MODE - Incoming requests, availability & nav
// =================================================

class RescuerMode {
  constructor(app) {
    this.app = app;
    this.map = null;
    this.isAvailable = false;
    this.aiAssistant = null;
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
      this.map.showNearbyVets(loc);
    }).catch(() => {
      this.rescuerLocation = { lat: 12.9716, lng: 77.5946 };
      this.map.showNearbyVets(this.rescuerLocation);
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
          ai: 'rescuer-ai-view',
        };

        const viewEl = document.getElementById(viewMap[view]);
        if (viewEl) {
          viewEl.style.display = 'flex';
          viewEl.classList.add('active-view');
        }

        // Handle map views
        if (view === 'map' && this.map) {
          this.map.invalidateSize();
        }
        if (view === 'history' && this.profileHistory) {
          this.profileHistory.loadHistory();
        }

        // Lazy-init AI Rescue Analyst
        if (view === 'ai' && !this.aiAssistant && window.AIAssistant) {
          this.aiAssistant = new AIAssistant('rescuer');
          this.aiAssistant.init();
        }
      });
    });
  }

  

  bindSocketEvents() {
    // Incoming rescue request (asteroid)
    this.app.socket.on('incoming_rescue_request', (data) => {
      if (!this.isAvailable) return;

      const request = {
        ...data,
        photos: data.photo ? [data.photo] : []
      };

      this.incomingRequests.push(request);
      this.renderRequests();
      this.app.showToast(`🚨 New ${data.severity || 'moderate'} rescue request!`, 'error');

      // Add marker on rescuer map
      if (data.location) {
        this.map.addIncidentMarker(data.id, data.location.lat, data.location.lng, data.severity, data.description, request.photos);
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
        let photos = [];
        try { photos = r.photos ? JSON.parse(r.photos) : []; } catch(e) {}

        const request = {
          id: r.id,
          severity: r.severity || 'moderate',
          description: r.description || 'Animal in distress',
          location: r.lat && r.lng ? { lat: Number(r.lat), lng: Number(r.lng) } : null,
          timestamp: r.created_at || new Date().toISOString(),
          photos: photos
        };
        this.incomingRequests.push(request);

        // Add to map
        if (request.location) {
          this.map.addIncidentMarker(request.id, request.location.lat, request.location.lng, request.severity, request.description, request.photos);
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
        (req) => {
          let hasPhoto = req.photos && req.photos.length > 0;
          return `
      <div class="request-asteroid ${req.severity || 'moderate'}" data-id="${req.id}">
        ${hasPhoto ? `<img src="${req.photos[0]}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px 8px 0 0; margin-bottom: 10px;" alt="Animal Photo" />` : ''}
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
        <button class="accept-btn" onclick="window.app.rescuerMode.showRequestDetails('${req.id}')">
          👁️ View Details
        </button>
      </div>
    `
        }
      )
      .join('');
  }

  showRequestDetails(reqId) {
    const req = this.incomingRequests.find((r) => r.id === reqId);
    if (!req) return;

    // Populate modal
    const modal = document.getElementById('rescue-details-modal');
    const imgContainer = document.getElementById('rescue-details-image-container');
    const imgStyle = document.getElementById('rescue-details-image');
    const noImg = document.getElementById('rescue-details-no-image');
    
    // Handle image
    if (req.photos && req.photos.length > 0 && req.photos[0]) {
      imgStyle.src = req.photos[0];
      imgStyle.style.display = 'block';
      noImg.style.display = 'none';
      imgContainer.style.height = '250px';
    } else {
      imgStyle.src = '';
      imgStyle.style.display = 'none';
      noImg.style.display = 'flex';
      imgContainer.style.height = '150px';
    }

    // Populate text
    document.getElementById('rescue-details-severity').textContent = (req.severity || 'moderate').toUpperCase();
    document.getElementById('rescue-details-severity').className = `badge badge-${req.severity || 'moderate'}`;
    document.getElementById('rescue-details-description').textContent = req.description || 'Emergency reported — no description provided';
    
    // Distance / Location
    let locString = 'Location available';
    if (req.location) {
      if (this.rescuerLocation) {
        // Rough distance calculation
        const dx = req.location.lat - this.rescuerLocation.lat;
        const dy = req.location.lng - this.rescuerLocation.lng;
        const distKm = (Math.sqrt(dx * dx + dy * dy) * 111).toFixed(1);
        locString = `${req.location.lat.toFixed(3)}, ${req.location.lng.toFixed(3)} (${distKm} km away)`;
      } else {
        locString = `${req.location.lat.toFixed(3)}, ${req.location.lng.toFixed(3)}`;
      }
    }
    document.getElementById('rescue-details-location').textContent = locString;
    document.getElementById('rescue-details-time').textContent = new Date(req.timestamp).toLocaleTimeString();

    // Hook up accept button
    const acceptBtn = document.getElementById('rescue-details-accept-btn');
    acceptBtn.onclick = () => {
      modal.classList.remove('active');
      this.acceptRequest(req.id, req.location ? JSON.stringify(req.location).replace(/"/g, "'") : 'null');
    };

    // Show modal
    modal.classList.add('active');
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
    this.app.showToast('🚀 Request accepted! Opening Google Maps Navigation...', 'success');

    // Open Google Maps Directions in a new tab
    if (this.rescuerLocation && incLoc) {
      const origin = `${this.rescuerLocation.lat},${this.rescuerLocation.lng}`;
      const destination = `${incLoc.lat},${incLoc.lng}`;
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
      window.open(mapsUrl, '_blank');
    }

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
