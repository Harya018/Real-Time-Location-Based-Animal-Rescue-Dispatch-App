// =================================================
// FAKE REPORT DETECTION - Rate limiting & location checks
// =================================================
const { db } = require('../config/database');

/**
 * Haversine distance between two {lat, lng} points in meters.
 */
function haversineMeters(a, b) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Detect whether a rescue report is potentially fake.
 * Checks:
 *   1. Rate limit — too many reports from the same user in 24h
 *   2. Location hopping — avg distance between recent reports is too large
 *
 * @param {string} userId - UUID of the reporting citizen
 * @param {Object} location - {lat, lng}
 * @returns {Object} { flag: boolean, reason: string|null }
 */
function detectFakeReport(userId, location) {
  try {
    // Check 1: Rate limit — max 5 reports in 24 hours
    const countRow = db.prepare(
      `SELECT COUNT(*) AS report_count
       FROM rescue_requests
       WHERE citizen_id = ?
         AND created_at > datetime('now', '-24 hours')`
    ).get(userId);

    const last24Hours = countRow ? countRow.report_count : 0;

    if (last24Hours >= 5) {
      return { flag: true, reason: 'rate_limit', message: 'Too many reports in the last 24 hours.' };
    }

    // Check 2: Location hopping — average distance from user's past reports
    const history = db.prepare(
      `SELECT lat, lng
       FROM rescue_requests
       WHERE citizen_id = ?
         AND created_at > datetime('now', '-7 days')
       ORDER BY created_at DESC
       LIMIT 10`
    ).all(userId);

    if (history.length >= 3) {
      let totalDist = 0;
      for (const row of history) {
        totalDist += haversineMeters(location, { lat: row.lat, lng: row.lng });
      }
      const avgDistance = totalDist / history.length;

      // Flag if average distance exceeds 50km — implies location spoofing
      if (avgDistance > 50000) {
        return { flag: true, reason: 'location_hopping', message: 'Suspicious location pattern detected.' };
      }
    }

    // Check 3: Trust score check
    const userRow = db.prepare('SELECT trust_score FROM users WHERE id = ?').get(userId);
    if (userRow && userRow.trust_score < 0.3) {
      return { flag: true, reason: 'low_trust_score', message: 'User trust score too low.' };
    }

    return { flag: false, reason: null };
  } catch (err) {
    console.error('[FakeDetection] Error:', err.message);
    // Fail open for hackathon MVP — don't block legitimate reports
    return { flag: false, reason: null };
  }
}

module.exports = { detectFakeReport };
