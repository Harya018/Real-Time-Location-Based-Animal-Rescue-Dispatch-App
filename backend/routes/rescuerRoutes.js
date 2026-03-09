// =================================================
// RESCUER ROUTES - Availability & Location Management
// =================================================
const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { findNearestRescuers } = require('../services/nearestRescuer');

// POST /api/rescuers/:id/availability - Toggle rescuer availability
router.post('/:id/availability', (req, res) => {
  const { id } = req.params;
  const { is_available, lat, lng } = req.body;

  try {
    if (lat && lng) {
      db.prepare(
        `UPDATE users SET is_available = ?, lat = ?, lng = ?, last_active = datetime('now') WHERE id = ?`
      ).run(is_available ? 1 : 0, lat, lng, id);
    } else {
      db.prepare(
        `UPDATE users SET is_available = ?, last_active = datetime('now') WHERE id = ?`
      ).run(is_available ? 1 : 0, id);
    }

    const row = db.prepare('SELECT id, is_available, name FROM users WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Rescuer not found' });
    res.json(row);
  } catch (err) {
    console.error('[Rescuer] Availability error:', err.message);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// GET /api/rescuers/nearest?lat=X&lng=Y&radius=5 - Find nearest rescuers
router.get('/nearest', (req, res) => {
  const { lat, lng, radius } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  try {
    const rescuers = findNearestRescuers(
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
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT id, name, phone, is_available, trust_score, lat, lng, last_active
       FROM users WHERE role = 'rescuer'
       ORDER BY last_active DESC`
    ).all();
    res.json(rows);
  } catch (err) {
    console.error('[Rescuer] List error:', err.message);
    res.status(500).json({ error: 'Failed to list rescuers' });
  }
});

module.exports = router;
