export function createDelegateSession(storage, makeId = () => crypto.randomUUID()) {
  const read = key => { try { return storage?.getItem(key) || null; } catch { return null; } };
  const write = (key, value) => { try { value ? storage?.setItem(key, value) : storage?.removeItem(key); } catch {} };
  const deviceId = read("cpacDelegateDeviceId") || makeId();
  write("cpacDelegateDeviceId", deviceId);
  let matchId = read("cpacDelegateMatchId");
  return {
    deviceId,
    matchId: () => matchId,
    remember(id) { matchId = id || null; write("cpacDelegateMatchId", matchId); },
    canEdit(db, id) {
      const owners = [db.matchReports?.[id]?.deviceId, db.liveGames?.[id]?.deviceId].filter(Boolean);
      return owners.every(owner => owner === deviceId);
    },
  };
}
