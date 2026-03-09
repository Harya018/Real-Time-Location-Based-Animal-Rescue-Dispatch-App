// =================================================
// MAP MANAGER - Google Maps initialization & helpers
// =================================================

class MapManager {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.map = null;
    this.markers = {};
    this.userMarker = null;
    this.rescuerMarkers = {};
    this.defaultCenter = options.center || { lat: 12.9716, lng: 77.5946 }; // Bangalore default
    this.defaultZoom = options.zoom || 13;
    this._initAttempts = 0;
  }

  init() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('[Map] Container not found:', this.containerId);
      return this;
    }

    // Add loading indicator if not present
    if (!container.querySelector('.map-status')) {
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
      container.style.background = '#1a1a2e';
      container.innerHTML = `<div class="map-status" style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
        <div class="spinner" style="margin-bottom:10px">⏳</div>
        Initializing Satellite Uplink...
      </div>`;
    }

    // The keyless Maps API loads google.maps asynchronously
    if (typeof google === 'undefined' || !google.maps || !google.maps.Map) {
      if (this._initAttempts < 30) {
        this._initAttempts++;
        setTimeout(() => this.init(), 500);
      } else {
        console.error('[Map] Google Maps API failed to load after 15s');
        container.innerHTML = `<div class="map-status" style="color:var(--accent-danger);padding:20px;text-align:center">
          <div style="font-size:2rem;margin-bottom:10px">🛰️</div>
          <strong>Satellite Connection Failed</strong><br/>
          <span style="font-size:0.8rem;opacity:0.7">The Map service is currently unavailable. Live tracking is still active in the dashboard.</span>
        </div>`;
      }
      return this;
    }

    try {
      // Clear loading status before creating map
      container.innerHTML = '';
      container.style.display = 'block'; 
      this.map = new google.maps.Map(container, {
        center: this.defaultCenter,
        zoom: this.defaultZoom,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: {
          position: google.maps.ControlPosition.RIGHT_BOTTOM,
        },
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#8888aa' }] },
          {
            featureType: 'administrative.locality',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#b8b8d4' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#2a2a4a' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#1e1e3a' }],
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry',
            stylers: [{ color: '#3a3a5c' }],
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#2a2a4a' }],
          },
          {
            featureType: 'transit',
            elementType: 'geometry',
            stylers: [{ color: '#2a2a4e' }],
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#0e1626' }],
          },
          {
            featureType: 'water',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#4e6d8c' }],
          },
          {
            featureType: 'poi',
            elementType: 'geometry',
            stylers: [{ color: '#1e1e38' }],
          },
          {
            featureType: 'poi',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#6e6e8e' }],
          },
          {
            featureType: 'poi.park',
            elementType: 'geometry',
            stylers: [{ color: '#1a2e1a' }],
          },
        ],
      });
    } catch (err) {
      console.error('[Map] Init error:', err);
      // Retry after a delay
      if (this._initAttempts < 30) {
        this._initAttempts++;
        setTimeout(() => this.init(), 500);
      }
    }

    return this;
  }

  // Set view to user's current location
  async locateUser() {
    // Wait for map to be ready
    if (!this.map) {
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.map) { clearInterval(check); resolve(); }
        }, 300);
        setTimeout(() => { clearInterval(check); resolve(); }, 15000);
      });
    }
    if (!this.map) throw new Error('Map not initialized');

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const position = { lat: latitude, lng: longitude };
          this.map.setCenter(position);
          this.map.setZoom(15);

          // Remove previous user marker
          if (this.userMarker) this.userMarker.setMap(null);

          // User marker with custom icon
          this.userMarker = new google.maps.Marker({
            position,
            map: this.map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#6366f1',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3,
            },
            title: 'You',
            zIndex: 999,
          });

          // Pulsing circle around user
          new google.maps.Circle({
            center: position,
            radius: 40,
            strokeColor: '#6366f1',
            strokeOpacity: 0.4,
            strokeWeight: 1,
            fillColor: '#6366f1',
            fillOpacity: 0.15,
            map: this.map,
          });

          resolve({ lat: latitude, lng: longitude });
        },
        (err) => reject(err),
        { enableHighAccuracy: true }
      );
    });
  }

  // Add incident marker
  addIncidentMarker(id, lat, lng, severity = 'moderate') {
    if (!this.map) {
      // Retry when map is ready
      setTimeout(() => this.addIncidentMarker(id, lat, lng, severity), 500);
      return null;
    }

    // Remove existing marker with same id
    if (this.markers[id]) {
      this.removeMarker(id);
    }

    const colors = { critical: '#ef4444', moderate: '#f59e0b', stable: '#10b981' };
    const color = colors[severity] || colors.moderate;

    const marker = new google.maps.Marker({
      position: { lat, lng },
      map: this.map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: color,
        fillOpacity: 0.7,
        strokeColor: color,
        strokeWeight: 2,
      },
      title: `Incident (${severity})`,
    });

    // Ripple circle
    const ripple = new google.maps.Circle({
      center: { lat, lng },
      radius: 80,
      strokeColor: color,
      strokeOpacity: 0.3,
      strokeWeight: 1,
      fillColor: color,
      fillOpacity: 0.1,
      map: this.map,
    });

    this.markers[id] = { marker, ripple };
    return marker;
  }

  // Add rescuer as glowing orb
  addRescuerMarker(id, lat, lng, name = 'Rescuer') {
    if (!this.map) {
      setTimeout(() => this.addRescuerMarker(id, lat, lng, name), 500);
      return null;
    }

    if (this.rescuerMarkers[id]) {
      this.rescuerMarkers[id].setPosition({ lat, lng });
      return this.rescuerMarkers[id];
    }

    const marker = new google.maps.Marker({
      position: { lat, lng },
      map: this.map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#10b981',
        fillOpacity: 1,
        strokeColor: 'rgba(16,185,129,0.4)',
        strokeWeight: 3,
      },
      title: name,
    });

    this.rescuerMarkers[id] = marker;
    return marker;
  }

  // Update rescuer position smoothly
  updateRescuerPosition(id, lat, lng) {
    if (this.rescuerMarkers[id]) {
      this.rescuerMarkers[id].setPosition({ lat, lng });
    }
  }

  // Remove a marker
  removeMarker(id) {
    if (this.markers[id]) {
      this.markers[id].marker.setMap(null);
      this.markers[id].ripple.setMap(null);
      delete this.markers[id];
    }
  }

  // Force resize (for Google Maps, trigger resize event)
  invalidateSize() {
    if (this.map) {
      setTimeout(() => {
        google.maps.event.trigger(this.map, 'resize');
      }, 100);
    }
  }
}

window.MapManager = MapManager;
