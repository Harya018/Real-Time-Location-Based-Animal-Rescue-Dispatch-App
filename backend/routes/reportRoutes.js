// =================================================
// REPORT ROUTES - Rescue Request CRUD
// =================================================
const express = require('express');
const router  = express.Router();
const { db, generateId } = require('../config/database');
const { detectFakeReport } = require('../services/fakeReportDetection');
const { getIO } = require('../sockets/socketHandler');

// ── Gemini AI setup ────────────────────────────────────────
let reportModel;
try {
  if (process.env.GEMINI_API_KEY) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    reportModel = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: `You are an expert animal rescue dispatcher.
When given a rescue incident, generate a concise professional triage report using EXACTLY this format:

## 🏷️ Incident Classification
- **Animal Type**: (detected from description or image)
- **Severity**: CRITICAL / MODERATE / STABLE
- **Estimated Condition**: (brief medical assessment)

## ⚠️ Immediate Risks
(2-3 bullet points)

## 🛠️ Recommended Equipment
(list items)

## 🚑 First Response Protocol
(numbered steps)

## 📍 Location Notes
(brief context about the location)

Keep the entire report under 300 words. Be direct and actionable.`,
    });
  }
} catch (e) {
  console.log('[AI Report] Gemini unavailable — will use fallback report');
}

// ── Generate AI triage report ──────────────────────────────
async function generateAIReport(description, severity, lat, lng, photos) {
  if (!reportModel) return buildFallbackReport(description, severity, lat, lng);
  try {
    const parts = [{
      text: `Animal rescue incident:
Description: ${description || 'No description provided'}
Severity: ${severity || 'moderate'}
Location: ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}
${photos?.length ? 'Photo attached — analyze visible condition.' : 'No photo provided.'}

Generate a full triage report.`
    }];

    // Include first image if it's a base64 data URL
    if (photos?.length && photos[0]?.startsWith('data:')) {
      const [meta, data] = photos[0].split(',');
      const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
      parts.push({ inlineData: { mimeType, data } });
    }

    const result = await reportModel.generateContent(parts);
    return result.response.text().trim();
  } catch (err) {
    console.error('[AI Report] Generation error:', err.message);
    return buildFallbackReport(description, severity, lat, lng);
  }
}

function buildFallbackReport(description, severity, lat, lng) {
  const sevLabel = { critical: 'CRITICAL 🔴', moderate: 'MODERATE 🟡', stable: 'STABLE 🟢' }[severity] || 'MODERATE 🟡';
  return `## 🏷️ Incident Classification
- **Severity**: ${sevLabel}
- **Estimated Condition**: Requires immediate rescuer assessment on-site

## ⚠️ Immediate Risks
- Animal may be in shock or acute distress
- Condition may deteriorate without rapid intervention
- Approach hazards possible depending on animal type

## 🛠️ Recommended Equipment
- First-aid kit (bandages, antiseptic, saline)
- Animal transport carrier / cage
- Protective gloves and bite-proof sleeve

## 🚑 First Response Protocol
1. Approach slowly — no sudden movements or loud sounds
2. Visually assess breathing, bleeding, and mobility
3. Do not move the animal unless in immediate danger
4. Stabilize and transport to nearest vet clinic

## 📍 Location Notes
Reported at ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}. Verify exact pin on the dispatch map.

*Note: Full AI analysis requires a Gemini API key in backend/.env*`;
}

