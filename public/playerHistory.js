export function playerMatchHistory(db, player, season = "all") {
  const key = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  const matchesPlayer = value => value === player.id || key(value) === key(player.name);
  const rows = new Map();
  const deleted = new Set(db.deletedMatchIds || []);
  for (const [index, item] of (player.history || []).entries()) {
    if (!deleted.has(item.matchId)) rows.set(item.matchId || `import_${index}`, { ...item });
  }
  for (const match of db.matches || []) {
    const report = db.matchReports?.[match.id];
    const events = (db.events || []).filter(event => event.matchId === match.id && event.team === "Casa Pia");
    const starter = (report?.lineupSlots || report?.starters || []).some(matchesPlayer);
    const bench = (report?.bench || []).some(matchesPlayer);
    const involvement = events.some(event => [event.playerId, event.playerName, event.assistId, event.assistName, event.inPlayerId, event.inPlayerName, event.outPlayerId, event.outPlayerName].some(value => value && matchesPlayer(value)));
    if (!starter && !bench && !involvement) continue;
    const imported = rows.get(match.id) || [...rows.values()].find(item => item.season === match.season && key(item.opponent) === key(match.opponent) && ((item.date && match.date && item.date === match.date) || (item.round && match.round && String(item.round) === String(match.round))));
    if (imported) for (const [id, row] of rows) if (row === imported) rows.delete(id);
    const count = type => events.filter(event => event.type === type && (matchesPlayer(event.playerId) || matchesPlayer(event.playerName))).length;
    const relevantGoals = events.filter(event => event.type === "Golo");
    const live = db.liveGames?.[match.id] || (db.live?.matchId === match.id ? db.live : null);
    const tracked = Boolean(live);
    const started = match.status === "finished" || live?.liveEnded || ["1ª Parte", "Intervalo", "2ª Parte", "Fim de jogo"].includes(live?.period) || (db.events || []).some(event => event.matchId === match.id && event.type === "Início do jogo");
    const entered = events.some(event => event.type === "Substituição" && (matchesPlayer(event.inPlayerId) || matchesPlayer(event.inPlayerName)));
    rows.set(match.id, {
      ...imported, matchId: match.id, season: match.season, opponent: match.opponent, round: match.round, date: match.date,
      role: starter ? "Titular" : bench ? "Suplente" : "Participante",
      minutes: imported?.minutes ?? "",
      played: Boolean(started && (starter || entered || (!bench && involvement) || count("Golo") > 0 || relevantGoals.some(event => matchesPlayer(event.assistId) || matchesPlayer(event.assistName)) || events.some(event => event.type === "Substituição" && (matchesPlayer(event.outPlayerId) || matchesPlayer(event.outPlayerName))))),
      goals: tracked || relevantGoals.length ? count("Golo") : imported?.goals || 0,
      assists: tracked || relevantGoals.length ? relevantGoals.filter(event => matchesPlayer(event.assistId) || matchesPlayer(event.assistName)).length : imported?.assists || 0,
      yellows: tracked || events.some(event => event.type === "Cartão amarelo") ? count("Cartão amarelo") : imported?.yellows || 0,
      reds: tracked || events.some(event => event.type === "Cartão vermelho") ? count("Cartão vermelho") : imported?.reds || 0,
    });
  }
  return [...rows.values()].filter(item => season === "all" || !season || item.season === season);
}
