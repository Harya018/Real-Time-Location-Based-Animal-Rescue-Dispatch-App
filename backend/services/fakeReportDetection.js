// =================================================
// FAKE REPORT DETECTION - Rate limiting & location checks
// =================================================
const pool = require('../config/database');

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
async function detectFakeReport(userId, location) {
  try {
    // Check 1: Rate limit — max 5 reports in 24 hours
    const countResult = await pool.query(
      `SELECT COUNT(*) AS report_count
       FROM rescue_requests
       WHERE citizen_id = $1
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    const last24Hours = parseInt(countResult.rows[0].report_count);

    if (last24Hours >= 5) {
      return { flag: true, reason: 'rate_limit', message: 'Too many reports in the last 24 hours.' };
    }

    // Check 2: Location hopping — average distance from user's past reports
    const historyResult = await pool.query(
      `SELECT ST_Distance(
         animal_location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       ) AS distance_m
       FROM rescue_requests
       WHERE citizen_id = $3
         AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC
       LIMIT 10`,
      [location.lng, location.lat, userId]
    );

    if (historyResult.rows.length >= 3) {
      const avgDistance =
        historyResult.rows.reduce((sum, r) => sum + parseFloat(r.distance_m), 0) /
        historyResult.rows.length;

      // Flag if average distance exceeds 50km — implies location spoofing
      if (avgDistance > 50000) {
        return { flag: true, reason: 'location_hopping', message: 'Suspicious location pattern detected.' };
      }
    }

    // Check 3: Trust score check
    const userResult = await pool.query(
      `SELECT trust_score FROM users WHERE id = $1`,
      [userId]
    );
    if (userResult.rows.length > 0 && userResult.rows[0].trust_score < 0.3) {
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
