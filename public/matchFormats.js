export const MATCH_TEAMS = [
  { level: "Sub13", format: 7, label: "Sub13 Futebol 7 / 9" },
  { level: "Sub15", format: 11, label: "Sub15 Futebol 11" },
  { level: "Sub17", format: 11, label: "Sub17 Futebol 11" },
  { level: "Sub19", format: 11, label: "Sub19 Futebol 11" },
];

export function availableFormats(level) {
  return level === "Sub13" ? [7, 9] : [11];
}

export function matchFormat(level, match = {}, report = {}) {
  const saved = Number(report.format || match.format);
  if ([7, 9, 11].includes(saved)) return saved;
  // Older reports did not store the format; retain their original pitch size.
  const count = report.lineupSlots?.length || report.starters?.length;
  if ([7, 9, 11].includes(count)) return count;
  return availableFormats(level)[0];
}
