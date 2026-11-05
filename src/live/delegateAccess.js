export function assertMatchDevice(db, matchId, deviceId) {
  const live = db.liveGames?.[matchId] || (db.live?.matchId === matchId ? db.live : null);
  const owners = [db.matchReports?.[matchId]?.deviceId, live?.deviceId].filter(Boolean);
  if (owners.some(owner => owner !== deviceId)) {
    const error = new Error("Esta ficha esta aberta noutro dispositivo. Escolhe outro jogo neste dispositivo.");
    error.statusCode = 409;
    throw error;
  }
}

export function claimMatchDevice(db, matchId, deviceId) {
  if (!deviceId) return false;
  assertMatchDevice(db, matchId, deviceId);
  let changed = false;
  const records = [db.matchReports?.[matchId], db.liveGames?.[matchId], db.live?.matchId === matchId ? db.live : null];
  for (const record of records) {
    if (record && record.deviceId !== deviceId) { record.deviceId = deviceId; changed = true; }
  }
  return changed;
}