// POST /api/reports - Create a new rescue request
router.post('/', async (req, res) => {
  const { citizen_id, lat, lng, description, severity, photos, ai_analysis } = req.body;

  if (!citizen_id || !lat || !lng) {
    return res.status(400).json({ error: 'citizen_id, lat, lng are required' });
  }

  try {
    // Get sender info
    let sender = db.prepare('SELECT name FROM users WHERE id = ?').get(citizen_id);
    
    // Auto-register guest user if missing (satisfy foreign key)
    if (!sender) {
      db.prepare('INSERT INTO users (id, role, name, phone) VALUES (?, ?, ?, ?)')
        .run(citizen_id, 'citizen', 'Guest Citizen', 'guest-' + citizen_id.slice(-6));
      sender = { name: 'Guest Citizen' };
    }
    const citizenName = sender.name;

    // Fake report check
    const fakeCheck = detectFakeReport(citizen_id, { lat, lng });
    if (fakeCheck.flag) {
      return res.status(403).json({ error: 'Report flagged', reason: fakeCheck.reason });
    }

    const id = generateId();
    const photosJson = JSON.stringify(photos || []);
    const analysisJson = ai_analysis ? JSON.stringify(ai_analysis) : null;
    db.prepare(
      `INSERT INTO rescue_requests (id, citizen_id, lat, lng, description, severity, photos, status, ai_analysis)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).run(id, citizen_id, lat, lng, description, severity || 'moderate', photosJson, analysisJson);

    const row = db.prepare('SELECT * FROM rescue_requests WHERE id = ?').get(id);
    res.status(201).json(row);

    // ── Broadcast to rescuers and citizen via Socket ────────────────
    try {
      const io = getIO();
      if (io) {
        const socketRequest = {
          id: row.id,
          location: { lat: row.lat, lng: row.lng },
          citizenId: row.citizen_id,
          description: row.description,
          severity: row.severity,
          photo: photos?.length ? photos[0] : null,
          timestamp: row.created_at,
          citizenName: citizenName
        };

        // Notify all rescuers
        io.to('rescuers').emit('incoming_rescue_request', socketRequest);
        
        // Notify the specific citizen who reported it (they should join a room based on requestId)
        // We'll let the citizen join the room in their frontend when they get the 201 response
      }
    } catch (e) {
      console.error('[Report] Socket broadcast error:', e.message);
    }

    // ── Non-blocking: generate AI report ──
    generateAIReport(description, severity || 'moderate', lat, lng, photos || [])
      .then(aiReport => {
        db.prepare('UPDATE rescue_requests SET ai_report = ? WHERE id = ?').run(aiReport, id);
        try {
          const io = getIO();
          if (io) io.to('rescuers').emit('ai_report_ready', { requestId: id, aiReport });
        } catch (_) {}
      })
      .catch(err => console.error('[AI Report] Async error:', err.message));

  } catch (err) {
    console.error('[Report] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create rescue request' });
  }
});

// GET /api/reports - List all rescue requests
router.get('/', (req, res) => {
  const { status } = req.query;
  try {
    let query = `SELECT rr.id, rr.description, rr.severity, rr.status, rr.created_at,
                        rr.lat, rr.lng, rr.photos, rr.ai_report,
                        u.name as citizen_name, u.phone as citizen_phone
                 FROM rescue_requests rr
                 LEFT JOIN users u ON rr.citizen_id = u.id`;
    const params = [];
    if (status) { query += ` WHERE rr.status = ?`; params.push(status); }
    query += ` ORDER BY rr.created_at DESC LIMIT 50`;

    res.json(db.prepare(query).all(...params));
  } catch (err) {
    console.error('[Report] List error:', err.message);
    res.status(500).json({ error: 'Failed to list reports' });
  }
});

// GET /api/reports/:id
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(
      `SELECT rr.*, u.name as citizen_name FROM rescue_requests rr
       LEFT JOIN users u ON rr.citizen_id = u.id WHERE rr.id = ?`
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found' });
    res.json(row);
  } catch (err) {
    console.error('[Report] Get error:', err.message);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// PATCH /api/reports/:id/status
router.patch('/:id/status', (req, res) => {
  const { status, accepted_by } = req.body;
  try {
    if (status === 'accepted' && accepted_by) {
      // Auto-register guest rescuer if missing (satisfy foreign key)
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(accepted_by);
      if (!user) {
        db.prepare('INSERT INTO users (id, role, name) VALUES (?, ?, ?)')
          .run(accepted_by, 'rescuer', 'Guest Rescuer ' + accepted_by.slice(-4));
      }

      db.prepare(`UPDATE rescue_requests SET status = ?, accepted_by = ?, accepted_at = datetime('now') WHERE id = ?`)
        .run(status, accepted_by, req.params.id);
    } else if (status === 'rescued') {
      db.prepare(`UPDATE rescue_requests SET status = ?, completed_at = datetime('now') WHERE id = ?`)
        .run(status, req.params.id);
    } else {
      db.prepare(`UPDATE rescue_requests SET status = ? WHERE id = ?`).run(status, req.params.id);
    }
    res.json(db.prepare('SELECT * FROM rescue_requests WHERE id = ?').get(req.params.id));
  } catch (err) {
    console.error('[Report] Update status error:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});
// POST /api/reports/batch - Bulk upload offline-queued reports
router.post('/batch', async (req, res) => {
  const { reports } = req.body;
  if (!Array.isArray(reports) || reports.length === 0) {
    return res.status(400).json({ error: 'reports array is required' });
  }

  const results = [];
  for (const report of reports) {
    try {
      const { citizen_id, lat, lng, description, severity, photos, ai_analysis } = report;
      if (!lat || !lng) { results.push({ success: false, error: 'Missing location' }); continue; }

      const id = generateId();
      const finalCitizenId = citizen_id || 'offline-user';

      // Auto-register guest user if missing
      let sender = db.prepare('SELECT name FROM users WHERE id = ?').get(finalCitizenId);
      if (!sender) {
        db.prepare('INSERT INTO users (id, role, name, phone) VALUES (?, ?, ?, ?)')
          .run(finalCitizenId, 'citizen', 'Guest Citizen', 'guest-' + finalCitizenId.slice(-6));
      }

      const photosJson = JSON.stringify(photos || []);
      const analysisJson = ai_analysis ? JSON.stringify(ai_analysis) : null;

      db.prepare(
        `INSERT INTO rescue_requests (id, citizen_id, lat, lng, description, severity, photos, status, ai_analysis)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).run(id, finalCitizenId, lat, lng, description || '', severity || 'moderate', photosJson, analysisJson);

      const row = db.prepare('SELECT * FROM rescue_requests WHERE id = ?').get(id);
      results.push({ success: true, id: row.id });

      // Broadcast to rescuers
      try {
        const io = getIO();
        if (io) {
          io.to('rescuers').emit('incoming_rescue_request', {
            id: row.id,
            location: { lat: row.lat, lng: row.lng },
            citizenId: row.citizen_id,
            description: row.description,
            severity: row.severity,
            photo: photos?.[0] || null,
            timestamp: row.created_at
          });
        }
      } catch (_) {}

      // Non-blocking AI report generation
      generateAIReport(description, severity || 'moderate', lat, lng, photos || [])
        .then(aiReport => {
          db.prepare('UPDATE rescue_requests SET ai_report = ? WHERE id = ?').run(aiReport, id);
        }).catch(() => {});

    } catch (err) {
      results.push({ success: false, error: err.message });
    }
  }

  res.json({ results, synced: results.filter(r => r.success).length, total: reports.length });
});

module.exports = router;
