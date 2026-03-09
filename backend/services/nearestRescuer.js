// =================================================
// NEAREST RESCUER - Haversine-powered spatial lookup
// =================================================
const { db } = require('../config/database');

/**
 * Haversine distance between two {lat, lng} objects in meters.
 */
function haversineMeters(a, b) {
  const R = 6371000;
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
 * Find the nearest available rescuers to an incident location.
 * Uses Haversine distance calculation instead of PostGIS.
 *
 * @param {Object} incidentLocation - {lat, lng}
 * @param {number} radius - search radius in kilometers (default 5)
 * @returns {Array} nearest rescuers sorted by distance
 */
function findNearestRescuers(incidentLocation, radius = 5) {
  const rescuers = db.prepare(
    `SELECT id, name, phone, trust_score, lat, lng
     FROM users
     WHERE role = 'rescuer'
       AND is_available = 1
       AND lat IS NOT NULL
       AND lng IS NOT NULL`
  ).all();

  const radiusMeters = radius * 1000;

  return rescuers
    .map((r) => {
      const distance_meters = haversineMeters(incidentLocation, { lat: r.lat, lng: r.lng });
      return { ...r, distance_meters, distance_km: (distance_meters / 1000).toFixed(2) };
    })
    .filter((r) => r.distance_meters <= radiusMeters)
    .sort((a, b) => a.distance_meters - b.distance_meters)
    .slice(0, 5);
}

module.exports = { findNearestRescuers };
