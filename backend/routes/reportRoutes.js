// =================================================
// REPORT ROUTES - Rescue Request CRUD
// =================================================
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { detectFakeReport } = require('../services/fakeReportDetection');

// POST /api/reports - Create a new rescue request
router.post('/', async (req, res) => {
  const { citizen_id, lat, lng, description, severity, photos } = req.body;

  if (!citizen_id || !lat || !lng) {
    return res.status(400).json({ error: 'citizen_id, lat, lng are required' });
  }

  try {
    // Fake report check
    const fakeCheck = await detectFakeReport(citizen_id, { lat, lng });
    if (fakeCheck.flag) {
      return res.status(403).json({
        error: 'Report flagged',
        reason: fakeCheck.reason,
      });
    }

    const result = await pool.query(
      `INSERT INTO rescue_requests
       (citizen_id, animal_location, description, severity, photos, status)
       VALUES ($1, ST_SetSRID(ST_Point($2, $3), 4326), $4, $5, $6, 'pending')
       RETURNING id, status, created_at`,
      [citizen_id, lng, lat, description, severity || 'moderate', photos || []]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[Report] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create rescue request' });
  }
});

// GET /api/reports - List all rescue requests (with optional status filter)
router.get('/', async (req, res) => {
  const { status } = req.query;
  try {
    let query = `SELECT rr.id, rr.description, rr.severity, rr.status, rr.created_at,
                        ST_Y(rr.animal_location::geometry) as lat,
                        ST_X(rr.animal_location::geometry) as lng,
                        u.name as citizen_name, u.phone as citizen_phone
                 FROM rescue_requests rr
                 LEFT JOIN users u ON rr.citizen_id = u.id`;
    const params = [];
    if (status) {
      query += ` WHERE rr.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY rr.created_at DESC LIMIT 50`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[Report] List error:', err.message);
    res.status(500).json({ error: 'Failed to list reports' });
  }
});

// GET /api/reports/:id - Get single rescue request
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT rr.*, ST_Y(rr.animal_location::geometry) as lat,
              ST_X(rr.animal_location::geometry) as lng,
              u.name as citizen_name
       FROM rescue_requests rr
       LEFT JOIN users u ON rr.citizen_id = u.id
       WHERE rr.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Report] Get error:', err.message);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// PATCH /api/reports/:id/status - Update report status
router.patch('/:id/status', async (req, res) => {
  const { status, accepted_by } = req.body;
  try {
    let query, params;
    if (status === 'accepted' && accepted_by) {
      query = `UPDATE rescue_requests SET status = $1, accepted_by = $2, accepted_at = NOW() WHERE id = $3 RETURNING *`;
      params = [status, accepted_by, req.params.id];
    } else if (status === 'rescued') {
      query = `UPDATE rescue_requests SET status = $1, completed_at = NOW() WHERE id = $2 RETURNING *`;
      params = [status, req.params.id];
    } else {
      query = `UPDATE rescue_requests SET status = $1 WHERE id = $2 RETURNING *`;
      params = [status, req.params.id];
    }
    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Report] Update status error:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
