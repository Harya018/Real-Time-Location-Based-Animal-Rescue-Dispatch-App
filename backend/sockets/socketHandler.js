// =================================================
// SOCKET HANDLER - Real-time Communication Events
// =================================================
const { Server } = require('socket.io');
const { calculateETA } = require('../services/etaCalculation');

let io;

function initSockets(server) {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // =========== CITIZEN EVENTS ===========

    // SOS Triggered — citizen reports an animal in distress
    socket.on('sos_triggered', (data) => {
      // data: { location: {lat, lng}, citizenId, description, severity, photos }
      console.log('[Socket] SOS triggered:', data);

      const request = {
        id: `req-${Date.now()}`,
        ...data,
        timestamp: new Date(),
      };

      // Join room for this request so citizen gets updates
      socket.join(`request_${request.id}`);

      // Broadcast to all available rescuers
      io.to('rescuers').emit('incoming_rescue_request', request);

      // Confirm to reporting citizen
      socket.emit('sos_confirmed', { requestId: request.id });
    });

    // Citizen cancels their request
    socket.on('cancel_request', (requestId) => {
      io.to(`request_${requestId}`).emit('request_cancelled', { requestId });
      console.log(`[Socket] Request ${requestId} cancelled`);
    });

    // Citizen starts tracking the rescuer
    socket.on('track_rescuer', (requestId) => {
      socket.join(`request_${requestId}`);
      console.log(`[Socket] Citizen tracking request: ${requestId}`);
    });

    // =========== RESCUER EVENTS ===========

    // Rescuer goes online / available
    socket.on('go_available', (data) => {
      // data: { rescuerId, location: {lat, lng}, name }
      socket.join('rescuers');
      socket.rescuerId = data.rescuerId;
      socket.rescuerName = data.name;
      console.log(`[Socket] Rescuer online: ${data.name || data.rescuerId}`);

      // Broadcast updated rescuer count
      const rescuerCount = io.sockets.adapter.rooms.get('rescuers')?.size || 0;
      io.emit('rescuer_count_update', { online: rescuerCount });
    });

    // Rescuer goes offline
    socket.on('go_offline', () => {
      socket.leave('rescuers');
      console.log(`[Socket] Rescuer offline: ${socket.rescuerName || socket.id}`);

      const rescuerCount = io.sockets.adapter.rooms.get('rescuers')?.size || 0;
      io.emit('rescuer_count_update', { online: rescuerCount });
    });

    // Rescuer accepts a rescue request
    socket.on('accept_request', (data) => {
      // data: { requestId, rescuerId, rescuerLocation: {lat, lng}, incidentLocation: {lat, lng} }
      const { requestId, rescuerId, rescuerLocation, incidentLocation } = data;

      socket.join(`request_${requestId}`);

      // Calculate ETA
      const eta = incidentLocation
        ? calculateETA(rescuerLocation, incidentLocation)
        : { minutes: Math.floor(Math.random() * 10) + 2 };

      // Notify citizen
      io.to(`request_${requestId}`).emit('request_accepted', {
        requestId,
        rescuerId,
        rescuerName: socket.rescuerName || 'Rescuer',
        rescuerLocation,
        eta,
      });

      console.log(`[Socket] Rescuer ${rescuerId} accepted request ${requestId}, ETA: ${eta.minutes} min`);
    });

    // Rescuer sends live location updates during rescue
    socket.on('update_location', (data) => {
      // data: { requestId, location: {lat, lng}, incidentLocation: {lat, lng} }
      const { requestId, location, incidentLocation } = data;

      const eta = incidentLocation
        ? calculateETA(location, incidentLocation)
        : { minutes: Math.floor(Math.random() * 5) + 1 };

      io.to(`request_${requestId}`).emit('rescuer_location_update', {
        location,
        eta,
        timestamp: new Date(),
      });
    });

    // Rescuer marks rescue as complete
    socket.on('mark_rescued', (data) => {
      // data: { requestId, healthData }
      io.to(`request_${data.requestId}`).emit('rescue_completed', {
        ...data,
        completedAt: new Date(),
      });
      console.log(`[Socket] Request ${data.requestId} marked as rescued`);
    });

    // =========== DISCONNECT ===========

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      const rescuerCount = io.sockets.adapter.rooms.get('rescuers')?.size || 0;
      io.emit('rescuer_count_update', { online: rescuerCount });
    });
  });
}

function getIO() {
  return io;
}

module.exports = { initSockets, getIO };
