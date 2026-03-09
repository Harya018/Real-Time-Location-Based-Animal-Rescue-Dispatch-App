// =================================================
// HEALTH PASSPORT ROUTES - Animal Medical Records
// =================================================
const express = require('express');
const router = express.Router();
const { db, generateId } = require('../config/database');

// POST /api/health-passports - Create health passport
router.post('/', (req, res) => {
  const { animal_type, rescue_request_id, treatment_history, vet_notes, rehab_center, status } = req.body;

  try {
    const id = generateId();
    db.prepare(
      `INSERT INTO health_passports (id, animal_type, rescue_request_id, treatment_history, vet_notes, rehab_center, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, animal_type, rescue_request_id, JSON.stringify(treatment_history || {}), vet_notes, rehab_center, status || 'in_treatment');

    const row = db.prepare('SELECT * FROM health_passports WHERE id = ?').get(id);
    res.status(201).json(row);
  } catch (err) {
    console.error('[HealthPassport] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create health passport' });
  }
});

// GET /api/health-passports/:id - Get health passport
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(
      `SELECT hp.*, rr.description as rescue_description,
              rr.lat as rescue_lat, rr.lng as rescue_lng
       FROM health_passports hp
       LEFT JOIN rescue_requests rr ON hp.rescue_request_id = rr.id
       WHERE hp.id = ?`
    ).get(req.params.id);

    if (!row) return res.status(404).json({ error: 'Health passport not found' });
    res.json(row);
  } catch (err) {
    console.error('[HealthPassport] Get error:', err.message);
    res.status(500).json({ error: 'Failed to get health passport' });
  }
});

// PATCH /api/health-passports/:id - Update treatment
router.patch('/:id', (req, res) => {
  const { treatment_history, vet_notes, status, rehab_center } = req.body;
  try {
    db.prepare(
      `UPDATE health_passports SET
        treatment_history = COALESCE(?, treatment_history),
        vet_notes = COALESCE(?, vet_notes),
        status = COALESCE(?, status),
        rehab_center = COALESCE(?, rehab_center)
       WHERE id = ?`
    ).run(
      treatment_history ? JSON.stringify(treatment_history) : null,
      vet_notes || null,
      status || null,
      rehab_center || null,
      req.params.id
    );

    const row = db.prepare('SELECT * FROM health_passports WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Health passport not found' });
    res.json(row);
  } catch (err) {
    console.error('[HealthPassport] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update health passport' });
  }
});

// GET /api/health-passports - List all health passports
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT id, animal_type, status, created_at, rehab_center
       FROM health_passports
       ORDER BY created_at DESC LIMIT 50`
    ).all();
    res.json(rows);
  } catch (err) {
    console.error('[HealthPassport] List error:', err.message);
    res.status(500).json({ error: 'Failed to list health passports' });
  }
});

module.exports = router;
