// =================================================
// CITIZEN MODE - SOS reporting, map, live dashboard & nav
// =================================================

class CitizenMode {
  constructor(app) {
    this.app = app;
    this.map = null;
    this.userLocation = null;
    this.activeRequestId = null;
    this.trackingMap = null;
    this.profileHistory = null;
    this.aiAssistant = null;
    this._refreshInterval = null;
  }

  init() {
    // Initialize citizen map
    this.map = new MapManager('citizen-map').init();
    this.map.locateUser().then((loc) => {
      this.userLocation = loc;
      this.map.showNearbyVets(loc); // Add Vet Clinics to Citizen Map
    }).catch(() => {
      this.userLocation = { lat: 12.9716, lng: 77.5946 }; // Fallback
      this.map.showNearbyVets(this.userLocation);
    });

    this.bindEvents();
    this.bindSocketEvents();
    this.bindNavigation();
    this.loadIncidentsFromAPI();

    // Initialize profile & history
    this.profileHistory = new ProfileHistory(this.app, 'citizen');
    this.profileHistory.init();

    // Initialize AI Report Preview
    if (window.AIReportPreview) {
      this.aiReportPreview = new AIReportPreview(this);
      this.aiReportPreview.init();
    }

    // Auto-refresh incidents every 15s
    this._refreshInterval = setInterval(() => this.loadIncidentsFromAPI(), 15000);
  }

  bindEvents() {
    // SOS Button
    document.getElementById('sos-button').addEventListener('click', () => {
      this.openSOSModal();
    });

    // SOS Form Submit
    document.getElementById('sos-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitSOS();
    });

    // Save Offline Button
    document.getElementById('save-offline-btn')?.addEventListener('click', () => {
      this.submitSOS(null, true); // true flag for explicit offline save
    });

    // Close SOS modal
    document.getElementById('sos-modal-close').addEventListener('click', () => {
      document.getElementById('sos-modal').classList.remove('active');
    });

    // Photo Upload Trigger
    const photoBtn = document.getElementById('photo-upload-btn');
    const photoInput = document.getElementById('sos-photo-input');
    const photoPreview = document.getElementById('photo-preview');
    const photoPlaceholder = photoBtn ? photoBtn.querySelector('.photo-placeholder') : null;

