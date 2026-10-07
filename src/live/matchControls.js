import { randomUUID } from "node:crypto";

const controls = {
  "start-first": { before: ["Pre-jogo", "Pré-jogo", "Por iniciar"], period: "1ª Parte", status: "Em direto", event: "Início do jogo" },
  "half-time": { before: ["1ª Parte"], period: "Intervalo", status: "Intervalo", event: "Fim da 1ª parte" },
  "start-second": { before: ["Intervalo"], period: "2ª Parte", status: "Em direto", event: "Início da 2ª parte" },
  "full-time": { before: ["2ª Parte"], period: "Fim de jogo", status: "Terminado", event: "Fim de jogo" },
};

export function applyMatchControl(db, matchId, control) {
  const config = controls[control];
  const live = db.liveGames?.[matchId] || (db.live?.matchId === matchId ? db.live : null);
  if (!config || !live || !db.matchReports?.[matchId] || !db.matches.some(match => match.id === matchId)) throw new Error("Guarda primeiro a ficha de jogo.");
  if (live.liveEnded || !config.before.includes(live.period || "Pre-jogo")) throw new Error("Este controlo nao esta disponivel nesta fase do jogo.");
  if (db.events.some(event => event.matchId === matchId && event.team === "Sistema" && event.type === config.event)) throw new Error("Esta acao ja foi registada.");
  const updatedAt = new Date().toISOString();
  const next = { ...live, matchId, period: config.period, status: config.status, liveEnded: control === "full-time", updatedAt };
  const event = { id: `evt_${randomUUID()}`, matchId, team: "Sistema", type: config.event, period: config.period, cornersFor: next.cornersFor || 0, cornersAgainst: next.cornersAgainst || 0, createdAt: updatedAt };
  db.liveGames ||= {};
  db.liveGames[matchId] = next;
  db.live = next;
  db.events.unshift(event);
  return event;
}
