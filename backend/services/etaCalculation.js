// =================================================
// ETA CALCULATION SERVICE - Estimated Time of Arrival
// =================================================

/**
 * Calculate ETA between rescuer and incident.
 * For hackathon MVP, uses Haversine distance with an average speed.
 * In production, integrate Mapbox Directions API for real traffic.
 *
 * @param {Object} rescuerLoc - {lat, lng}
 * @param {Object} incidentLoc - {lat, lng}
 * @returns {Object} { distanceKm, minutes, seconds }
 */
function calculateETA(rescuerLoc, incidentLoc) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(incidentLoc.lat - rescuerLoc.lat);
  const dLng = toRad(incidentLoc.lng - rescuerLoc.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(rescuerLoc.lat)) *
      Math.cos(toRad(incidentLoc.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;

  // Average rescue vehicle speed: 30 km/h in urban areas
  const AVG_SPEED_KMH = 30;
  const hours = distanceKm / AVG_SPEED_KMH;
  const minutes = Math.ceil(hours * 60);
  const seconds = Math.round(hours * 3600);

  return {
    distanceKm: distanceKm.toFixed(2),
    minutes,
    seconds,
    traffic_factor: 1.0, // Placeholder, integrate Mapbox in production
  };
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Production upgrade: Use Mapbox Directions API
 * const calculateETAMapbox = async (rescuerLoc, incidentLoc) => {
 *   const response = await fetch(
 *     `https://api.mapbox.com/directions/v5/mapbox/driving/` +
 *     `${rescuerLoc.lng},${rescuerLoc.lat};${incidentLoc.lng},${incidentLoc.lat}` +
 *     `?access_token=${process.env.MAPBOX_TOKEN}&annotations=duration&geometries=geojson`
 *   );
 *   const data = await response.json();
 *   return { seconds: data.routes[0].duration, minutes: Math.ceil(data.routes[0].duration / 60) };
 * };
 */

module.exports = { calculateETA };
