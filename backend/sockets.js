const { Server } = require('socket.io');

let io;

function initSockets(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // =========== CITIZEN EVENTS ===========

    // Citizen triggers SOS
    socket.on('sos_triggered', (data) => {
      // data: { location: {lat, lng}, citizenId, photos, severity }
      console.log('Emergency reported:', data);
      
      // In a real implementation we would:
      // 1. Save to DB
      // 2. Query nearest rescuers (ST_DWithin)
      // 3. Emit only to nearest available rescuers
      
      // Emit to all rescuers for MVP
      io.to('rescuers').emit('incoming_rescue_request', {
        id: `mock-req-${Date.now()}`,
        ...data,
        timestamp: new Date()
      });
    });

    socket.on('cancel_request', (requestId) => {
      io.to(`request_${requestId}`).emit('request_cancelled', requestId);
    });

    socket.on('track_rescuer', (requestId) => {
      socket.join(`request_${requestId}`);
      console.log(`Citizen joined tracking room: request_${requestId}`);
    });

    // =========== RESCUER EVENTS ===========

    // Rescuer marks as available
    socket.on('go_available', (data) => {
      // data: { rescuerId, location: {lat, lng} }
      socket.join('rescuers');
      console.log(`Rescuer ${data.rescuerId} is now online and listening for requests`);
    });

    socket.on('go_offline', (data) => {
      socket.leave('rescuers');
      console.log(`Rescuer offline`);
    });

    // Rescuer accepts request
    socket.on('accept_request', (data) => {
      // data: { requestId, rescuerId, rescuerLocation }
      const { requestId, rescuerId, rescuerLocation } = data;
      
      // Create a private room for this request to track live updates
      socket.join(`request_${requestId}`);
      
      // Inform citizen that request was accepted
      // (Citizen should already be in the 'request_${requestId}' room or we broadcast to a specific citizen)
      io.emit('request_accepted', {
        requestId,
        rescuerId,
        rescuerLocation,
        estimatedArrivalMinutes: Math.floor(Math.random() * 10) + 2 // Mock ETA
      });
      
      console.log(`Rescuer ${rescuerId} accepted request ${requestId}`);
    });

    // Rescuer live location updates
    socket.on('update_location', (data) => {
      // data: { requestId, location: {lat, lng} }
      const { requestId, location } = data;
      
      // Broadcast to citizen waiting in that room
      io.to(`request_${requestId}`).emit('rescuer_location_update', {
        location,
        etaMinutes: Math.floor(Math.random() * 5) + 1 // Mock ETA update
      });
      
      // Update DB with live tracking periodically (not every tick for performance)
    });

    socket.on('mark_rescued', (data) => {
      // data: { requestId, healthData }
      const { requestId } = data;
      io.to(`request_${requestId}`).emit('rescue_completed', data);
      console.log(`Request ${requestId} marked as rescued`);
      
      // Update DB
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });
}

module.exports = { initSockets };