    if (photoBtn && photoInput) {
      photoBtn.addEventListener('click', () => photoInput.click());

      photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (photoPreview) {
              photoPreview.src = event.target.result;
              photoPreview.style.display = 'block';
            }
            if (photoPlaceholder) photoPlaceholder.style.display = 'none';
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Location Toggle
    const locTabs = document.querySelectorAll('.loc-tab');
    const manualGroup = document.getElementById('manual-location-group');
    const locPreview = document.getElementById('sos-location');

    locTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        locTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.mode;

        if (mode === 'manual') {
          manualGroup.style.display = 'block';
          locPreview.textContent = '📍 Manual coordinates will be resolved...';
        } else {
          manualGroup.style.display = 'none';
          this.updateAutoLocationDisplay();
        }
      });
    });

    // Priority Toggle Sync
    const priorityToggle = document.getElementById('sos-priority');
    const severitySelect = document.getElementById('sos-severity');
    if (priorityToggle && severitySelect) {
      priorityToggle.addEventListener('change', () => {
        if (priorityToggle.checked) {
          severitySelect.value = 'critical';
          severitySelect.disabled = true;
        } else {
          severitySelect.disabled = false;
        }
      });
    }

    // Modal backdrop close
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        e.target.closest('.modal').classList.remove('active');
      });
    });
  }

  updateAutoLocationDisplay() {
    const locEl = document.getElementById('sos-location');
    if (this.userLocation) {
      locEl.textContent = `📍 ${this.userLocation.lat.toFixed(4)}, ${this.userLocation.lng.toFixed(4)}`;
    } else {
      locEl.textContent = '🛰️ Detecting location...';
    }
  }

  // ===== NAVIGATION =====
  bindNavigation() {
    const nav = document.getElementById('citizen-nav');
    if (!nav) return;

    nav.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;

        // Update active button
        nav.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Handle special case: Health Passport opens modal
        if (view === 'passport') {
          document.getElementById('passport-modal').classList.add('active');
          return;
        }

        // Hide all views
        document.querySelectorAll('#citizen-screen .citizen-view').forEach((v) => {
          v.style.display = 'none';
          v.classList.remove('active-view');
        });

        // Show selected view
        const viewMap = {
          map: 'citizen-map-view',
          history: 'citizen-history-view',
          profile: 'citizen-profile-view',
          ai: 'citizen-ai-view',
        };

        const viewEl = document.getElementById(viewMap[view]);
        if (viewEl) {
          viewEl.style.display = 'flex';
          viewEl.classList.add('active-view');
        }

        // Resize map if switching back to map view
        if (view === 'map' && this.map) {
          this.map.invalidateSize();
        }

        // Refresh history when viewing
        if (view === 'history' && this.profileHistory) {
          this.profileHistory.loadHistory();
        }

        // Lazy-init AI assistant
        if (view === 'ai' && !this.aiAssistant && window.AIAssistant) {
          this.aiAssistant = new AIAssistant('citizen');
          this.aiAssistant.init();
        }
      });
    });
  }

  bindSocketEvents() {
    // SOS Confirmed
    this.app.socket.on('sos_confirmed', (data) => {
      this.activeRequestId = data.requestId;
      document.getElementById('sos-modal').classList.remove('active');
      this.app.showToast('🚨 SOS sent! Finding nearest rescuer...', 'info');

      // Start tracking
      this.app.socket.trackRescuer(data.requestId);
    });

    // Request Accepted by rescuer
    this.app.socket.on('request_accepted', (data) => {
      if (data.requestId === this.activeRequestId || !this.activeRequestId) {
        this.showTrackingModal(data);
        this.app.showToast(`🦸 ${data.rescuerName} is on the way!`, 'success');
      }
    });

    // Rescuer location updates
    this.app.socket.on('rescuer_location_update', (data) => {
      if (this.trackingMap && data.location) {
        this.trackingMap.updateRescuerPosition('active-rescuer', data.location.lat, data.location.lng);
        document.getElementById('tracking-eta').textContent = data.eta?.minutes || '--';
        document.getElementById('tracking-distance').textContent = `${data.eta?.distanceKm || '?'} km away`;
      }
    });

    // Rescue completed
    this.app.socket.on('rescue_completed', (data) => {
      document.getElementById('tracking-modal').classList.remove('active');
      this.activeRequestId = null;
      this.app.showToast('🎉 Animal rescued successfully!', 'success');
      this.loadIncidentsFromAPI(); // Refresh
    });

    // Rescuer count
    this.app.socket.on('rescuer_count_update', (data) => {
      document.getElementById('online-rescuers').textContent = data.online || 0;
    });

    // New incoming request → also add to citizen map
    this.app.socket.on('incoming_rescue_request', (data) => {
      if (data.location && this.map) {
        this.map.addIncidentMarker(
          data.id,
          data.location.lat,
          data.location.lng,
          data.severity || 'moderate',
          data.description,
          data.photo ? [data.photo] : []
        );
      }
    });

    // Active Rescuers live updates
    this.app.socket.on('active_rescuers_update', (rescuers) => {
      if (!this.map) return;
      
      const currentIds = new Set(rescuers.map(r => r.id));
      
      // Remove rescuers that went offline
      Object.keys(this.map.rescuerMarkers).forEach(id => {
         if (!currentIds.has(id)) {
            this.map.rescuerMarkers[id].setMap(null);
            delete this.map.rescuerMarkers[id];
         }
      });
      
      // Plot or update online rescuers
      rescuers.forEach(r => {
        if (r.location && r.location.lat && r.location.lng) {
            this.map.addRescuerMarker(r.id, r.location.lat, r.location.lng, r.name);
        }
      });
    });
  }

  openSOSModal() {
    const modal = document.getElementById('sos-modal');
    modal.classList.add('active');

    // Update location display
    const locEl = document.getElementById('sos-location');
    if (this.userLocation) {
      locEl.textContent = `📍 ${this.userLocation.lat.toFixed(4)}, ${this.userLocation.lng.toFixed(4)}`;
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          locEl.textContent = `📍 ${this.userLocation.lat.toFixed(4)}, ${this.userLocation.lng.toFixed(4)}`;
        },
        () => {
          locEl.textContent = '⚠️ Location unavailable — using default';
          this.userLocation = { lat: 12.9716, lng: 77.5946 };
        }
      );
    }
  }

  async submitSOS(aiData = null, forceOffline = false) {
    const animalType = aiData?.animalType || document.getElementById('sos-animal-type')?.value || 'other';
    const isPriority = aiData ? (aiData.severity === 'critical') : (document.getElementById('sos-priority')?.checked || false);
    const severity = aiData?.severity || (isPriority ? 'critical' : (document.getElementById('sos-severity')?.value || 'moderate'));
    const description = aiData?.description || document.getElementById('sos-description')?.value || '';
    const isManual = aiData ? !!aiData.location?.address : (document.querySelector('.loc-tab.active')?.dataset.mode === 'manual');
    const manualAddress = aiData?.location?.address || document.getElementById('manual-address')?.value || '';
    const photoPreview = document.getElementById('photo-preview');
    const photos = aiData?.photos || (photoPreview?.src ? [photoPreview.src] : []);

    let finalLocation = aiData?.location || this.userLocation;

    if (!aiData && isManual && manualAddress) {
      finalLocation = {
        lat: (this.userLocation?.lat || 12.9716) + (Math.random() - 0.5) * 0.01,
        lng: (this.userLocation?.lng || 77.5946) + (Math.random() - 0.5) * 0.01,
        address: manualAddress
      };
    }

    const payload = {
      location: finalLocation,
      citizen_id: this.app.userId,
      lat: finalLocation?.lat,
      lng: finalLocation?.lng,
      animalType,
      description: aiData ? description : `${isPriority ? '[PRIORITY] ' : ''}${animalType.toUpperCase()}: ${description}`,
      severity,
      photos,
      isManual,
      isPriority,
      ai_analysis: aiData?.ai_analysis || null
    };

    if (!payload.lat || !payload.lng) {
      this.app.showToast('⚠️ Location missing! Please enable GPS.', 'error');
      return false;
    }

    // Explicit Offline Save
    if (forceOffline && window.offlineManager) {
      await window.offlineManager.queueReport(payload);
      this.app.showToast('💾 Report saved offline. You can upload it later from History.', 'success');
      const modal = document.getElementById('sos-modal');
      if (modal) modal.classList.remove('active');
      return true;
    }

    this.app.showToast(isPriority ? '🚨 PRIORITY SIGNAL SENT!' : '📡 Sending rescue signal...', isPriority ? 'error' : 'info');

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Submission failed');
      const data = await res.json();
      
      this.app.showToast('✅ Signal received! Rescuers notified.', 'success');
      this.activeRequestId = data.id;
      this.app.socket.trackRescuer(data.id);
      
      const modal = document.getElementById('sos-modal');
      if (modal) modal.classList.remove('active');
      
      this.loadIncidentsFromAPI();
      return true;
    } catch (err) {
      console.error('[SOS] Submission error:', err);
      // If offline, queue the report automatically
      if (window.offlineManager) {
        await window.offlineManager.queueReport(payload);
        this.app.showToast('📱 No internet — report saved offline. Will sync automatically.', 'info');
        const modal = document.getElementById('sos-modal');
        if (modal) modal.classList.remove('active');
        return true;
      }
      this.app.showToast('❌ Failed to send rescue signal. Check connection.', 'error');
      return false;
    }
  }

  showTrackingModal(data) {
    const modal = document.getElementById('tracking-modal');
    modal.classList.add('active');

    document.getElementById('tracking-eta').textContent = data.eta?.minutes || '--';
    document.getElementById('tracking-rescuer-name').textContent = data.rescuerName || 'Rescuer';
    document.getElementById('tracking-distance').textContent = `${data.eta?.distanceKm || '?'} km away`;

    // Initialize tracking map
    setTimeout(() => {
      if (!this.trackingMap) {
        this.trackingMap = new MapManager('tracking-map', {
          center: { lat: this.userLocation.lat, lng: this.userLocation.lng },
          zoom: 14,
        }).init();
      }
      this.trackingMap.invalidateSize();

      // Show incident location
      this.trackingMap.addIncidentMarker('incident', this.userLocation.lat, this.userLocation.lng, 'critical');

      // Show rescuer
      if (data.rescuerLocation) {
        this.trackingMap.addRescuerMarker('active-rescuer', data.rescuerLocation.lat, data.rescuerLocation.lng, data.rescuerName);
      }
    }, 200);
  }

  // ===== LIVE DATA FROM API =====
  async loadIncidentsFromAPI() {
    // Refresh offline list too
    window.offlineManager?.renderOfflineList();

    try {
      const res = await fetch('/api/reports');
      if (!res.ok) throw new Error('HTTP error');
      const reports = await res.json();

      this.renderIncidentCards(reports);
      this.plotIncidentsOnMap(reports);

      document.getElementById('active-requests').textContent =
        reports.filter((r) => r.status === 'pending' || r.status === 'accepted').length;
    } catch (err) {
      console.log('[Citizen] Could not fetch reports, using mock data:', err.message);
      this.loadMockIncidents();
    }
  }

  renderIncidentCards(reports) {
    const container = document.getElementById('incident-cards');
    const activeReports = reports.filter((r) => r.status === 'pending' || r.status === 'accepted');

    if (activeReports.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = activeReports
      .slice(0, 5) // Show max 5
      .map(
        (inc, i) => `
      <div class="incident-card ${inc.severity || 'moderate'} antigravity-float" style="--delay:${i * 0.2}s">
        <h4>🐾 ${(inc.severity || 'moderate').toUpperCase()}</h4>
        <p>${inc.description || 'Animal in distress'}</p>
        <div class="incident-meta">
          <span>${inc.created_at ? this.timeAgo(inc.created_at) : 'Just now'}</span>
          <span class="badge badge-${inc.severity || 'moderate'}">${(inc.status || 'pending').toUpperCase()}</span>
        </div>
      </div>
    `
      )
      .join('');
  }

  plotIncidentsOnMap(reports) {
    if (!this.map) return;

    // Clear old markers
    Object.keys(this.map.markers).forEach((id) => this.map.removeMarker(id));

    // Add markers for active reports
    reports
      .filter((r) => r.status === 'pending' || r.status === 'accepted')
      .forEach((r) => {
        if (r.lat && r.lng) {
          let photos = [];
          try { photos = r.photos ? JSON.parse(r.photos) : []; } catch (e) {}
          this.map.addIncidentMarker(r.id, Number(r.lat), Number(r.lng), r.severity || 'moderate', r.description, photos);
        }
      });
  }

  loadMockIncidents() {
    const mockIncidents = [
      { id: 1, severity: 'critical', description: 'Injured dog found near Main Street', time: '2 min ago', lat: 12.975, lng: 77.590 },
      { id: 2, severity: 'moderate', description: 'Stray kitten stuck in drain', time: '8 min ago', lat: 12.968, lng: 77.598 },
      { id: 3, severity: 'stable', description: 'Bird with broken wing at park', time: '15 min ago', lat: 12.980, lng: 77.585 },
    ];

    const container = document.getElementById('incident-cards');
    container.innerHTML = mockIncidents
      .map(
        (inc, i) => `
      <div class="incident-card ${inc.severity} antigravity-float" style="--delay:${i * 0.2}s">
        <h4>🐾 ${inc.severity.toUpperCase()}</h4>
        <p>${inc.description}</p>
        <div class="incident-meta">
          <span>${inc.time}</span>
          <span class="badge badge-${inc.severity}">${inc.severity}</span>
        </div>
      </div>
    `
      )
      .join('');

    document.getElementById('active-requests').textContent = mockIncidents.length;

    // Plot on map
    if (this.map) {
      mockIncidents.forEach((inc) => {
        this.map.addIncidentMarker(inc.id, inc.lat, inc.lng, inc.severity);
      });
    }
  }

  timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
}

window.CitizenMode = CitizenMode;
