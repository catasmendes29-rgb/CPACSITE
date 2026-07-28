import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TEAMS = [
  { level: "Sub13", zerozeroId: "333814", label: "Casa Pia AC Fut.9 Feminino Jun.D S13" },
  { level: "Sub15", zerozeroId: "332517", label: "Casa Pia AC Feminino Jun.C S15" },
  { level: "Sub17", zerozeroId: "359808", label: "Casa Pia AC Feminino Jun.B S17" },
  { level: "Sub19", zerozeroId: "359807", label: "Casa Pia AC Feminino Jun.A S19" },
];

const EPocaIds = {
  "2024/2025": "154",
  "2025/2026": "155",
  "2026/2027": "156",
  "2027/2028": "157",
};

const season = process.argv.includes("--season")
  ? process.argv[process.argv.indexOf("--season") + 1]
  : "2025/2026";
const epocaId = EPocaIds[season] || season;
const output = path.join(process.cwd(), "outputs", `zerozero-casa-pia-${season.replace("/", "-")}.json`);

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, number) => String.fromCharCode(Number(number)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanId(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function cells(row) {
  const out = [];
  const re = /<td\b[^>]*>([\s\S]*?)<\/td>/g;
  let match;
  while ((match = re.exec(row))) out.push(match[1]);
  return out;
}

function parseMatches(html, team) {
  const matches = [];
  const rowRe = /<tr data-lj="[^"]*" id="([^"]+)" class="parent">([\s\S]*?)<\/tr>/g;
  let row;
  while ((row = rowRe.exec(html))) {
    const columns = cells(row[2]);
    if (columns.length < 9) continue;
    const date = stripTags(columns[1]);
    const time = stripTags(columns[2]);
    const venueMark = stripTags(columns[3]);
    const opponent = stripTags(columns[5]);
    const resultText = stripTags(columns[6]).replace(/\(.*?\)/g, "").trim();
    const competition = stripTags(columns[7]);
    const round = stripTags(columns[8]);
    const score = resultText.match(/(\d+)\s*-\s*(\d+)/);
    const home = venueMark.includes("C");
    const away = venueMark.includes("F");
    const goalsA = score ? Number(score[1]) : null;
    const goalsB = score ? Number(score[2]) : null;
    matches.push({
      id: `zz_${team.level}_${row[1]}`,
      zerozeroMatchId: row[1],
      level: team.level,
      opponent,
      round,
      venue: home ? "Casa" : away ? "Fora" : "Neutro",
      competition,
      date,
      time,
      goalsFor: score ? (home ? goalsA : goalsB) : null,
      goalsAgainst: score ? (home ? goalsB : goalsA) : null,
      status: score ? "finished" : "scheduled",
      source: "ZEROZERO",
      sourceUrl: `https://www.zerozero.pt/equipa/casa-pia-ac/${team.zerozeroId}/jogos?epoca_id=${epocaId}`,
    });
  }
  return matches;
}

async function fetchTeam(team) {
  const url = `https://www.zerozero.pt/equipa/casa-pia-ac/${team.zerozeroId}/jogos?epoca_id=${epocaId}`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "CasaPiaACLive/1.0 resultados-clube",
    },
  });
  if (!response.ok) throw new Error(`zerozero ${team.level} respondeu ${response.status}`);
  const charset = response.headers.get("content-type")?.match(/charset=([^;]+)/i)?.[1] || "utf-8";
  const buffer = await response.arrayBuffer();
  const html = new TextDecoder(charset).decode(buffer);
  return parseMatches(html, team);
}

const allMatches = [];
for (const team of TEAMS) {
  const matches = await fetchTeam(team);
  allMatches.push(...matches);
  console.log(`${team.level}: ${matches.length} jogos`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

const payload = {
  meta: {
    source: "ZEROZERO",
    season,
    epocaId,
    createdAt: new Date().toISOString(),
  },
  matches: allMatches.sort((a, b) => `${a.level}${a.date}`.localeCompare(`${b.level}${b.date}`)),
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(payload, null, 2), "utf8");
console.log(output);
