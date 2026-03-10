// =================================================
// SOCKET CLIENT - Real-time communication with backend
// =================================================

class SocketClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl || window.location.origin;
    this.socket = null;
    this.handlers = {};
  }

  connect() {
    this.socket = io(this.serverUrl, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket.id);
      this.emit('_connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.emit('_disconnected', reason);
    });

    // Relay server events to registered handlers
    const serverEvents = [
      'incoming_rescue_request',
      'sos_confirmed',
      'request_accepted',
      'rescuer_location_update',
      'rescue_completed',
      'request_cancelled',
      'request_timeout',
      'nearby_rescuers',
      'rescuer_count_update',
      'ai_report_ready',
      'active_rescuers_update',
    ];

    serverEvents.forEach((event) => {
      this.socket.on(event, (data) => {
        console.log(`[Socket] Event: ${event}`, data);
        this.emit(event, data);
      });
    });

    return this;
  }

  // Emit to server
  send(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    }
  }

  // Internal event system for UI handlers
  on(event, callback) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(callback);
  }

  off(event, callback) {
    if (this.handlers[event]) {
      this.handlers[event] = this.handlers[event].filter((h) => h !== callback);
    }
  }

  emit(event, data) {
    if (this.handlers[event]) {
      this.handlers[event].forEach((h) => h(data));
    }
  }

  // ===== Citizen Actions =====
  triggerSOS(data) {
    // data: { location, citizenId, description, severity }
    this.send('sos_triggered', data);
  }

  cancelRequest(requestId) {
    this.send('cancel_request', requestId);
  }

  trackRescuer(requestId) {
    this.send('track_rescuer', requestId);
  }

  // ===== Rescuer Actions =====
  goAvailable(data) {
    // data: { rescuerId, location, name }
    this.send('go_available', data);
  }

  goOffline() {
    this.send('go_offline');
  }

  acceptRequest(data) {
    // data: { requestId, rescuerId, rescuerLocation, incidentLocation }
    this.send('accept_request', data);
  }

  updateLocation(data) {
    // data: { requestId, location, incidentLocation }
    this.send('update_location', data);
  }

  markRescued(data) {
    // data: { requestId, healthData }
    this.send('mark_rescued', data);
  }
}

window.SocketClient = SocketClient;
