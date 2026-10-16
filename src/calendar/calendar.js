import { createHash } from "node:crypto";
import XLSX from "xlsx";
import { competitionOptions, matchFormat } from "../../public/matchFormats.js";

const SHEETS = { Sub19: ["Sub19", 11], Sub17: ["Sub17", 11], Sub15: ["Sub15", 11], Sub13F9: ["Sub13", 9], Sub13F7: ["Sub13", 7] };
const pad = value => String(value).padStart(2, "0");
const text = value => String(value ?? "").trim();
const key = value => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function dateValue(value, date1904) {
  let y, m, d;
  if (typeof value === "number") {
    ({ y, m, d } = XLSX.SSF.parse_date_code(value, { date1904 }) || {});
  } else {
    const match = text(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) throw new Error(`Data invalida no calendario: ${text(value)}`);
    [, d, m, y] = match.map(Number);
  }
  const check = new Date(Date.UTC(y, m - 1, d));
  if (!y || check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) throw new Error("Data invalida no calendario.");
  return `${y}-${pad(m)}-${pad(d)}`;
}

function timeValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) throw new Error("Hora invalida no calendario.");
    return `${pad(parsed.H)}:${pad(parsed.M)}`;
  }
  const match = text(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error(`Hora invalida no calendario: ${text(value)}`);
  return `${pad(Number(match[1]))}:${match[2]}`;
}

export function importCalendarWorkbook(bytes, { fromDate, sourceWorkbook = "Calendario_CasaPia_Feminino.xlsx" } = {}) {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const matches = [];
  let rowsRead = 0;
  for (const [sheetName, [level, format]] of Object.entries(SHEETS)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const records = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    for (const row of records) {
      if (!row.Data && !row.Casa && !row.Fora) continue;
      rowsRead++;
      const date = dateValue(row.Data, Boolean(workbook.Workbook?.WBProps?.date1904));
      if (fromDate && date < fromDate) continue;
      const homeTeam = text(row.Casa), awayTeam = text(row.Fora);
      const home = key(homeTeam).startsWith("casapia"), away = key(awayTeam).startsWith("casapia");
      if (home === away || !homeTeam || !awayTeam) throw new Error(`Equipas invalidas na folha ${sheetName}, data ${date}.`);
      const year = Number(date.slice(0, 4));
      const startYear = Number(date.slice(5, 7)) >= 7 ? year : year - 1;
      const season = `${startYear}/${startYear + 1}`;
      const competition = competitionOptions(level).find(item => item.format === format)?.name;
      const identity = `${level}|${format}|${season}|${date}|${key(homeTeam)}|${key(awayTeam)}`;
      matches.push({
        id: `calendar_${createHash("sha256").update(identity).digest("hex").slice(0, 20)}`,
        level, format, season, competition, opponent: home ? awayTeam : homeTeam,
        homeTeam, awayTeam, venue: home ? "Casa" : "Fora", stadium: text(row.Local),
        date, time: timeValue(row.Hora), round: "", goalsFor: null, goalsAgainst: null,
        status: "scheduled", source: "CALENDAR_EXCEL", sourceWorkbook,
      });
    }
  }
  if (!rowsRead) throw new Error("O Excel nao contem folhas de calendario reconhecidas.");
  if (new Set(matches.map(match => match.id)).size !== matches.length) throw new Error("O Excel contem jogos repetidos.");
  matches.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return { meta: { sourceWorkbook, fromDate, rowsRead, excludedPast: rowsRead - matches.length }, matches };
}

export function mergeCalendar(db, calendar) {
  let changed = false;
  const deleted = new Set(db.deletedMatchIds || []);
  for (const incoming of calendar.matches) {
    if (deleted.has(incoming.id)) continue;
    const existing = db.matches.find(match => match.id === incoming.id || (match.date === incoming.date
      && match.level === incoming.level && matchFormat(match.level, match, db.matchReports?.[match.id]) === incoming.format
      && key(match.opponent) === key(incoming.opponent) && match.venue === incoming.venue
      && (!match.competition || match.competition === "Jogo manual" || match.competition === incoming.competition)));
    if (!existing) {
      db.matches.push({ ...incoming });
      changed = true;
    } else if (existing.id !== incoming.id && existing.calendarId !== incoming.id) {
      existing.calendarId = incoming.id;
      changed = true;
    }
    // Existing games, scores, reports and events remain authoritative.
  }
  return changed;
}
