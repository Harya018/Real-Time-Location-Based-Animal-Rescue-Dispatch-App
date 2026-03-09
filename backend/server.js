const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const http = require('http');
const { initSockets } = require('./sockets');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSockets(server);

app.use(cors());
app.use(express.json());

// Postgres Connection Pool
const pool = new Pool({
  user: process.env.DB_USER || 'user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'rescue_platform',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Middleware to inject db pool
app.use((req, res, next) => {
  req.db = pool;
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Rescue Platform Backend is active' });
});

// Mock Auth endpoint (OTP)
app.post('/api/auth/login', async (req, res) => {
  const { phone, role } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });
  
  try {
    // Upsert user for hackathon MVP purposes
    const result = await req.db.query(
      `INSERT INTO users (phone, role, trust_score) 
       VALUES ($1, $2, 1.0) 
       ON CONFLICT (phone) DO UPDATE SET last_active = NOW() 
       RETURNING id, role, phone, name`,
      [phone, role || 'citizen']
    );
    res.json({ user: result.rows[0], token: 'mock-jwt-token-replace-later' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Create Rescue Request
app.post('/api/reports', async (req, res) => {
  const { citizen_id, lat, lng, description, severity } = req.body;
  
  if (!citizen_id || !lat || !lng) {
    return res.status(400).json({ error: 'Missing required report fields' });
  }

  try {
    // In a real app, call detectFakeReport(citizen_id, {lat, lng}) here
    const point = `POINT(${lng} ${lat})`;

    const result = await req.db.query(
      `INSERT INTO rescue_requests 
       (citizen_id, animal_location, description, severity, status) 
       VALUES ($1, ST_SetSRID(ST_Point($2, $3), 4326), $4, $5, 'pending') 
       RETURNING id, status, created_at`,
      [citizen_id, lng, lat, description, severity || 'moderate']
    );
    
    // Nearest Rescuer Matching Trigger could go here
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create rescue request' });
  }
});

// Update Rescuer Availability
app.post('/api/rescuers/:id/availability', async (req, res) => {
  const { id } = req.params;
  const { is_available, lat, lng } = req.body;

  try {
    const pointQuery = (lat && lng) ? `ST_SetSRID(ST_Point($2, $3), 4326)` : 'current_location';
    const params = [is_available, id];
    
    let query = `UPDATE users SET is_available = $1 WHERE id = $2 RETURNING id, is_available`;
    if (lat && lng) {
      query = `UPDATE users SET is_available = $1, current_location = ST_SetSRID(ST_Point($3, $4), 4326) WHERE id = $2 RETURNING id, is_available`;
      params.push(lng, lat);
    }
    
    const result = await req.db.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
