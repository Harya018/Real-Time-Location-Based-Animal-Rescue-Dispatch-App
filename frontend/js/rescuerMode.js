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
      });
    });
  }

  

  bindSocketEvents() {
    // Incoming rescue request
    this.app.socket.on('incoming_rescue_request', (data) => {
      if (!this.isAvailable) return;
      
      // Don't show if we already denied it (session-based for now)
      if (this._deniedIds?.has(data.id)) return;

      const request = { ...data, photos: data.photo ? [data.photo] : [], aiReport: null };
      this.incomingRequests.push(request);
      this.renderRequests();
      this.app.showToast(`🚨 New ${data.severity || 'moderate'} rescue request!`, 'error');
      if (data.location) {
        this.map.addIncidentMarker(data.id, data.location.lat, data.location.lng, data.severity, data.description, request.photos);
      }
    });

    // Request cancelled
    this.app.socket.on('request_cancelled', (data) => {
      this.incomingRequests = this.incomingRequests.filter(r => r.id !== data.requestId);
      this.renderRequests();
    });
  }

  // Load existing pending reports from API
  async loadPendingReports() {
    try {
      const res = await fetch('/api/reports?status=pending'); 
      if (!res.ok) throw new Error('HTTP error');
      const reports = await res.json();

      this.incomingRequests = reports.map((r) => {
        let photos = [];
        try { photos = r.photos ? JSON.parse(r.photos) : []; } catch(e) {}

        const request = {
          id: r.id,
          status: r.status,
          severity: r.severity || 'moderate',
          animalType: r.animal_type || this._inferAnimalType(r.description),
          description: r.description || 'Animal in distress',
          location: r.lat && r.lng ? { lat: Number(r.lat), lng: Number(r.lng) } : null,
          timestamp: r.created_at || new Date().toISOString(),
          photos,
          aiReport: r.ai_report || null,
          citizenName: r.citizen_name || null
        };

        if (request.status === 'pending' && request.location && !this._deniedIds?.has(request.id)) {
          this.map.addIncidentMarker(request.id, request.location.lat, request.location.lng, request.severity, request.description, request.photos);
        }
        return request;
      }).filter(r => !this._deniedIds?.has(r.id));

      this.updateDashboardUI();
      this.renderRequests();
    } catch (err) {
      console.log('[Rescuer] Could not fetch reports:', err.message);
    }
  }

  _inferAnimalType(desc) {
    if (!desc) return 'other';
    const d = desc.toLowerCase();
    if (d.includes('dog') || d.includes('puppy')) return 'dog';
    if (d.includes('cat') || d.includes('kitten')) return 'cat';
    if (d.includes('bird') || d.includes('pigeon') || d.includes('eagle')) return 'bird';
    return 'other';
  }

  updateDashboardUI() {
    // Update Greeting & Date
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    const name = this.profileHistory?.userData?.name || 'Rescuer';
    document.getElementById('rescuer-greeting').textContent = `${greeting}, ${name}`;
    document.getElementById('dashboard-date').textContent = new Date().toLocaleDateString('en-GB', { 
      day: 'numeric', month: 'short', year: 'numeric', weekday: 'long' 
    });

    // Calculate Stats
    const active = this.incomingRequests.filter(r => r.status === 'pending').length;
    const process = this.incomingRequests.filter(r => r.status === 'accepted' || r.status === 'en_route').length;
    const finished = this.incomingRequests.filter(r => r.status === 'rescued').length;
    const priority = this.incomingRequests.filter(r => r.severity === 'critical' && r.status === 'pending').length;

    document.getElementById('stats-active').textContent = active;
    document.getElementById('stats-process').textContent = process;
    document.getElementById('stats-finished').textContent = finished;
    document.getElementById('stats-priority').textContent = priority;

    // Update Chart total
    const totalRescues = active + process + finished;
    document.getElementById('total-rescues-count').textContent = totalRescues;
    
    // Update Progress Bars (Mock data for demo impact)
    const dogCount = this.incomingRequests.filter(r => r.animalType === 'dog').length;
    const catCount = this.incomingRequests.filter(r => r.animalType === 'cat').length;
    const birdCount = this.incomingRequests.filter(r => r.animalType === 'bird').length;
    
    // Update donut chart segments visually (mocking it via CSS variables logic if we had it, or just keeping the HTML static)
  }

  renderRequests() {
    const tableBody = document.getElementById('incoming-requests-table');
    const emptyState = document.getElementById('no-requests');
    
    // We only show "Active/Pending" and "In Process" in the main list
    const visibleRequests = this.incomingRequests.filter(r => r.status !== 'rescued' && r.status !== 'denied');

    if (visibleRequests.length === 0) {
      tableBody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    tableBody.innerHTML = visibleRequests.map(req => {
      const date = new Date(req.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      const time = new Date(req.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isPriority = req.severity === 'critical';
      
      const animalIcon = req.animalType === 'dog' ? '🐕' : req.animalType === 'cat' ? '🐈' : req.animalType === 'bird' ? '🐦' : '🐾';
      
      return `
        <tr class="${isPriority ? 'priority' : ''}">
          <td style="white-space:nowrap;">
            <div style="font-weight:600;">${date}</div>
            <div style="font-size:0.7rem;opacity:0.6;">${time}</div>
          </td>
          <td style="font-family:monospace;font-size:0.75rem;opacity:0.7;">#${req.id.slice(-6)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:1.2rem;">${animalIcon}</span>
              <span>${req.animalType.charAt(0).toUpperCase() + req.animalType.slice(1)}</span>
            </div>
          </td>
          <td><span class="status-pill ${req.status}">${req.status}</span></td>
          <td><span class="status-pill ${req.severity}">${req.severity}</span></td>
          <td>
            <div class="table-actions">
              <button class="action-icon-btn" onclick="window.app.rescuerMode.showRequestDetails('${req.id}')" title="View Details">👁️</button>
              <button class="action-icon-btn" onclick="window.app.rescuerMode.openMap('${req.id}')" title="Open Map">📍</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  openMap(reqId) {
    const req = this.incomingRequests.find(r => r.id === reqId);
    if (req && req.location) {
      this.acceptRequest(req.id, req.location);
    }
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
    document.getElementById('rescue-details-description').textContent = req.description || 'Emergency reported';
    
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

    // Wire up Buttons
    document.getElementById('rescue-details-accept-btn').onclick = () => {
      modal.classList.remove('active');
      this.acceptRequest(req.id, req.location);
    };

    document.getElementById('rescue-details-deny-btn').onclick = () => {
      modal.classList.remove('active');
      this.denyRequest(req.id);
    };

    document.getElementById('rescue-details-pending-btn').onclick = () => {
      modal.classList.remove('active');
      this.app.showToast('⏳ Request kept in your pending list', 'info');
    };

    // Show modal
    modal.classList.add('active');
  }

  async denyRequest(requestId) {
    if (!this._deniedIds) this._deniedIds = new Set();
    this._deniedIds.add(requestId);

    try {
      await fetch(`/api/reports/${requestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'denied', rescuer_id: this.app.userId })
      });
      
      this.incomingRequests = this.incomingRequests.filter(r => r.id !== requestId);
      this.renderRequests();
      this.updateDashboardUI();
      this.app.showToast('❌ Request denied and hidden', 'info');
    } catch (err) {
      console.error('Deny error:', err);
      this.app.showToast('Failed to deny request.', 'error');
    }
  }

  acceptRequest(requestId, incidentLocation) {
    if (!this.rescuerLocation) {
      this.app.showToast('⚠️ Your location is not available', 'error');
      return;
    }

    this.activeRequestId = requestId;

    this.app.socket.acceptRequest({
      requestId,
      rescuerId: this.app.userId,
      rescuerLocation: this.rescuerLocation,
      incidentLocation,
    });

    // Remove from incoming
    this.incomingRequests = this.incomingRequests.filter((r) => r.id !== requestId);
    this.renderRequests();
    this.updateDashboardUI();
    this.app.showToast('🚀 Request accepted! Opening navigation...', 'success');

    // Open Google Maps Directions in a new tab
    if (this.rescuerLocation && incidentLocation) {
      const origin = `${this.rescuerLocation.lat},${this.rescuerLocation.lng}`;
      const destination = `${incidentLocation.lat},${incidentLocation.lng}`;
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
      window.open(mapsUrl, '_blank');
    }

    // Start simulated location updates
    this.startLocationBroadcast(requestId, incidentLocation);
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
