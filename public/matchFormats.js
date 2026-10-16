export const MATCH_TEAMS = [
  { level: "Sub13", format: 7, label: "Sub13 Futebol 7 / 9" },
  { level: "Sub15", format: 11, label: "Sub15 Futebol 11" },
  { level: "Sub17", format: 11, label: "Sub17 Futebol 11" },
  { level: "Sub19", format: 11, label: "Sub19 Futebol 11" },
];

export function availableFormats(level) {
  return level === "Sub13" ? [7, 9] : [11];
}

export function competitionOptions(level) {
  const options = {
    Sub13: [
      { name: "Campeonato Distrital de Lisboa Sub13 - Futebol de 7", label: "Distrital Sub13 - Fut7 Lisboa", format: 7 },
      { name: "Campeonato Distrital Sub13 - Futebol de 9", label: "Distrital Sub13 - Fut9", format: 9 },
    ],
    Sub15: [{ name: "Campeonato Distrital Sub15", label: "Distrital Sub15", format: 11 }],
    Sub17: [{ name: "Campeonato Distrital Sub17", label: "Distrital Sub17", format: 11 }],
    Sub19: [{ name: "Campeonato Nacional Sub19 - II Divisão", label: "Nacional Sub19 - II Divisão", format: 11 }],
  };
  return options[level] || [];
}

export function competitionDefinition(level, name) {
  return competitionOptions(level).find(option => option.name === name);
}

export function competitionLabel(name) {
  return MATCH_TEAMS.flatMap(team => competitionOptions(team.level)).find(item => item.name === name)?.label || name;
}

export function matchFormat(level, match = {}, report = {}) {
  const saved = Number(report.format || match.format);
  if ([7, 9, 11].includes(saved)) return saved;
  const competition = competitionDefinition(level, match.competition);
  if (competition) return competition.format;
  // Older reports did not store the format; retain their original pitch size.
  const count = report.lineupSlots?.length || report.starters?.length;
  if ([7, 9, 11].includes(count)) return count;
  return availableFormats(level)[0];
}
