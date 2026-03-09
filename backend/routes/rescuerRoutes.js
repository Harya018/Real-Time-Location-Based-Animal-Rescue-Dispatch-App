// =================================================
// RESCUER ROUTES - Availability & Location Management
// =================================================
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { findNearestRescuers } = require('../services/nearestRescuer');

// POST /api/rescuers/:id/availability - Toggle rescuer availability
router.post('/:id/availability', async (req, res) => {
  const { id } = req.params;
  const { is_available, lat, lng } = req.body;

  try {
    let query, params;
    if (lat && lng) {
      query = `UPDATE users SET is_available = $1, current_location = ST_SetSRID(ST_Point($3, $4), 4326), last_active = NOW()
               WHERE id = $2 RETURNING id, is_available, name`;
      params = [is_available, id, lng, lat];
    } else {
      query = `UPDATE users SET is_available = $1, last_active = NOW()
               WHERE id = $2 RETURNING id, is_available, name`;
      params = [is_available, id];
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rescuer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Rescuer] Availability error:', err.message);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// GET /api/rescuers/nearest?lat=X&lng=Y&radius=5 - Find nearest rescuers
router.get('/nearest', async (req, res) => {
  const { lat, lng, radius } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  try {
    const rescuers = await findNearestRescuers(
      { lat: parseFloat(lat), lng: parseFloat(lng) },
      parseFloat(radius) || 5
    );
    res.json(rescuers);
  } catch (err) {
    console.error('[Rescuer] Find nearest error:', err.message);
    res.status(500).json({ error: 'Failed to find nearest rescuers' });
  }
});

// GET /api/rescuers - List all rescuers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone, is_available, trust_score,
              ST_Y(current_location::geometry) as lat,
              ST_X(current_location::geometry) as lng,
              last_active
       FROM users WHERE role = 'rescuer'
       ORDER BY last_active DESC NULLS LAST`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Rescuer] List error:', err.message);
    res.status(500).json({ error: 'Failed to list rescuers' });
  }
});

module.exports = router;
