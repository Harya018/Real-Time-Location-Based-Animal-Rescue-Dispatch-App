// =================================================
// AUTH ROUTES - User Registration & OTP Login
// =================================================
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// POST /api/auth/login - Mock OTP Login (upserts user)
router.post('/login', async (req, res) => {
  const { phone, role, name } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  try {
    const result = await pool.query(
      `INSERT INTO users (phone, role, name, trust_score)
       VALUES ($1, $2, $3, 1.0)
       ON CONFLICT (phone) DO UPDATE SET last_active = NOW()
       RETURNING id, role, phone, name, trust_score`,
      [phone, role || 'citizen', name || null]
    );
    res.json({
      user: result.rows[0],
      token: 'mock-jwt-' + result.rows[0].id,
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// GET /api/auth/user/:id - Get user profile
router.get('/user/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, role, phone, name, is_available, trust_score, created_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Auth] Get user error:', err.message);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

module.exports = router;
