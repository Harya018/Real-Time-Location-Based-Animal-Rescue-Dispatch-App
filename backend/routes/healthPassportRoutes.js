// =================================================
// HEALTH PASSPORT ROUTES - Animal Medical Records
// =================================================
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// POST /api/health-passports - Create health passport
router.post('/', async (req, res) => {
  const { animal_type, rescue_request_id, treatment_history, vet_notes, rehab_center, status } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO health_passports (animal_type, rescue_request_id, treatment_history, vet_notes, rehab_center, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [animal_type, rescue_request_id, JSON.stringify(treatment_history || {}), vet_notes, rehab_center, status || 'in_treatment']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[HealthPassport] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create health passport' });
  }
});

// GET /api/health-passports/:id - Get health passport
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT hp.*, rr.description as rescue_description,
              ST_Y(rr.animal_location::geometry) as rescue_lat,
              ST_X(rr.animal_location::geometry) as rescue_lng
       FROM health_passports hp
       LEFT JOIN rescue_requests rr ON hp.rescue_request_id = rr.id
       WHERE hp.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Health passport not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[HealthPassport] Get error:', err.message);
    res.status(500).json({ error: 'Failed to get health passport' });
  }
});

// PATCH /api/health-passports/:id - Update treatment
router.patch('/:id', async (req, res) => {
  const { treatment_history, vet_notes, status, rehab_center } = req.body;
  try {
    const result = await pool.query(
      `UPDATE health_passports SET
        treatment_history = COALESCE($1, treatment_history),
        vet_notes = COALESCE($2, vet_notes),
        status = COALESCE($3, status),
        rehab_center = COALESCE($4, rehab_center)
       WHERE id = $5 RETURNING *`,
      [
        treatment_history ? JSON.stringify(treatment_history) : null,
        vet_notes || null,
        status || null,
        rehab_center || null,
        req.params.id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Health passport not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[HealthPassport] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update health passport' });
  }
});

// GET /api/health-passports - List all health passports
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT hp.id, hp.animal_type, hp.status, hp.created_at, hp.rehab_center
       FROM health_passports hp
       ORDER BY hp.created_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[HealthPassport] List error:', err.message);
    res.status(500).json({ error: 'Failed to list health passports' });
  }
});

module.exports = router;
