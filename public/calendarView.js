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
