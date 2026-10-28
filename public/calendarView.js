import { matchFormat } from "./matchFormats.js?v=20261016-sub13-views2";

export function calendarChoices(db, level, { today = lisbonToday(), format } = {}) {
  return db.matches.filter(match => match.level === level
    && (format == null || matchFormat(level, match) === format)
    && /^\d{4}-\d{2}-\d{2}$/.test(match.date || "") && match.date >= today
    && (match.source === "CALENDAR_EXCEL" || match.calendarId || match.id.startsWith("calendar_"))
    && match.status !== "finished" && match.goalsFor == null && match.goalsAgainst == null
    && !db.matchReports?.[match.id] && !(db.events || []).some(event => event.matchId === match.id)
    && !db.liveGames?.[match.id]?.liveEnded
    && [undefined, "Pre-jogo", "Pré-jogo", "Por iniciar"].includes(db.liveGames?.[match.id]?.period))
    .slice().sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));
}

export function calendarMatchesOnDate(db, { level, format, date, competition, venue }, today = lisbonToday()) {
  return calendarChoices(db, level, { today, format }).filter(match => match.date === date
    && match.competition === competition && match.venue === venue);
}

export function lisbonToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function upcomingMatches(matches, today = lisbonToday()) {
  return matches.filter(match => match.status !== "finished" && !(match.goalsFor != null && match.goalsAgainst != null)
    && /^\d{4}-\d{2}-\d{2}$/.test(match.date || "") && match.date >= today)
    .slice().sort((a, b) => `${a.date} ${a.time || "23:59"}`.localeCompare(`${b.date} ${b.time || "23:59"}`));
}

export function calendarDate(date) {
  return date.split("-").reverse().join("/");
}
