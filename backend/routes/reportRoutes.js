// =================================================
// REPORT ROUTES - Rescue Request CRUD
// =================================================
const express = require('express');
const router = express.Router();
const { db, generateId } = require('../config/database');
const { detectFakeReport } = require('../services/fakeReportDetection');

// POST /api/reports - Create a new rescue request
router.post('/', (req, res) => {
  const { citizen_id, lat, lng, description, severity, photos } = req.body;

  if (!citizen_id || !lat || !lng) {
    return res.status(400).json({ error: 'citizen_id, lat, lng are required' });
  }

  try {
    // Fake report check
    const fakeCheck = detectFakeReport(citizen_id, { lat, lng });
    if (fakeCheck.flag) {
      return res.status(403).json({
        error: 'Report flagged',
        reason: fakeCheck.reason,
      });
    }

    const id = generateId();
    const photosJson = JSON.stringify(photos || []);
    db.prepare(
      `INSERT INTO rescue_requests (id, citizen_id, lat, lng, description, severity, photos, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(id, citizen_id, lat, lng, description, severity || 'moderate', photosJson);

    const row = db.prepare('SELECT id, status, created_at FROM rescue_requests WHERE id = ?').get(id);
    res.status(201).json(row);
  } catch (err) {
    console.error('[Report] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create rescue request' });
  }
});

// GET /api/reports - List all rescue requests (with optional status filter)
router.get('/', (req, res) => {
  const { status } = req.query;
  try {
    let query = `SELECT rr.id, rr.description, rr.severity, rr.status, rr.created_at,
                        rr.lat, rr.lng, rr.photos,
                        u.name as citizen_name, u.phone as citizen_phone
                 FROM rescue_requests rr
                 LEFT JOIN users u ON rr.citizen_id = u.id`;
    const params = [];
    if (status) {
      query += ` WHERE rr.status = ?`;
      params.push(status);
    }
    query += ` ORDER BY rr.created_at DESC LIMIT 50`;

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    console.error('[Report] List error:', err.message);
    res.status(500).json({ error: 'Failed to list reports' });
  }
});

// GET /api/reports/:id - Get single rescue request
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(
      `SELECT rr.*, u.name as citizen_name
       FROM rescue_requests rr
       LEFT JOIN users u ON rr.citizen_id = u.id
       WHERE rr.id = ?`
    ).get(req.params.id);

    if (!row) return res.status(404).json({ error: 'Report not found' });
    res.json(row);
  } catch (err) {
    console.error('[Report] Get error:', err.message);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// PATCH /api/reports/:id/status - Update report status
router.patch('/:id/status', (req, res) => {
  const { status, accepted_by } = req.body;
  try {
    if (status === 'accepted' && accepted_by) {
      db.prepare(
        `UPDATE rescue_requests SET status = ?, accepted_by = ?, accepted_at = datetime('now') WHERE id = ?`
      ).run(status, accepted_by, req.params.id);
    } else if (status === 'rescued') {
      db.prepare(
        `UPDATE rescue_requests SET status = ?, completed_at = datetime('now') WHERE id = ?`
      ).run(status, req.params.id);
    } else {
      db.prepare(
        `UPDATE rescue_requests SET status = ? WHERE id = ?`
      ).run(status, req.params.id);
    }

    const row = db.prepare('SELECT * FROM rescue_requests WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (err) {
    console.error('[Report] Update status error:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
