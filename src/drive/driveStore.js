import { GoogleAuth } from "google-auth-library";
import XLSX from "xlsx";

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const COLLECTIONS = ["meta", "teams", "players", "matches", "matchReports", "events", "live", "liveGames", "hiddenLiveGames", "deletedMatchIds", "zerozero"];

export function encodeDriveWorkbook(db) {
  const workbook = XLSX.utils.book_new();
  const add = (name, rows) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = rows[0].map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };
  const table = (name, fields, records) => add(name, [fields, ...records.map(record => fields.map(field => {
    const value = record[field];
    const display = value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : value;
    return typeof display === "string" && display.length > 32000 ? `${display.slice(0, 31900)} [texto completo em DadosRestauro]` : display;
  }))]);
  add("Resumo", [["Casa Pia AC - dados da app"], ["Atualizado em (UTC)", db.meta?.updatedAt || new Date().toISOString()], ["Jogadoras", db.players.length], ["Jogos", db.matches.length], ["Eventos", db.events.length]]);
  table("Jogadoras", ["id", "level", "name", "number", "position", "birthYear", "photoUrl", "profileUrl", "history"], db.players);
  table("Escaloes", ["level", "format", "label"], db.teams);
  table("Jogos", ["id", "level", "season", "competition", "opponent", "venue", "round", "date", "time", "goalsFor", "goalsAgainst", "status", "source", "createdBy", "createdAt", "updatedAt"], db.matches);
  table("Fichas", ["matchId", "delegate", "tactic", "starters", "lineupSlots", "bench", "notes", "createdAt", "updatedAt"], Object.entries(db.matchReports || {}).map(([matchId, report]) => ({ ...report, matchId })));
  table("Eventos", ["id", "matchId", "type", "team", "period", "playerId", "playerName", "assistId", "assistName", "outPlayerId", "outPlayerName", "inPlayerId", "inPlayerName", "notes", "createdAt"], db.events);
  table("Live", ["matchId", "homeScore", "awayScore", "period", "status", "liveEnded", "cornersFor", "cornersAgainst", "updatedAt"], Object.entries(db.liveGames || {}).map(([matchId, live]) => ({ ...live, matchId })));
  const rows = [["Colecao", "Parte", "JSON"]];
  for (const key of COLLECTIONS) {
    const json = JSON.stringify(db[key] ?? null);
    // Excel cells have a text length limit; numbered chunks retain exact records.
    for (let offset = 0, part = 1; offset < json.length; offset += 28000, part++) rows.push([key, part, json.slice(offset, offset + 28000)]);
  }
  add("DadosRestauro", rows);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
}

export function decodeDriveWorkbook(bytes) {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const sheet = workbook.Sheets.DadosRestauro;
  if (!sheet) throw new Error("O Excel do Drive nao tem a folha DadosRestauro. A gravacao foi bloqueada para proteger os dados.");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  const result = {};
  for (const key of COLLECTIONS) {
    const chunks = rows.slice(1).filter(row => row[0] === key).sort((a, b) => Number(a[1]) - Number(b[1]));
    if (!chunks.length || chunks.some((row, index) => Number(row[1]) !== index + 1 || typeof row[2] !== "string")) throw new Error(`DadosRestauro incompletos: ${key}.`);
    result[key] = JSON.parse(chunks.map(row => row[2]).join(""));
  }
  for (const key of ["teams", "players", "matches", "events", "hiddenLiveGames", "deletedMatchIds"]) {
    if (!Array.isArray(result[key])) throw new Error(`Colecao invalida no Excel do Drive: ${key}.`);
  }
  for (const key of ["meta", "matchReports", "liveGames"]) {
    if (!result[key] || typeof result[key] !== "object" || Array.isArray(result[key])) throw new Error(`Colecao invalida no Excel do Drive: ${key}.`);
  }
  return result;
}

export function createDriveStore({ fileId, credentialsJson, fetchImpl = fetch, tokenProvider } = {}) {
  const enabled = Boolean(fileId || credentialsJson);
  let auth;
  async function token() {
    if (!fileId || (!credentialsJson && !tokenProvider)) throw new Error("Configura GOOGLE_DRIVE_FILE_ID e GOOGLE_SERVICE_ACCOUNT_JSON no Render.");
    if (tokenProvider) return tokenProvider();
    if (!auth) {
      let credentials;
      try { credentials = JSON.parse(credentialsJson); } catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON nao e um JSON valido."); }
      if (!credentials.client_email || !credentials.private_key) throw new Error("Faltam client_email ou private_key nas credenciais do Drive.");
      auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
    }
    try { return await auth.getAccessToken(); } catch { throw new Error("Falha na autenticacao Google Drive. Verifica as credenciais da conta de servico."); }
  }
  async function request(url, options = {}) {
    const accessToken = await token();
    const response = await fetchImpl(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Google Drive respondeu ${response.status}. Verifica a API Drive e a partilha do Excel com a conta de servico. Os dados nao foram confirmados como guardados.`);
    return response;
  }
  return {
    enabled,
    async read() {
      const response = await request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
      return decodeDriveWorkbook(Buffer.from(await response.arrayBuffer()));
    },
    async write(db) {
      await request(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`, {
        method: "PATCH", headers: { "Content-Type": MIME }, body: encodeDriveWorkbook(db),
      });
    },
  };
}
