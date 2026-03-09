// =================================================
// SERVER ENTRY POINT - Express + Socket.IO Bootstrap
// =================================================
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
require('dotenv').config();

// Import route modules
const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/reportRoutes');
const rescuerRoutes = require('./routes/rescuerRoutes');
const healthPassportRoutes = require('./routes/healthPassportRoutes');

// Import socket handler
const { initSockets } = require('./sockets/socketHandler');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initSockets(server);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), message: 'Animal Rescue Platform is active' });
});

// Mount feature routes
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/rescuers', rescuerRoutes);
app.use('/api/health-passports', healthPassportRoutes);

// Catch-all: serve frontend for any unmatched route
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🐾 Animal Rescue Platform running on http://localhost:${PORT}`);
  console.log(`   REST API: http://localhost:${PORT}/api`);
  console.log(`   Socket.IO: ws://localhost:${PORT}\n`);
});
