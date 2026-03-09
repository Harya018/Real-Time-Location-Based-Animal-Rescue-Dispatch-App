// =================================================
// NEAREST RESCUER - PostGIS-powered spatial query
// =================================================
const pool = require('../config/database');

/**
 * Find the nearest available rescuers to an incident location.
 * Uses PostGIS ST_DWithin for efficient spatial filtering.
 *
 * @param {Object} incidentLocation - {lat, lng}
 * @param {number} radius - search radius in kilometers (default 5)
 * @returns {Array} nearest rescuers sorted by distance
 */
async function findNearestRescuers(incidentLocation, radius = 5) {
  const { lat, lng } = incidentLocation;

  const result = await pool.query(
    `SELECT
       id,
       name,
       phone,
       trust_score,
       ST_Distance(
         current_location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       ) AS distance_meters,
       ST_Y(current_location::geometry) AS lat,
       ST_X(current_location::geometry) AS lng
     FROM users
     WHERE role = 'rescuer'
       AND is_available = true
       AND current_location IS NOT NULL
       AND ST_DWithin(
         current_location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
     ORDER BY distance_meters ASC
     LIMIT 5`,
    [lng, lat, radius * 1000] // PostGIS uses meters
  );

  return result.rows.map((r) => ({
    ...r,
    distance_km: (r.distance_meters / 1000).toFixed(2),
  }));
}

module.exports = { findNearestRescuers };
