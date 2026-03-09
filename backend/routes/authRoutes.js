// =================================================
// AUTH ROUTES - User Registration & OTP Login
// =================================================
const express = require('express');
const router = express.Router();
const { db, generateId } = require('../config/database');

// POST /api/auth/login - Mock OTP Login (upserts user)
router.post('/login', (req, res) => {
  const { phone, role, name } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  try {
    // Check if user already exists
    const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

    let user;
    if (existing) {
      db.prepare('UPDATE users SET last_active = datetime(\'now\') WHERE phone = ?').run(phone);
      user = db.prepare('SELECT id, role, phone, name, trust_score FROM users WHERE phone = ?').get(phone);
    } else {
      const id = generateId();
      db.prepare(
        'INSERT INTO users (id, phone, role, name, trust_score) VALUES (?, ?, ?, ?, 1.0)'
      ).run(id, phone, role || 'citizen', name || null);
      user = { id, role: role || 'citizen', phone, name: name || null, trust_score: 1.0 };
    }

    res.json({
      user,
      token: 'mock-jwt-' + user.id,
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// GET /api/auth/user/:id - Get user profile
router.get('/user/:id', (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, role, phone, name, is_available, trust_score, created_at FROM users WHERE id = ?'
    ).get(req.params.id);

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('[Auth] Get user error:', err.message);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

module.exports = router;
