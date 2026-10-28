const state = {
  db: null,
  level: "Sub13",
  matchFormat: 7,
  delegateCompetition: "",
  delegateOtherCompetition: "",
  delegateGameMode: "calendar",
  calendarSelection: "",
  teamsCompetition: "all",
  dataLevel: "Sub13:7",
  selectedMatch: null,
  starters: new Set(),
  bench: new Set(),
  lineupSlots: [],
  selectedSlot: null,
  pickerMode: "starter",
  user: readStoredUser(),
  liveDetailMatchId: null,
  competitionFilter: "all",
  teamsLevel: "Sub13:7",
  selectedPlayerId: null,
  playerSearch: "",
  resultsSeason: "all",
  reportSetupVisible: true,
  currentView: "data",
  refreshingLive: false,
  savingEvent: false,
  savingReport: false,
  delegateRevision: 0,
};

import { playerMatchHistory } from "./playerHistory.js?v=20261016-sub13-views2";
import { upcomingMatches, calendarDate, lisbonToday, calendarChoices, calendarMatchesOnDate } from "./calendarView.js?v=20261028-choice2";
import { MATCH_TEAMS, TEAM_VIEWS, teamView, matchesTeamView, availableFormats, matchFormat, competitionOptions, competitionDefinition, competitionLabel } from "./matchFormats.js?v=20261016-sub13-views2";

function readStoredUser() {
  try {
    const user = JSON.parse(localStorage.getItem("cpacUser") || "null");
    return user && ["admin", "delegate"].includes(user.role) ? user : null;
  } catch {
    return null;
  }
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const viewTitles = { data: "Resultados", teams: "Equipas", delegate: "Delegado", live: "Live" };
const viewHashes = { resultados: "data", equipas: "teams", delegado: "delegate", live: "live" };
const delegateTeams = MATCH_TEAMS;

async function request(route, options = {}) {
  const { silentError = false, ...fetchOptions } = options;
  const method = (options.method || "GET").toUpperCase();
  const freshRoute = method === "GET" ? `${route}${route.includes("?") ? "&" : "?"}_=${Date.now()}` : route;
  const response = await fetch(freshRoute, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...fetchOptions,
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try { message = JSON.parse(text).error || text; } catch {}
    if (method !== "GET" && !silentError) alert(`Nao foi possivel guardar a alteracao: ${message}`);
    throw new Error(message);
  }
  return response.json();
}

function option(label, value = label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function activeTeam() {
  const team = delegateTeams.find((team) => team.level === state.level) || delegateTeams[0];
  const format = state.selectedMatch
    ? matchFormat(state.level, state.selectedMatch, selectedReport())
    : availableFormats(state.level).includes(state.matchFormat) ? state.matchFormat : team.format;
  return { ...team, format, label: `${team.level} Futebol ${format}` };
}

function levelPlayers(level = state.level) {
  const baseLevel = teamView(level)?.baseLevel || level;
  return allPlayers()
    .filter((player) => player.level === baseLevel);
}

function teamOptions() {
  const byLevel = new Map();
  [...delegateTeams, ...(state.db?.teams || [])].forEach((team) => {
    if (!team?.level || byLevel.has(team.level)) return;
    byLevel.set(team.level, team);
  });
  return [...byLevel.values()];
}

function allPlayers() {
  return [...state.db.players].sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }));
}

function playerNameKey(name) {
  return String(name || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function uniquePlayers(players = allPlayers()) {
  const byName = new Map();
  players.forEach((player) => {
    const key = playerNameKey(player.name);
    if (!key) return;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, {
        ...player,
        levels: player.level ? [player.level] : [],
      });
      return;
    }
    if (!existing.photoUrl && player.photoUrl) existing.photoUrl = player.photoUrl;
    if (!existing.level && player.level) existing.level = player.level;
    if (player.level && !existing.levels.includes(player.level)) existing.levels.push(player.level);
  });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }));
}

function pickerPlayers() {
  const term = state.playerSearch.trim().toLowerCase();
  const players = uniquePlayers();
  if (!term) return players;
  return players.filter((player) => {
    const name = player.name.toLowerCase();
    const levels = (player.levels || [player.level || ""]).join(" ").toLowerCase();
    return name.includes(term) || levels.includes(term);
  });
}

function levelMatches(level = state.level) {
  return state.db.matches.filter((match) => match.level === level);
}

function availableSeasons() {
  const seasons = new Set();
  state.db.matches.forEach((match) => {
    if (match.season) seasons.add(match.season);
  });
  Object.keys(state.db.zerozero?.seasons || {}).forEach((season) => seasons.add(season));
  return [...seasons].sort((a, b) => b.localeCompare(a));
}

function seasonMatches() {
  if (!state.db?.matches) return [];
  if (!state.resultsSeason || state.resultsSeason === "all") return state.db.matches;
  return state.db.matches.filter((match) => match.season === state.resultsSeason);
}

function dataLevelMatches(level = state.dataLevel) {
  return seasonMatches().filter(match => matchesTeamView(match, level, state.db.matchReports?.[match.id]));
}

function dataCompetitions(level = state.dataLevel) {
  const scope = teamView(level);
  const defaults = (level === "all" ? delegateTeams : delegateTeams.filter(team => team.level === scope?.baseLevel))
    .flatMap(team => competitionOptions(team.level).filter(item => scope?.baseLevel !== "Sub13" || item.format === scope.format).map(item => item.name));
  return [...new Set([...defaults, ...dataLevelMatches(level).map((match) => match.competition || "Sem competição")])]
    .sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));
}

function filteredDataMatches(level = state.dataLevel) {
  const matches = dataLevelMatches(level);
  if (!state.competitionFilter || state.competitionFilter === "all") return matches;
  return matches.filter((match) => (match.competition || "Sem competição") === state.competitionFilter);
}

function renderCompetitionFilter() {
  const select = $("#competitionFilter");
  if (!select) return;
  const competitions = dataCompetitions(state.dataLevel);
  if (state.competitionFilter !== "all" && !competitions.includes(state.competitionFilter)) state.competitionFilter = "all";
  select.innerHTML = "";
  select.append(option("Todas", "all"));
  competitions.forEach((competition) => select.append(option(competitionLabel(competition), competition)));
  select.value = state.competitionFilter;
}

function renderResultsSeasonSelect() {
  const selects = ["#resultsSeasonSelect", "#teamsSeasonSelect"].map((selector) => $(selector)).filter(Boolean);
  if (!selects.length) return;
  const seasons = availableSeasons();
  if (state.resultsSeason !== "all" && !seasons.includes(state.resultsSeason)) state.resultsSeason = "all";
  selects.forEach((select) => {
    select.innerHTML = "";
    select.append(option("Todas", "all"));
    seasons.forEach((season) => select.append(option(season, season)));
    select.value = state.resultsSeason;
  });
}

function openMatches(level = state.level) {
  return levelMatches(level).filter((match) => match.goalsFor === null || match.goalsAgainst === null || match.status === "scheduled");
}

function matchById(id) {
  return state.db.matches.find((match) => match.id === id);
}

function currentMatch() {
  return matchById(state.liveDetailMatchId || state.db.live?.matchId) || state.selectedMatch || state.db.matches[0];
}

function selectedReport() {
  return state.db.matchReports[state.selectedMatch?.id] || {};
}

function canDelegate() {
  return state.user?.role === "delegate" || state.user?.role === "admin";
}

function isAdmin() {
  return state.user?.role === "admin";
}

function reportRosterNames() {
  const report = selectedReport();
  return [...(report.starters || []), ...(report.bench || [])].filter(Boolean);
}

function eventPlayers() {
  const names = new Set(reportRosterNames());
  return uniquePlayers().filter((player) => names.has(player.name));
}

function setView(view) {
  state.currentView = view;
  updatePageHash(view);
  if (view === "delegate" && !canDelegate()) {
    $(".delegate-tab").hidden = false;
  }
  $("#brandTitle").textContent = "Casa Pia AC";
  $("#pageTitle").textContent = viewTitles[view] || "Casa Pia AC";
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  if (view === "data") renderDataPage();
  if (view === "teams") renderTeamsPage();
  if (["data", "teams"].includes(view)) refreshVisiblePublicData();
  if (view === "live") {
    renderLiveHub();
    if (state.liveDetailMatchId) openLiveDetail(state.liveDetailMatchId);
    refreshLive();
  }
  renderAuth();
}

function viewFromHash() {
  const rawKey = location.hash.replace("#", "").trim();
  const key = rawKey.toLowerCase();
  const [section, slug] = key.split("/");
  if (["resultados", "equipas"].includes(section) && slug) {
    const scope = TEAM_VIEWS.find(item => item.slug === slug);
    if (section === "resultados") {
      state.dataLevel = slug === "todos" ? "all" : scope?.level || "Sub13:7";
      return "data";
    }
    state.teamsLevel = scope?.level || "Sub13:7";
    return "teams";
  }
  if (key.startsWith("live/")) {
    state.liveDetailMatchId = decodeURIComponent(rawKey.slice(5));
    return "live";
  }
  return viewHashes[key] || (viewTitles[key] ? key : "data");
}

function updatePageHash(view = state.currentView) {
  if (view === "data") history.replaceState(null, "", `#resultados/${state.dataLevel === "all" ? "todos" : teamView(state.dataLevel)?.slug || "sub13-fut7"}`);
  if (view === "teams") history.replaceState(null, "", `#equipas/${teamView(state.teamsLevel)?.slug || "sub13-fut7"}`);
}

function renderAuth() {
  const logged = Boolean(state.user);
  $("#sessionLabel").textContent = logged ? `${state.user.name}${isAdmin() ? " · gestão" : ""}` : "Visitante";
  $("#loginOpen").hidden = logged;
  $("#logoutBtn").hidden = !logged;
  $(".delegate-tab").hidden = !canDelegate();
  $("#loginGate").hidden = canDelegate();
  $("#delegateContent").hidden = !canDelegate();
  const syncPanel = $("#excelSyncPanel");
  if (syncPanel) syncPanel.hidden = !isAdmin();
}

function renderDelegateMode() {
  const setup = $("#delegateSetup");
  const toggle = $("#toggleReportView");
  if (!setup || !toggle) return;
  const hasReport = Boolean(state.selectedMatch && state.db.matchReports[state.selectedMatch.id]);
  setup.hidden = hasReport && !state.reportSetupVisible;
  toggle.hidden = !hasReport;
  toggle.textContent = state.reportSetupVisible ? "Ocultar ficha de jogo" : "Ver ficha de jogo";
  updateMatchControlButtons();
}

function selectedMatchEvents() {
  if (!state.selectedMatch) return [];
  return state.db.events.filter((event) => event.matchId === state.selectedMatch.id);
}

function hasSystemEvent(type) {
  return selectedMatchEvents().some((event) => event.team === "Sistema" && event.type === type);
}

function selectedMatchLive() {
  const matchId = state.selectedMatch?.id;
  if (!matchId) return null;
  return state.db.liveGames?.[matchId] || (state.db.live?.matchId === matchId ? state.db.live : null);
}

function canUseMatchControl(control) {
  if (!state.selectedMatch) return { ok: false, reason: "Guarda primeiro a ficha/cria o jogo." };
  const live = selectedMatchLive();
  const period = live?.period || "Pre-jogo";
  if (live?.liveEnded || hasSystemEvent("Fim de jogo")) {
    return { ok: false, reason: "O jogo já terminou." };
  }
  if (control === "start-first") {
    return hasSystemEvent("Início do jogo") || !["Pre-jogo", "Pré-jogo", "Por iniciar"].includes(period)
      ? { ok: false, reason: "O jogo já foi iniciado." }
      : { ok: true };
  }
  if (control === "half-time") {
    return period === "1ª Parte"
      ? { ok: true }
      : { ok: false, reason: "Só podes terminar a 1ª parte depois de clicar em Início do jogo." };
  }
  if (control === "start-second") {
    return period === "Intervalo"
      ? { ok: true }
      : { ok: false, reason: "Só podes iniciar a 2ª parte depois de clicar em Fim da 1ª parte." };
  }
  if (control === "full-time") {
    return period === "2ª Parte"
      ? { ok: true }
      : { ok: false, reason: "Só podes terminar o jogo depois de clicar em Início da 2ª parte." };
  }
  return { ok: false, reason: "Controlo inválido." };
}

function canRegisterMatchEvent() {
  if (!state.selectedMatch) return { ok: false, reason: "Guarda primeiro a ficha/cria o jogo." };
  const live = selectedMatchLive();
  if (!live || ["Pre-jogo", "Pré-jogo", "Por iniciar"].includes(live.period)) {
    return { ok: false, reason: "Só podes registar eventos depois de clicar em Início do jogo." };
  }
  if (hasSystemEvent("Fim de jogo") || live?.liveEnded) {
    return { ok: false, reason: "O jogo já terminou." };
  }
  if (!["1ª Parte", "2ª Parte"].includes(live?.period || "")) {
    return { ok: false, reason: "Só podes registar eventos durante a 1ª ou a 2ª parte." };
  }
  return { ok: true };
}

function updateMatchControlButtons() {
  $$("[data-control]").forEach((button) => {
    const stateForButton = canUseMatchControl(button.dataset.control);
    button.disabled = state.savingEvent || !stateForButton.ok;
    button.title = stateForButton.ok ? "" : stateForButton.reason;
  });
  const addEventButton = $("#addEvent");
  if (addEventButton) {
    const eventState = canRegisterMatchEvent();
    addEventButton.disabled = state.savingEvent || !eventState.ok;
    addEventButton.title = eventState.ok ? "" : eventState.reason;
  }
}

function currentSeasonLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 6 ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
}

function selectedSyncSeason() {
  return state.resultsSeason && state.resultsSeason !== "all" ? state.resultsSeason : currentSeasonLabel();
}

function zerozeroStartSeason() {
  return "2024/2025";
}

function keepResultFilters(callback) {
  const filters = {
    dataLevel: state.dataLevel,
    teamsLevel: state.teamsLevel,
    resultsSeason: state.resultsSeason,
    competitionFilter: state.competitionFilter,
  };
  callback();
  const teams = TEAM_VIEWS;
  if (filters.dataLevel === "all" || teams.some((team) => team.level === filters.dataLevel)) state.dataLevel = filters.dataLevel;
  if (teams.some((team) => team.level === filters.teamsLevel)) state.teamsLevel = filters.teamsLevel;
  if (filters.resultsSeason === "all" || availableSeasons().includes(filters.resultsSeason)) state.resultsSeason = filters.resultsSeason;
  state.competitionFilter = filters.competitionFilter;
}

function login(id, pass) {
  const normalized = id.trim().toLowerCase();
  if (normalized === "delegado" && pass === "0000") return { id: "Delegado", name: "Delegado", role: "delegate" };
  if (normalized === "catarina" && pass === "kikomiau") return { id: "Catarina", name: "Catarina", role: "admin" };
  return null;
}

function renderSelectors() {
  const levelSelect = $("#levelSelect");
  const dataLevelSelect = $("#dataLevelSelect");
  const manualLevelSelect = $("#manualLevel");
  levelSelect.innerHTML = "";
  dataLevelSelect.innerHTML = "";
  if (manualLevelSelect) manualLevelSelect.innerHTML = "";
  dataLevelSelect.append(option("Todos os escalões", "all"));

  delegateTeams.forEach((team) => {
    levelSelect.append(option(team.label, team.level));
    if (manualLevelSelect) manualLevelSelect.append(option(team.label, team.level));
  });

  TEAM_VIEWS.forEach((team) => {
    dataLevelSelect.append(option(team.label, team.level));
  });

  levelSelect.value = state.level;
  const formatSelect = $("#delegateFormat");
  const selectedFormat = activeTeam().format;
  const formats = [...new Set([...availableFormats(state.level), selectedFormat])];
  formatSelect.innerHTML = "";
  formats.forEach(format => formatSelect.append(option(`Futebol de ${format}`, String(format))));
  formatSelect.value = String(selectedFormat);
  formatSelect.disabled = Boolean(state.selectedMatch) || formats.length === 1;
  renderDelegateCompetition();
  if (state.dataLevel !== "all") state.dataLevel = teamView(state.dataLevel)?.level || "Sub13:7";
  dataLevelSelect.value = state.dataLevel;
  if (manualLevelSelect) manualLevelSelect.value = state.dataLevel === "all" ? state.level : teamView(state.dataLevel)?.baseLevel || state.level;
  if ($("#manualSeason") && !$("#manualSeason").value) $("#manualSeason").value = state.resultsSeason === "all" ? currentSeasonLabel() : state.resultsSeason;

  $("#manualOpponentWrap").hidden = false;
  renderDelegateGameChoice();
}

function renderDelegateGameChoice() {
  const saved = state.selectedMatch;
  const calendar = saved ? Boolean(saved.calendarId || saved.source === "CALENDAR_EXCEL" || saved.id.startsWith("calendar_")) : state.delegateGameMode === "calendar";
  $("#delegateGameMode").value = calendar ? "calendar" : "new";
  $("#delegateGameMode").disabled = Boolean(saved);
  $("#delegateCalendarWrap").hidden = !calendar;
  const select = $("#delegateCalendarSelect");
  select.replaceChildren(option("Selecionar jogo", ""));
  const choices = calendarChoices(state.db, state.level);
  if (saved && calendar && !choices.some(match => match.id === saved.id)) choices.unshift(saved);
  for (const match of choices) select.append(option(`${match.date ? calendarDate(match.date) : "Sem data"} · ${match.opponent} (F${matchFormat(match.level, match)})`, match.id));
  select.value = saved?.id || state.calendarSelection;
  select.disabled = Boolean(saved) || !calendar;
  const preview = saved || (calendar ? matchById(state.calendarSelection) : null);
  if (preview) {
    $("#delegateManualOpponent").value = preview.opponent || "";
    $("#delegateVenue").value = preview.venue || "Casa";
    $("#delegateDate").value = preview.date || "";
    $("#delegateRound").value = preview.round || "";
  } else if (!$("#delegateDate").value) $("#delegateDate").value = lisbonToday();
  $("#delegateManualOpponent").readOnly = calendar || Boolean(saved);
  $("#delegateDate").readOnly = calendar || Boolean(saved);
  $("#delegateVenue").disabled = calendar || Boolean(saved);
  if (calendar) {
    $("#delegateCompetition").disabled = true;
    $("#delegateFormat").disabled = true;
  }
}

function renderDelegateCompetition() {
  const select = $("#delegateCompetition");
  const presets = competitionOptions(state.level);
  const saved = state.selectedMatch?.competition;
  let value = saved ? (competitionDefinition(state.level, saved) ? saved : "other") : state.delegateCompetition;
  if (value !== "other" && !presets.some(item => item.name === value)) {
    value = (presets.find(item => item.format === activeTeam().format) || presets[0])?.name || "other";
  }
  select.innerHTML = "";
  presets.forEach(item => select.append(option(item.label, item.name)));
  select.append(option("Outro", "other"));
  select.value = value;
  select.disabled = Boolean(state.selectedMatch);
  select.title = saved || (value === "other" ? state.delegateOtherCompetition : value);
  if (!state.selectedMatch) state.delegateCompetition = value;
  $("#delegateOtherCompetitionWrap").hidden = value !== "other";
  $("#delegateOtherCompetition").value = saved && value === "other" ? saved : state.delegateOtherCompetition;
  $("#delegateOtherCompetition").disabled = Boolean(state.selectedMatch);
}

function delegateCompetitionName() {
  return $("#delegateCompetition").value === "other"
    ? $("#delegateOtherCompetition").value.trim()
    : $("#delegateCompetition").value;
}

function renderMatchCard() {
  const match = state.selectedMatch || (state.delegateGameMode === "calendar" ? matchById(state.calendarSelection) : null);
  $("#matchCard").innerHTML = match
    ? `<strong>${escapeHtml(match.level)} vs ${escapeHtml(match.opponent)}</strong><br>${escapeHtml(match.competition)}<br>${match.date ? `${calendarDate(match.date)} · ` : ""}${escapeHtml(match.venue || "Local por definir")} · Jornada ${escapeHtml(match.round || "-")}`
    : state.delegateGameMode === "calendar" ? "Nenhum jogo selecionado." : "Jogo novo";
}

function parseTactic() {
  const team = activeTeam();
  const raw = $("#tacticInput").value.trim();
  const fallback = team.format === 7 ? "1-3-2-1" : team.format === 9 ? "1-3-3-2" : "1-4-3-3";
  const parts = (raw || fallback)
    .split("-")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part > 0);
  const total = parts.reduce((sum, value) => sum + value, 0);
  return total === team.format ? parts : fallback.split("-").map(Number);
}

function fieldSlots() {
  const rows = parseTactic();
  const slots = [];
  rows.forEach((count, rowIndex) => {
    const y = 88 - rowIndex * (76 / Math.max(rows.length - 1, 1));
    for (let i = 0; i < count; i += 1) {
      const x = count === 1 ? 50 : 18 + i * (64 / (count - 1));
      slots.push({ x, y });
    }
  });
  return slots;
}

function slotsForTactic(tactic, total) {
  const fallback = total === 7 ? "1-3-2-1" : total === 9 ? "1-3-3-2" : "1-4-3-3";
  const parts = (tactic || fallback)
    .split("-")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part > 0);
  const rows = parts.reduce((sum, value) => sum + value, 0) === total ? parts : fallback.split("-").map(Number);
  const slots = [];
  rows.forEach((count, rowIndex) => {
    const y = 88 - rowIndex * (76 / Math.max(rows.length - 1, 1));
    for (let i = 0; i < count; i += 1) {
      const x = count === 1 ? 50 : 18 + i * (64 / (count - 1));
      slots.push({ x, y });
    }
  });
  return slots;
}

function slugName(name) {
  return String(name || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function playerPhoto(name) {
  return `/assets/jogadoras/${slugName(name)}.jpg`;
}

function usablePhotoUrl(url) {
  const text = String(url || "");
  return /imagehandler|\.((png)|(jpe?g)|(webp)|(gif)|(svg))($|[?#])/i.test(text);
}

function playerForName(name, level) {
  return state.db.players.find((player) => player.level === level && player.name === name) || null;
}

function playerPhotoSrc(name, level) {
  const player = playerForName(name, level);
  return usablePhotoUrl(player?.photoUrl) ? player.photoUrl : playerPhoto(name);
}

function pitchMarkup(names, tactic, total, options = {}) {
  const slots = slotsForTactic(tactic, total);
  const level = options.level || matchById(state.liveDetailMatchId || state.db.live?.matchId)?.level;
  const withPhotos = Boolean(options.withPhotos);
  return `
    <div class="pitch mini-pitch">
      <div class="pitch-line halfway"></div>
      <div class="pitch-box top-box"></div>
      <div class="pitch-box bottom-box"></div>
      <div class="center-circle"></div>
      ${slots
        .map((slot, index) => {
          const name = names[index] || "";
          if (!name) return `<span class="player-dot empty" style="left:${slot.x}%;top:${slot.y}%">+</span>`;
          if (withPhotos) {
            return `<span class="player-dot photo-dot" style="left:${slot.x}%;top:${slot.y}%"><img src="${playerPhotoSrc(name, level)}" alt="${name}" onerror="this.parentElement.dataset.initials='${initials(name)}'; this.remove();" /><small>${name}</small></span>`;
          }
          return `<span class="player-dot" style="left:${slot.x}%;top:${slot.y}%">${name}</span>`;
        })
        .join("")}
    </div>
  `;
}

function livePlayerCard(name, index, level) {
  return `
    <article class="live-player-card">
      <div class="player-photo">
        <img src="${playerPhotoSrc(name, level)}" alt="${name}" onerror="this.parentElement.dataset.initials='${initials(name)}'; this.remove();" />
      </div>
      <strong>${index + 1}. ${name}</strong>
    </article>
  `;
}

function syncLineupFromSlots() {
  state.starters = new Set(state.lineupSlots.filter(Boolean));
}

function syncSlotsFromStarters() {
  const total = activeTeam().format;
  const names = [...state.starters].slice(0, total);
  state.lineupSlots = Array.from({ length: total }, (_, index) => names[index] || "");
  syncLineupFromSlots();
}

function resetLineup() {
  state.starters.clear();
  state.bench.clear();
  state.lineupSlots = Array(activeTeam().format).fill("");
  state.selectedSlot = null;
}

function restoreReportState(matchId = state.selectedMatch?.id) {
  const match = matchById(matchId);
  if (!match) return false;
  state.selectedMatch = match;
  state.level = match.level || state.level;
  const team = activeTeam();
  const report = state.db.matchReports?.[match.id] || {};
  const starters = report.lineupSlots?.length ? report.lineupSlots : report.starters || [];
  state.lineupSlots = Array.from({ length: team.format }, (_, index) => starters[index] || "");
  state.starters = new Set(state.lineupSlots.filter(Boolean));
  state.bench = new Set(report.bench || []);
  state.selectedSlot = null;
  return true;
}

function restoreActiveDelegateMatch() {
  const liveIds = [
    state.db.live?.matchId,
    ...Object.keys(state.db.liveGames || {}),
  ].filter(Boolean);
  const reportIds = Object.keys(state.db.matchReports || {});
  const candidates = [...liveIds, ...reportIds];
  const activeId = candidates.find((matchId) => {
    const live = state.db.liveGames?.[matchId] || (state.db.live?.matchId === matchId ? state.db.live : null);
    return state.db.matchReports?.[matchId] && matchById(matchId) && !live?.liveEnded && matchById(matchId).status !== "finished";
  });
  if (activeId) return restoreReportState(activeId);
  resetLineup();
  state.selectedMatch = null;
  return false;
}

function setPickerMode(mode) {
  state.pickerMode = mode;
  $$(".filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === mode));
}

function renderPitch() {
  const pitch = $("#pitch");
  const slots = fieldSlots();
  if (state.lineupSlots.length !== slots.length) {
    const current = state.lineupSlots.filter(Boolean);
    state.lineupSlots = Array.from({ length: slots.length }, (_, index) => current[index] || "");
    syncLineupFromSlots();
  }

  pitch.innerHTML = `
    <div class="pitch-line halfway"></div>
    <div class="pitch-box top-box"></div>
    <div class="pitch-box bottom-box"></div>
    <div class="center-circle"></div>
  `;

  slots.forEach((slot, index) => {
    const name = state.lineupSlots[index] || "";
    const chip = document.createElement("button");
    chip.className = `player-dot ${name ? "" : "empty"} ${state.selectedSlot === index ? "selected" : ""}`;
    chip.style.left = `${slot.x}%`;
    chip.style.top = `${slot.y}%`;
    chip.textContent = name || "+";
    chip.title = name || "Clica para escolher uma jogadora";
    chip.addEventListener("click", () => {
      state.selectedSlot = index;
      setPickerMode("starter");
      renderPlayers();
    });
    pitch.append(chip);
  });

  const bench = document.createElement("div");
  bench.className = "bench-strip";
  bench.innerHTML = `<strong>Banco</strong>${[...state.bench].map((name) => `<span>${name}</span>`).join("") || "<span>Sem suplentes</span>"}`;
  pitch.append(bench);
}

function renderPlayers() {
  const team = activeTeam();
  const report = selectedReport();
  if (!state.lineupSlots.some(Boolean) && report.starters) {
    state.lineupSlots = Array.from({ length: team.format }, (_, index) => report.starters[index] || "");
    syncLineupFromSlots();
  }
  if (!state.bench.size && report.bench) report.bench.forEach((name) => state.bench.add(name));

  $("#lineupHint").textContent = `${team.label}: escolhe ${team.format} titulares; a tática define a disposição no campo.`;
  $("#starterCounter").textContent = `${state.starters.size}/${team.format} titulares`;
  $("#starterCounter").style.color = state.starters.size === team.format ? "#198754" : "#df1f2d";
  $("#pickerTitle").textContent =
    state.pickerMode === "starter"
      ? state.selectedSlot === null
        ? "Escolher titulares"
        : `Escolher para a posição ${state.selectedSlot + 1}`
      : state.pickerMode === "bench"
        ? "Escolher suplentes"
        : "Todas as jogadoras";

  const searchInput = $("#playerSearch");
  if (searchInput && searchInput.value !== state.playerSearch) searchInput.value = state.playerSearch;

  const grid = $("#playerGrid");
  grid.innerHTML = "";
  let visibleCount = 0;
  pickerPlayers().forEach((player) => {
    const selectedStarter = state.starters.has(player.name);
    const selectedBench = state.bench.has(player.name);
    if (state.pickerMode === "starter" && selectedBench) return;
    if (state.pickerMode === "bench" && selectedStarter) return;

    const button = document.createElement("button");
    button.className = `player-card ${selectedStarter ? "is-starter" : ""} ${selectedBench ? "is-bench" : ""}`;
    const status = selectedStarter ? "Titular" : selectedBench ? "Suplente" : "Disponível";
    const levels = (player.levels?.length ? player.levels : [player.level || "Escalão por definir"])
      .map((level) => `<em>${escapeHtml(level)}</em>`)
      .join("");
    button.innerHTML = `<strong>${escapeHtml(player.name)}</strong><span>${status}</span><small class="player-levels">${levels}</small>`;
    button.addEventListener("click", () => togglePlayer(player.name));
    grid.append(button);
    visibleCount += 1;
  });
  if (!visibleCount) {
    grid.innerHTML = `<p class="empty-list">Sem jogadoras encontradas.</p>`;
  }

  renderPitch();
  renderEventPlayers();
}

function togglePlayer(name) {
  const team = activeTeam();
  if (state.pickerMode === "bench") {
    if (state.bench.has(name)) state.bench.delete(name);
    else {
      const index = state.lineupSlots.findIndex((playerName) => playerName === name);
      if (index !== -1) state.lineupSlots[index] = "";
      syncLineupFromSlots();
      state.bench.add(name);
    }
  } else if (state.selectedSlot !== null) {
    const previousSlot = state.lineupSlots.findIndex((playerName) => playerName === name);
    if (previousSlot !== -1) state.lineupSlots[previousSlot] = "";
    state.lineupSlots[state.selectedSlot] = name;
    state.bench.delete(name);
    syncLineupFromSlots();
    state.selectedSlot = null;
  } else if (state.starters.has(name)) {
    const index = state.lineupSlots.findIndex((playerName) => playerName === name);
    if (index !== -1) state.lineupSlots[index] = "";
    syncLineupFromSlots();
  } else {
    if (state.starters.size >= team.format) {
      alert(`Este escalão só pode ter ${team.format} titulares.`);
      return;
    }
    state.bench.delete(name);
    const emptySlot = state.lineupSlots.findIndex((playerName) => !playerName);
    if (emptySlot !== -1) state.lineupSlots[emptySlot] = name;
    syncLineupFromSlots();
  }
  renderPlayers();
}

function renderEventPlayers() {
  const lists = [$("#eventPlayer"), $("#assistPlayer"), $("#subOutPlayer"), $("#subInPlayer")];
  lists.forEach((select) => {
    select.innerHTML = "";
    select.append(option("Selecionar", ""));
  });
  eventPlayers().forEach((player) => {
    lists.forEach((select) => select.append(option(player.name, player.id)));
  });
  updateEventFormMode();
}

function updateEventFormMode() {
  const type = $("#eventType").value;
  const team = $("#eventTeam").value;
  const isOpponent = team === "Adversário";
  const isSub = type === "Substituição" && !isOpponent;
  const needsPlayer = !isOpponent && ["Golo", "Cartão amarelo", "Cartão vermelho", "Falta"].includes(type);
  const needsAssist = !isOpponent && type === "Golo";
  $$(".sub-only").forEach((field) => field.classList.toggle("visible", isSub));
  $$(".assist-only").forEach((field) => field.classList.toggle("visible", needsAssist));
  $(".event-player-main").classList.toggle("hidden", !needsPlayer);
}

function renderLive() {
  const match = currentMatch() || {};
  const live = state.liveDetailMatchId ? (state.db.liveGames || {})[state.liveDetailMatchId] || state.db.live || {} : state.db.live || {};
  const delegateLive = selectedMatchLive();
  $("#scoreMini").textContent = `${delegateLive?.homeScore ?? 0} - ${delegateLive?.awayScore ?? 0}`;
  $("#liveCompetition").textContent = `${match.level || ""} · ${match.competition || ""}`;
  $("#liveTitle").textContent = `Casa Pia AC ${live.homeScore ?? 0} - ${live.awayScore ?? 0} ${match.opponent || "Adversário"}`;
  $("#livePhase").textContent = live.period || "Por iniciar";
  $("#liveStatus").textContent = live.status || "Por iniciar";
  $("#heroStatus").textContent = "#VOAMOSJUNTOS";
}

function eventDescription(event) {
  if (event.type === "Substituição") return `${event.team} · entra ${event.inPlayerName || "-"} · sai ${event.outPlayerName || "-"}`;
  if (event.type === "Golo") return `${event.team}${event.playerName ? ` · ${event.playerName}` : ""}${event.assistName ? ` · ass. ${event.assistName}` : ""}`;
  return `${event.team}${event.playerName ? ` · ${event.playerName}` : ""}`;
}

function eventClass(event) {
  if (event.team === "Sistema") return "system-event";
  if (event.team === "Adversário") return "away-event";
  return "home-event";
}

function eventMarkup(event) {
  if (event.team === "Sistema") return `<span class="event-start">${event.type}</span>`;
  if (event.type === "Golo") {
    const player = event.playerName ? ` · ${event.playerName}` : "";
    const assist = event.assistName ? ` · ass. ${event.assistName}` : "";
    return `<span><strong class="goal-label">Golo · ${event.team}</strong>${player}${assist}</span>`;
  }
  return `<span><strong>${event.type}</strong> · ${eventDescription(event)}</span>`;
}

function renderTimeline() {
  const timeline = $("#timeline");
  const eventLog = $("#eventChronology");
  const matchId = state.liveDetailMatchId || state.db.live?.matchId;
  const eventsNewest = state.db.events.filter((event) => event.matchId === matchId).slice(0, 50);
  const eventsChronological = [...eventsNewest].reverse();
  const delegateEvents = selectedMatchEvents().slice(0, 50).reverse();
  if (timeline) timeline.innerHTML = eventsChronological.length ? "" : "<p>Sem eventos registados neste jogo.</p>";
  if (eventLog) eventLog.innerHTML = delegateEvents.length ? "" : "<p>Sem eventos registados neste jogo.</p>";

  if (timeline) eventsChronological.forEach((event, index) => {
    const item = document.createElement("div");
    item.className = `timeline-item ${eventClass(event)}`;
    item.innerHTML = `<strong>#${index + 1}</strong>${eventMarkup(event)}`;
    timeline.append(item);
  });

  if (eventLog) {
    delegateEvents.forEach((event, index) => {
      const item = document.createElement("div");
      item.className = `timeline-item ${eventClass(event)}`;
      item.innerHTML = `<strong>#${index + 1}</strong>${eventMarkup(event)}${canDelegate() ? `<button class="delete-event" data-event-id="${event.id}">Apagar</button>` : ""}`;
      eventLog.append(item);
    });
  }
  renderLiveDetailSheets();
}

function levelSummary(level) {
  const matches = filteredDataMatches(level);
  const finished = matches.filter((m) => m.goalsFor !== null && m.goalsAgainst !== null);
  const scheduled = matches.length - finished.length;
  const wins = finished.filter((m) => m.goalsFor > m.goalsAgainst).length;
  const draws = finished.filter((m) => m.goalsFor === m.goalsAgainst).length;
  const losses = finished.filter((m) => m.goalsFor < m.goalsAgainst).length;
  const goalsFor = finished.reduce((sum, m) => sum + Number(m.goalsFor || 0), 0);
  const goalsAgainst = finished.reduce((sum, m) => sum + Number(m.goalsAgainst || 0), 0);
  return { matches: matches.length, finished: finished.length, scheduled, wins, draws, losses, goalsFor, goalsAgainst };
}

function resultKind(match) {
  if (match.goalsFor === null || match.goalsAgainst === null) return "pending";
  if (match.goalsFor > match.goalsAgainst) return "win";
  if (match.goalsFor < match.goalsAgainst) return "loss";
  return "draw";
}

function resultLetter(kind) {
  return { win: "V", draw: "E", loss: "D", pending: "-" }[kind];
}

function availableLevelLabelsForSeason() {
  const matches = seasonMatches();
  return [...new Set(matches.map(match => TEAM_VIEWS.find(view => matchesTeamView(match, view.level, state.db.matchReports?.[match.id]))?.label || match.level))]
    .sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));
}

function dataEmptyMessage() {
  const season = state.resultsSeason === "all" ? "todas as épocas" : state.resultsSeason;
  const level = state.dataLevel === "all"
    ? "todos os escalões"
    : teamView(state.dataLevel)?.label || state.dataLevel;
  const available = availableLevelLabelsForSeason();
  if (state.dataLevel !== "all" && available.length) {
    return `
      <div class="empty-state">
        <strong>Sem jogos em ${level} para ${season}.</strong>
        <span>Nesta época existem jogos em: ${available.map(escapeHtml).join(", ")}.</span>
      </div>
    `;
  }
  return `
    <div class="empty-state">
      <strong>Sem jogos para os filtros selecionados.</strong>
      <span>Experimenta mudar a época, escalão ou competição.</span>
    </div>
  `;
}

function renderDataPage() {
  const level = state.dataLevel;
  $("#dataLevelSelect").value = level;
  $("#dataPageHeading").textContent = level === "all" ? "Resultados" : `Resultados · ${teamView(level)?.label || level}`;
  renderResultsSeasonSelect();
  renderCompetitionFilter();
  const summary = levelSummary(level);
  $("#dataCards").innerHTML = [
    ["Jogos", summary.matches, ""],
    ["Realizados", summary.finished, ""],
    ["Por jogar", summary.scheduled, ""],
    ["Vitórias", summary.wins, "result-win"],
    ["Empates", summary.draws, "result-draw"],
    ["Derrotas", summary.losses, "result-loss"],
    ["Golos marcados", summary.goalsFor, "goals-for"],
    ["Golos sofridos", summary.goalsAgainst, "goals-against"],
  ]
    .map(([label, value, tone]) => `<article class="stat-card ${tone}"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");

  const matches = filteredDataMatches(level);
  const calendar = upcomingMatches(matches);
  renderCalendar(calendar);
  const calendarIds = new Set(calendar.map(match => match.id));
  const groups = matches.filter(match => !calendarIds.has(match.id)).reduce((map, match) => {
    const competition = match.competition || "Sem competição";
    if (!map.has(competition)) map.set(competition, []);
    map.get(competition).push(match);
    return map;
  }, new Map());
  const visibleGroups = [...groups.entries()];
  $("#historyTable").innerHTML = visibleGroups
    .map(([competition, matches]) => {
      return `<h3 class="competition-title">${escapeHtml(competition)}</h3>${historyTable(matches)}`;
    })
    .join("") || (calendar.length ? "<p>Sem jogos anteriores para os filtros selecionados.</p>" : dataEmptyMessage());
}

function renderCalendar(matches) {
  $("#calendarCount").textContent = `${matches.length} ${matches.length === 1 ? "jogo" : "jogos"}`;
  $("#calendarGames").innerHTML = matches.map(match => {
    const home = match.homeTeam || (match.venue === "Fora" ? match.opponent : "Casa Pia AC");
    const away = match.awayTeam || (match.venue === "Fora" ? "Casa Pia AC" : match.opponent);
    return `<button type="button" class="calendar-game match-admin-row" data-match-id="${escapeHtml(match.id)}">
      <span class="calendar-when"><time datetime="${escapeHtml(match.date)}">${calendarDate(match.date)}</time><strong>${escapeHtml(match.time || "Hora por definir")}</strong></span>
      <span class="calendar-teams"><strong>${escapeHtml(home)} <span>vs</span> ${escapeHtml(away)}</strong><small>${escapeHtml(competitionLabel(match.competition || "Sem competição"))} · Futebol de ${matchFormat(match.level, match, state.db.matchReports?.[match.id])}</small></span>
      <span class="calendar-location">${escapeHtml([match.venue, match.stadium].filter(Boolean).join(" · "))}</span>
    </button>`;
  }).join("") || "<p>Sem jogos agendados para os filtros selecionados.</p>";
}

function playerAppearances(player) {
  const view = teamView(state.teamsLevel);
  const scope = view?.baseLevel === "Sub13" ? { level: "Sub13", format: view.format } : {};
  return playerMatchHistory(state.db, player, state.resultsSeason, state.teamsCompetition, scope);
}

function playerStats(player) {
  const appearances = playerAppearances(player);
  const goals = appearances.reduce((sum, item) => sum + Number(item.goals || 0), 0);
  const assists = appearances.reduce((sum, item) => sum + Number(item.assists || 0), 0);
  const yellows = appearances.reduce((sum, item) => sum + Number(item.yellows || 0), 0);
  const reds = appearances.reduce((sum, item) => sum + Number(item.reds || 0), 0);
  const games = appearances.filter(item => item.played !== false).length;
  return { appearances, games, goals, assists, yellows, reds };
}

function renderTeamsPage() {
  renderResultsSeasonSelect();
  const teamsSelect = $("#teamsLevelSelect");
  if (!teamsSelect) return;
  teamsSelect.innerHTML = "";
  TEAM_VIEWS.forEach((team) => teamsSelect.append(option(team.label, team.level)));
  state.teamsLevel = teamView(state.teamsLevel)?.level || "Sub13:7";
  teamsSelect.value = state.teamsLevel;
  const scope = teamView(state.teamsLevel);
  $("#teamsPageHeading").textContent = `Equipas · ${scope.label}`;
  const competitions = [...new Set([
    ...competitionOptions(scope.baseLevel).filter(item => scope.baseLevel !== "Sub13" || item.format === scope.format).map(item => item.name),
    ...seasonMatches().filter(match => matchesTeamView(match, state.teamsLevel, state.db.matchReports?.[match.id])).map(match => match.competition || "Sem competição"),
    ...levelPlayers(state.teamsLevel).flatMap(player => playerAppearances(player)
      .map(item => item.competition).filter(Boolean)),
  ])].sort((a, b) => a.localeCompare(b, "pt"));
  if (!competitions.includes(state.teamsCompetition)) state.teamsCompetition = "all";
  const competitionSelect = $("#teamsCompetitionFilter");
  competitionSelect.innerHTML = "";
  competitionSelect.append(option("Todas", "all"));
  competitions.forEach(name => competitionSelect.append(option(competitionLabel(name), name)));
  competitionSelect.value = state.teamsCompetition;

  const players = levelPlayers(state.teamsLevel);
  if (!players.some((player) => player.id === state.selectedPlayerId)) state.selectedPlayerId = players[0]?.id || null;
  $("#teamsGrid").innerHTML = players
    .map((player) => {
      const stats = playerStats(player);
      const photo = usablePhotoUrl(player.photoUrl)
        ? `<img src="${player.photoUrl}" alt="${player.name}" loading="lazy" />`
        : `<span class="player-photo-fallback">${player.name.slice(0, 1)}</span>`;
      return `
        <button class="team-player-card ${state.selectedPlayerId === player.id ? "active" : ""}" data-player-id="${player.id}">
          ${photo}
          <span>
            <strong>${player.name}</strong>
            <small>${stats.games} jogos</small>
          </span>
        </button>
      `;
    })
    .join("") || "<p>Sem jogadoras neste escalão.</p>";
  renderPlayerDetail();
}

function renderPlayerDetail() {
  const detail = $("#playerDetail");
  const content = $("#playerDetailContent");
  if (!detail || !content) return;
  const player = state.db.players.find((item) => item.id === state.selectedPlayerId);
  if (!player) {
    detail.hidden = true;
    return;
  }
  const stats = playerStats(player);
  const rows = stats.appearances.map((item) => [
    escapeHtml(item.opponent || "-"),
    escapeHtml(item.competition || "-"),
    item.format ? `Futebol de ${item.format}` : "-",
    escapeHtml(item.role || "-"),
    item.minutes === "" || item.minutes === null || item.minutes === undefined ? "-" : `${item.minutes} min`,
    `${Number(item.goals || 0)} G`,
    `${Number(item.assists || 0)} A`,
    `${Number(item.yellows || 0)} CA`,
    `${Number(item.reds || 0)} CV`,
  ]);
  const photo = usablePhotoUrl(player.photoUrl)
    ? `<img src="${player.photoUrl}" alt="${player.name}" />`
    : `<span class="player-photo-fallback large">${player.name.slice(0, 1)}</span>`;
  const facts = [
    player.number ? `Nº ${escapeHtml(player.number)}` : "",
    player.position ? escapeHtml(player.position) : "",
    player.birthYear ? escapeHtml(player.birthYear) : "",
  ].filter(Boolean);
  const profileLink = player.profileUrl
    ? `<a class="player-profile-link" href="${escapeHtml(player.profileUrl)}" target="_blank" rel="noreferrer">Ficha FPF</a>`
    : "";
  detail.hidden = false;
  content.innerHTML = `
    <div class="player-profile">
      ${photo}
      <div>
        <p class="eyebrow">Histórico da jogadora</p>
        <h2>${player.name}</h2>
        <span>${player.level}</span>
        ${facts.length || profileLink ? `<small>${facts.join(" · ")} ${profileLink}</small>` : ""}
      </div>
    </div>
    <div class="player-stat-row">
      <article><strong>${stats.games}</strong><span>Jogos</span></article>
      <article><strong>${stats.goals}</strong><span>Golos</span></article>
      <article><strong>${stats.assists}</strong><span>Assist.</span></article>
      <article><strong>${stats.yellows}</strong><span>Amarelos</span></article>
      <article><strong>${stats.reds}</strong><span>Vermelhos</span></article>
    </div>
    <h3 class="competition-title">Histórico</h3>
    <div class="table-wrap">${table(["Adversário", "Competição", "Formato", "Papel", "Tempo", "Golos", "Assist.", "Amarelos", "Vermelhos"], rows)}</div>
  `;
}

function liveGames() {
  const liveMap = state.db.liveGames || {};
  const hidden = new Set(state.db.hiddenLiveGames || []);
  const ids = new Set([...Object.keys(state.db.matchReports || {}), ...Object.keys(liveMap)]);
  return [...ids]
    .filter((matchId) => !hidden.has(matchId))
    .map((matchId) => {
      const match = matchById(matchId);
      const report = state.db.matchReports?.[matchId];
      const fallback = {
        matchId,
        period: report ? "Ficha criada" : "Pre-jogo",
        status: report ? "Ficha criada" : "Por iniciar",
        homeScore: 0,
        awayScore: 0,
        cornersFor: 0,
        cornersAgainst: 0,
      };
      return { match, live: liveMap[matchId] || fallback, hasReport: Boolean(report) };
    })
    .filter((item) => item.match && item.hasReport);
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
}

function matchSourceLabel(match) {
  if (match.source === "CALENDAR_EXCEL") return "Calendário Excel";
  if (match.source === "ZEROZERO") return "ZeroZero";
  if (match.source === "MANUAL") return "Manual";
  if (match.source === "EXCEL") return "Excel";
  return match.source || "Excel / base inicial";
}

function matchUpdatedAt(match) {
  return match.updatedAt || match.syncedAt || match.importedAt || state.db.zerozero?.lastSync?.at || state.db.meta?.updatedAt || "";
}

function showMatchAdmin(matchId) {
  const match = matchById(matchId);
  if (!match) return;
  const report = state.db.matchReports?.[matchId];
  const live = state.db.liveGames?.[matchId] || (state.db.live?.matchId === matchId ? state.db.live : null);
  const events = state.db.events.filter((event) => event.matchId === matchId);
  $("#matchAdminContent").innerHTML = `
    <h2>Detalhes do jogo</h2>
    <p class="modal-kicker">${escapeHtml(match.level || "-")} · ${escapeHtml(match.competition || "Sem competição")}</p>
    <h3>Casa Pia ${match.goalsFor == null && match.goalsAgainst == null && !live ? "vs" : `${match.goalsFor ?? live?.homeScore ?? 0} - ${match.goalsAgainst ?? live?.awayScore ?? 0}`} ${escapeHtml(match.opponent || "Adversário")}</h3>
    <dl class="match-meta-list">
      <div><dt>Fonte</dt><dd>${escapeHtml(matchSourceLabel(match))}</dd></div>
      <div><dt>Época</dt><dd>${escapeHtml(match.season || "-")}</dd></div>
      <div><dt>Atualizado</dt><dd>${escapeHtml(formatDateTime(matchUpdatedAt(match)))}</dd></div>
      <div><dt>Estado</dt><dd>${escapeHtml(live?.status || ({ finished: "Terminado", scheduled: "Por jogar" }[match.status]) || match.status || "-")}</dd></div>
      <div><dt>Ficha</dt><dd>${report ? "Criada" : "Sem ficha"}</dd></div>
      <div><dt>Eventos</dt><dd>${events.length}</dd></div>
      ${match.date ? `<div><dt>Data</dt><dd>${escapeHtml(calendarDate(match.date))}</dd></div>` : ""}
      ${match.time ? `<div><dt>Hora</dt><dd>${escapeHtml(match.time)}</dd></div>` : ""}
      ${match.stadium ? `<div><dt>Campo</dt><dd>${escapeHtml(match.stadium)}</dd></div>` : ""}
    </dl>
    ${canDelegate() && match.status !== "finished" && match.goalsFor == null && match.goalsAgainst == null ? `<button class="primary prepare-calendar-match" data-match-id="${escapeHtml(match.id)}">${report ? "Ver ficha de jogo" : "Preparar ficha de jogo"}</button>` : ""}
    <h3>Cronologia de eventos</h3>
    <div class="timeline result-timeline">${events.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))).map(event => `
      <article class="${eventClass(event)}">
        <strong>${escapeHtml(event.team === "Sistema" ? event.type : `${event.type} · ${eventDescription(event)}`)}</strong>
        <small>${[event.period, event.createdAt ? formatDateTime(event.createdAt) : ""].filter(Boolean).map(escapeHtml).join(" · ")}</small>
      </article>
    `).join("") || "<p>Sem eventos registados neste jogo.</p>"}</div>
    ${isAdmin() ? `<p class="modal-note">Apagar remove o jogo, a ficha e os eventos.</p><button class="danger delete-match" data-match-id="${escapeHtml(match.id)}">Apagar jogo</button>` : ""}
  `;
  $("#matchAdminModal").hidden = false;
}

function hideMatchAdmin() {
  $("#matchAdminModal").hidden = true;
  $("#matchAdminContent").innerHTML = "";
}

function renderLiveHub() {
  const list = $("#liveGamesList");
  if (!list) return;
  const games = liveGames();
  list.innerHTML = games.length ? "" : "<p>Não há jogos em direto neste momento.</p>";
  games.forEach(({ match, live }) => {
    const card = document.createElement("article");
    card.className = "live-card";
  card.innerHTML = `
      <span>${match.level} · ${match.competition}</span>
      <strong>Casa Pia ${live.homeScore ?? 0}-${live.awayScore ?? 0} ${match.opponent}</strong>
      <small>${live.period || "Jogo"} · ${live.status || "Em direto"}</small>
      ${state.db.matchReports?.[match.id] ? "<em>Ficha criada</em>" : ""}
      ${isAdmin() ? `<button class="danger clear-live" data-match-id="${match.id}">Apagar do direto</button>` : ""}
    `;
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openLiveDetail(match.id);
    });
    list.append(card);
  });
}

function openLiveDetail(matchId) {
  state.liveDetailMatchId = matchId;
  const live = (state.db.liveGames || {})[matchId] || state.db.live;
  state.db.live = { ...live, matchId };
  $("#liveListPanel").hidden = true;
  $("#liveDetailPanel").hidden = false;
  renderLive();
  renderTimeline();
}

function renderLiveDetailSheets() {
  const matchId = state.liveDetailMatchId || state.db.live?.matchId;
  const lineup = $("#liveLineupSheet");
  if (!lineup || !matchId) return;
  const report = state.db.matchReports[matchId] || {};
  const match = matchById(matchId);
  const total = matchFormat(match?.level, match || {}, report);
  const starters = report.starters || [];
  lineup.innerHTML = `
    <h3>Tática ${report.tactic || "-"}</h3>
    ${pitchMarkup(starters, report.tactic, total, { withPhotos: true, level: match?.level })}
    <p><strong>Suplentes</strong></p>
    <div class="chip-list">${(report.bench || []).map((name) => `<span>${name}</span>`).join("") || "<span>Sem banco guardado</span>"}</div>
  `;
}

function table(headers, rows) {
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ""}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}">Sem dados registados.</td></tr>`;
  return `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

function historyTable(matches) {
  const headers = ["Jornada", "Adversário", "Local", "Resultado", "Estado"];
  const rows = matches.length
    ? matches.map((match) => {
        const kind = resultKind(match);
        const result = kind === "pending" ? "Por jogar" : `<span class="score"><span class="goals-for">${match.goalsFor}</span>-<span class="goals-against">${match.goalsAgainst}</span></span>`;
        const clickable = "match-admin-row";
        return `
          <tr class="${clickable}" data-match-id="${escapeHtml(match.id)}" tabindex="0" role="button" aria-label="Ver jogo contra ${escapeHtml(match.opponent || "adversario")}">
            <td>${escapeHtml(match.round || "-")}</td>
            <td>${escapeHtml(match.opponent || "-")}<small class="match-format">Futebol de ${matchFormat(match.level, match, state.db.matchReports?.[match.id])}</small></td>
            <td>${escapeHtml(match.venue || "-")}</td>
            <td>${result}</td>
            <td><span class="badge ${kind}">${resultLetter(kind)}</span></td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="${headers.length}">Sem dados registados.</td></tr>`;
  return `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
}

function hydrateReportFields() {
  const report = selectedReport();
  if (state.selectedMatch) {
    $("#delegateManualOpponent").value = state.selectedMatch.opponent || "";
    $("#delegateVenue").value = state.selectedMatch.venue || "Casa";
    $("#delegateRound").value = state.selectedMatch.round || "";
    $("#delegateDate").value = state.selectedMatch.date || "";
  }
  $("#delegateName").value = report.delegate || "";
  $("#tacticInput").value = report.tactic || "";
  $("#notesInput").value = report.notes || "";
}

function renderAll() {
  renderSelectors();
  renderMatchCard();
  hydrateReportFields();
  renderPlayers();
  renderLive();
  renderTimeline();
  renderDataPage();
  renderTeamsPage();
  renderDelegateMode();
}

async function activateSelectedMatch() {
  if (!state.selectedMatch) return;
  await request("/api/live", {
    method: "POST",
    body: JSON.stringify({
      matchId: state.selectedMatch.id,
      reset: true,
      period: "Pre-jogo",
      homeScore: 0,
      awayScore: 0,
      status: "Por iniciar",
      liveEnded: false,
      cornersFor: 0,
      cornersAgainst: 0,
    }),
  });
  const fresh = await request("/api/bootstrap");
  state.db.live = fresh.live;
  state.db.liveGames = fresh.liveGames;
  state.db.hiddenLiveGames = fresh.hiddenLiveGames;
  state.db.events = fresh.events;
  state.db.matches = fresh.matches;
  state.db.matchReports = fresh.matchReports;
}

async function bootstrap() {
  state.db = await request("/api/bootstrap");
  state.level = teamOptions()[0]?.level || "Sub13";
  state.dataLevel = TEAM_VIEWS[0].level;
  state.teamsLevel = TEAM_VIEWS[0].level;
  restoreActiveDelegateMatch();
  renderAll();
  renderAuth();
  setView(viewFromHash());
}

async function refreshLive() {
  if (state.refreshingLive || state.savingEvent) return;
  state.refreshingLive = true;
  const revision = state.delegateRevision;
  try {
    const fresh = await request("/api/bootstrap");
    if (state.savingEvent || revision !== state.delegateRevision) return;
    state.db.live = fresh.live;
    state.db.liveGames = fresh.liveGames;
    state.db.hiddenLiveGames = fresh.hiddenLiveGames;
    state.db.events = fresh.events;
    state.db.matches = fresh.matches;
    state.db.matchReports = fresh.matchReports;
    if (state.selectedMatch) state.selectedMatch = matchById(state.selectedMatch.id) || state.selectedMatch;

    if (state.currentView === "live") {
      const detailStillAvailable = state.liveDetailMatchId && liveGames().some(({ match }) => match.id === state.liveDetailMatchId);
      if (state.liveDetailMatchId && !detailStillAvailable) {
        state.liveDetailMatchId = null;
        $("#liveListPanel").hidden = false;
        $("#liveDetailPanel").hidden = true;
      }
      renderLiveHub();
      if (state.liveDetailMatchId) {
        renderLive();
        renderTimeline();
      }
    }
    if (state.currentView === "data") renderDataPage();
    if (state.currentView === "teams") renderTeamsPage();
    if (state.currentView === "delegate") {
      renderLive();
      renderTimeline();
      renderDelegateMode();
      updateMatchControlButtons();
    }
    renderAuth();
  } finally {
    state.refreshingLive = false;
  }
}

function applyFreshDb(fresh) {
  state.db = fresh;
  state.level = teamOptions().find((team) => team.level === state.level)?.level || teamOptions()[0]?.level || "Sub13";
  state.dataLevel = state.dataLevel === "all" ? "all" : teamView(state.dataLevel)?.level || "Sub13:7";
  state.teamsLevel = teamView(state.teamsLevel)?.level || "Sub13:7";
  restoreActiveDelegateMatch();
  renderAll();
  renderAuth();
  renderLiveHub();
}

async function saveDelegateAction(button, route, payload) {
  if (state.savingEvent) return;
  state.savingEvent = true;
  state.delegateRevision += 1;
  const label = button.textContent;
  button.textContent = "A guardar...";
  updateMatchControlButtons();
  let failure;
  try {
    const fresh = await request(route, { method: "POST", body: JSON.stringify(payload), silentError: true });
    state.db = fresh;
    if (state.selectedMatch) state.selectedMatch = matchById(state.selectedMatch.id) || state.selectedMatch;
    renderLive();
    renderTimeline();
    renderDataPage();
    renderDelegateMode();
  } catch (error) {
    failure = error;
    // The server may have saved an action even if its response never arrived.
    try {
      state.db = await request("/api/bootstrap");
      if (state.selectedMatch) state.selectedMatch = matchById(state.selectedMatch.id) || state.selectedMatch;
      renderLive();
      renderTimeline();
      renderDataPage();
      renderDelegateMode();
    } catch {}
  } finally {
    state.savingEvent = false;
    button.textContent = label;
    updateMatchControlButtons();
  }
  if (failure) alert(`Não foi possível confirmar a alteração: ${failure.message}. Confirma o estado do jogo antes de repetir.`);
}

async function setMatchControl(control) {
  if (state.savingEvent) return;
  const allowed = canUseMatchControl(control);
  if (!allowed.ok) {
    alert(allowed.reason);
    updateMatchControlButtons();
    return;
  }
  await saveDelegateAction($(`[data-control="${control}"]`), "/api/match-control", { control, matchId: state.selectedMatch.id });
}

$$(".tab").forEach((tab) => tab.addEventListener("click", () => {
  const hash = Object.entries(viewHashes).find(([, view]) => view === tab.dataset.view)?.[0] || tab.dataset.view;
  history.replaceState(null, "", `#${hash}`);
  setView(tab.dataset.view);
}));

$("#loginOpen").addEventListener("click", () => {
  $(".delegate-tab").hidden = false;
  setView("delegate");
});

$("#loginSubmit").addEventListener("click", () => {
  const user = login($("#loginId").value, $("#loginPass").value);
  if (!user) {
    $("#loginError").textContent = "Credenciais inválidas.";
    return;
  }
  state.user = user;
  localStorage.setItem("cpacUser", JSON.stringify(user));
  $("#loginError").textContent = "";
  renderAuth();
  refreshLive();
  setView("delegate");
});

$("#logoutBtn").addEventListener("click", () => {
  state.user = null;
  localStorage.removeItem("cpacUser");
  renderAuth();
  refreshLive();
  setView("data");
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") hideMatchAdmin();
  const row = event.target.closest(".match-admin-row");
  if (row && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    showMatchAdmin(row.dataset.matchId);
  }
});

document.addEventListener("click", async (event) => {
  const matchRow = event.target.closest(".match-admin-row");
  if (matchRow) {
    showMatchAdmin(matchRow.dataset.matchId);
    return;
  }

  const prepare = event.target.closest(".prepare-calendar-match");
  if (prepare && canDelegate()) {
    const match = matchById(prepare.dataset.matchId);
    if (!match) return;
    if (state.selectedMatch && state.selectedMatch.id !== match.id) {
      alert("Limpa primeiro a ficha atual antes de preparar outro jogo.");
      return;
    }
    hideMatchAdmin();
    restoreReportState(match.id);
    state.reportSetupVisible = true;
    renderAll();
    setView("delegate");
    $("#delegateSetup").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const deleteMatch = event.target.closest(".delete-match");
  if (deleteMatch && isAdmin()) {
    const match = matchById(deleteMatch.dataset.matchId);
    if (!match) return;
    if (!confirm(`Apagar definitivamente o jogo Casa Pia vs ${match.opponent}?`)) return;
    await request(`/api/matches/${encodeURIComponent(match.id)}`, { method: "DELETE" });
    hideMatchAdmin();
    applyFreshDb(await request("/api/bootstrap"));
    return;
  }

  if (event.target.closest("#closeMatchAdmin") || event.target.id === "matchAdminModal") {
    hideMatchAdmin();
    return;
  }

  const teamPlayer = event.target.closest(".team-player-card");
  if (teamPlayer) {
    state.selectedPlayerId = teamPlayer.dataset.playerId;
    renderTeamsPage();
    return;
  }

  const deleteEvent = event.target.closest(".delete-event");
  if (deleteEvent && canDelegate()) {
    await request(`/api/events/${encodeURIComponent(deleteEvent.dataset.eventId)}`, { method: "DELETE" });
    await refreshLive();
    return;
  }
  const clearLive = event.target.closest(".clear-live");
  if (clearLive && isAdmin()) {
    await request(`/api/live/${encodeURIComponent(clearLive.dataset.matchId)}`, { method: "DELETE" });
    if (state.liveDetailMatchId === clearLive.dataset.matchId) {
      state.liveDetailMatchId = null;
      $("#liveListPanel").hidden = false;
      $("#liveDetailPanel").hidden = true;
    }
    await refreshLive();
  }
});

$("#backToLiveList").addEventListener("click", () => {
  state.liveDetailMatchId = null;
  $("#liveListPanel").hidden = false;
  $("#liveDetailPanel").hidden = true;
  renderLiveHub();
});

$$(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    state.pickerMode = button.dataset.filter;
    state.selectedSlot = null;
    $$(".filter").forEach((item) => item.classList.toggle("active", item === button));
    renderPlayers();
  });
});

$("#playerSearch")?.addEventListener("input", () => {
  state.playerSearch = $("#playerSearch").value;
  renderPlayers();
});

$$("[data-control]").forEach((button) => {
  button.addEventListener("click", () => setMatchControl(button.dataset.control));
});

$("#levelSelect").addEventListener("change", async () => {
  if (state.selectedMatch) {
    $("#levelSelect").value = state.level;
    alert("Limpa primeiro a ficha atual para preparar um novo jogo.");
    return;
  }
  state.level = $("#levelSelect").value;
  state.calendarSelection = "";
  state.matchFormat = availableFormats(state.level)[0];
  state.delegateCompetition = "";
  state.delegateOtherCompetition = "";
  state.selectedMatch = null;
  resetLineup();
  renderAll();
});

$("#delegateGameMode").addEventListener("change", () => {
  if (state.selectedMatch) return;
  state.delegateGameMode = $("#delegateGameMode").value;
  state.calendarSelection = "";
  if (state.delegateGameMode === "new") {
    $("#delegateManualOpponent").value = "";
    $("#delegateDate").value = lisbonToday();
    $("#delegateRound").value = "";
    $("#delegateVenue").value = "Casa";
  }
  renderSelectors();
  renderMatchCard();
});

$("#delegateCalendarSelect").addEventListener("change", () => {
  if (state.selectedMatch) return;
  const match = matchById($("#delegateCalendarSelect").value);
  if (!match) { state.calendarSelection = ""; return; }
  const format = matchFormat(match.level, match);
  if (format !== activeTeam().format) {
    if ((state.starters.size || state.bench.size) && !confirm("Este jogo tem outro formato e limpa a escolha das jogadoras. Continuar?")) {
      $("#delegateCalendarSelect").value = state.calendarSelection;
      return;
    }
    state.matchFormat = format;
    resetLineup();
  }
  state.calendarSelection = match.id;
  state.delegateCompetition = competitionDefinition(match.level, match.competition) ? match.competition : "other";
  state.delegateOtherCompetition = state.delegateCompetition === "other" ? match.competition : "";
  renderSelectors();
  renderMatchCard();
  renderPlayers();
});

$("#dataLevelSelect").addEventListener("change", () => {
  state.dataLevel = $("#dataLevelSelect").value;
  updatePageHash();
  state.competitionFilter = "all";
  renderDataPage();
});

$("#competitionFilter")?.addEventListener("change", () => {
  state.competitionFilter = $("#competitionFilter").value;
  renderDataPage();
});

$("#resultsSeasonSelect")?.addEventListener("change", () => {
  state.resultsSeason = $("#resultsSeasonSelect").value;
  state.competitionFilter = "all";
  renderDataPage();
  renderTeamsPage();
});

$("#teamsLevelSelect")?.addEventListener("change", () => {
  state.teamsLevel = $("#teamsLevelSelect").value;
  updatePageHash();
  state.teamsCompetition = "all";
  state.selectedPlayerId = null;
  renderTeamsPage();
});

$("#teamsSeasonSelect")?.addEventListener("change", () => {
  state.resultsSeason = $("#teamsSeasonSelect").value;
  state.competitionFilter = "all";
  renderDataPage();
  renderTeamsPage();
});

$("#teamsCompetitionFilter").addEventListener("change", () => {
  state.teamsCompetition = $("#teamsCompetitionFilter").value;
  renderTeamsPage();
});

$("#delegateOtherCompetition").addEventListener("input", () => {
  state.delegateOtherCompetition = $("#delegateOtherCompetition").value;
});

$("#delegateCompetition").addEventListener("change", () => {
  if (state.selectedMatch) return;
  const value = $("#delegateCompetition").value;
  const preset = competitionDefinition(state.level, value);
  if (preset && preset.format !== activeTeam().format) {
    if ((state.starters.size || state.bench.size) && !confirm("Esta competição altera o formato e limpa a escolha das jogadoras. Continuar?")) {
      $("#delegateCompetition").value = state.delegateCompetition;
      return;
    }
    state.matchFormat = preset.format;
    resetLineup();
    $("#tacticInput").value = "";
  }
  state.delegateCompetition = value;
  renderSelectors();
  renderPlayers();
  renderEventPlayers();
});

$("#delegateFormat").addEventListener("change", () => {
  if (state.selectedMatch) return;
  const format = Number($("#delegateFormat").value);
  if (!availableFormats(state.level).includes(format)) return;
  if ((state.starters.size || state.bench.size) && !confirm("Alterar o formato limpa a escolha de titulares e suplentes. Continuar?")) {
    $("#delegateFormat").value = String(activeTeam().format);
    return;
  }
  state.matchFormat = format;
  if (state.delegateCompetition !== "other") {
    state.delegateCompetition = competitionOptions(state.level).find(item => item.format === format)?.name || "other";
  }
  resetLineup();
  $("#tacticInput").value = "";
  renderSelectors();
  renderPlayers();
  renderEventPlayers();
});

async function ensureDelegateMatch() {
  if (state.selectedMatch) {
    if (selectedMatchLive()?.liveEnded || state.selectedMatch.status === "finished") {
      alert("Este jogo terminou. Clica em Limpar ficha para criar outra partida.");
      return null;
    }
    if (!selectedMatchLive() && !state.db.events.some(event => event.matchId === state.selectedMatch.id)) await activateSelectedMatch();
    return state.selectedMatch;
  }
  if (state.delegateGameMode === "calendar") {
    const matchId = state.calendarSelection;
    if (!matchId) { alert("Seleciona um jogo do calendário."); $("#delegateCalendarSelect").focus(); return null; }
    const fresh = await request("/api/bootstrap");
    const match = calendarChoices(fresh, state.level).find(match => match.id === matchId);
    if (!match) { alert("Este jogo já tem uma ficha ou foi alterado. Atualiza a página para confirmar o estado."); return null; }
    if (!confirm(`Confirmas que a ficha corresponde a ${match.opponent}, em ${calendarDate(match.date)}, ${match.venue.toLowerCase()}?`)) return null;
    state.db = fresh;
    state.selectedMatch = match;
    const round = $("#delegateRound").value.trim();
    if (round && round !== match.round) {
      const updated = await request("/api/manual-match", { method: "POST", body: JSON.stringify({ ...match, round }) });
      state.db = updated;
      state.selectedMatch = updated.manualMatch;
    }
    state.reportSetupVisible = true;
    await activateSelectedMatch();
    return state.selectedMatch;
  }
  const opponent = $("#delegateManualOpponent").value.trim();
  const competition = delegateCompetitionName();
  const date = $("#delegateDate").value;
  if (!date) { alert("Indica a data do jogo."); $("#delegateDate").focus(); return null; }
  if (!competition) {
    alert("Escreve o nome da competição.");
    $("#delegateOtherCompetition").focus();
    return null;
  }
  if (!opponent) {
    alert("Escreve a equipa adversária.");
    return null;
  }
  const freshCalendar = await request("/api/bootstrap");
  const planned = calendarMatchesOnDate(freshCalendar, { level: state.level, format: activeTeam().format, date, competition, venue: $("#delegateVenue").value });
  if (planned.length && !confirm(`Já existe um jogo do calendário nesse dia: ${planned.map(match => match.opponent).join(", ")}. Queres criar outro jogo separado?`)) {
    state.db = freshCalendar;
    state.delegateGameMode = "calendar";
    state.calendarSelection = planned.length === 1 ? planned[0].id : "";
    renderSelectors();
    return null;
  }
  const fresh = await request("/api/manual-match", {
    method: "POST",
    body: JSON.stringify({
      id: `manual_${crypto.randomUUID()}`,
      level: state.level,
      format: activeTeam().format,
      season: state.resultsSeason === "all" ? currentSeasonLabel() : state.resultsSeason,
      competition,
      opponent,
      venue: $("#delegateVenue").value,
      round: $("#delegateRound").value.trim(),
      date,
      calendarLinkDeclined: true,
      createdBy: state.user?.name || "",
    }),
  });
  state.db = fresh;
  state.selectedMatch = fresh.manualMatch;
  state.reportSetupVisible = true;
  await activateSelectedMatch();
  return state.selectedMatch;
}

$("#tacticInput").addEventListener("input", () => {
  syncSlotsFromStarters();
  renderPlayers();
});
$("#eventType").addEventListener("change", updateEventFormMode);
$("#eventTeam").addEventListener("change", updateEventFormMode);

$("#saveReport").addEventListener("click", async () => {
  if (state.savingReport) return;
  const team = activeTeam();
  if (state.starters.size !== team.format) {
    alert(`Este escalão precisa de ${team.format} titulares.`);
    return;
  }
  state.savingReport = true;
  state.delegateRevision += 1;
  $("#saveReport").disabled = true;
  $("#clearReport").disabled = true;
  try {
    const match = await ensureDelegateMatch();
    if (!match) return;
    await request("/api/report", {
      method: "POST",
      body: JSON.stringify({
        matchId: state.selectedMatch.id,
        delegate: $("#delegateName").value,
        format: activeTeam().format,
        tactic: $("#tacticInput").value,
        notes: $("#notesInput").value,
        starters: state.lineupSlots.filter(Boolean),
        lineupSlots: state.lineupSlots,
        bench: [...state.bench],
      }),
    });
    await refreshLive();
    renderSelectors();
    hydrateReportFields();
    renderMatchCard();
    renderEventPlayers();
    state.reportSetupVisible = false;
    renderDelegateMode();
  } finally {
    state.savingReport = false;
    $("#saveReport").disabled = false;
    $("#clearReport").disabled = false;
  }
});

$("#clearReport").addEventListener("click", async () => {
  const live = selectedMatchLive();
  const finished = live?.liveEnded || state.selectedMatch?.status === "finished";
  if (state.selectedMatch && !finished && hasSystemEvent("Início do jogo")) {
    alert("Termina o jogo antes de limpar a ficha e preparar outra partida.");
    return;
  }
  if (state.selectedMatch) {
    if (!confirm(finished
      ? "Preparar uma nova ficha? A ficha, o resultado e os eventos do jogo terminado ficam guardados."
      : "Limpar a ficha atual para preparar um novo jogo?")) return;
    if (!finished) {
      await request("/api/report", {
        method: "POST",
        body: JSON.stringify({ matchId: state.selectedMatch.id, clear: true }),
      });
      await refreshLive();
    }
  }
  state.selectedMatch = null;
  state.reportSetupVisible = true;
  state.delegateCompetition = "";
  state.delegateOtherCompetition = "";
  state.delegateGameMode = "calendar";
  state.calendarSelection = "";
  state.playerSearch = "";
  $("#playerSearch").value = "";
  $("#delegateManualOpponent").value = "";
  $("#delegateVenue").value = "Casa";
  $("#delegateRound").value = "";
  $("#delegateDate").value = lisbonToday();
  resetLineup();
  setPickerMode("starter");
  renderAll();
  $("#delegateSetup").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#toggleReportView")?.addEventListener("click", () => {
  state.reportSetupVisible = !state.reportSetupVisible;
  renderDelegateMode();
});

$("#addEvent").addEventListener("click", async () => {
  if (state.savingEvent) return;
  const eventState = canRegisterMatchEvent();
  if (!eventState.ok) {
    alert(eventState.reason);
    updateMatchControlButtons();
    return;
  }
  const type = $("#eventType").value;
  const team = $("#eventTeam").value;
  const player = eventPlayers().find((item) => item.id === $("#eventPlayer").value);
  const assist = eventPlayers().find((item) => item.id === $("#assistPlayer").value);
  const outPlayer = eventPlayers().find((item) => item.id === $("#subOutPlayer").value);
  const inPlayer = eventPlayers().find((item) => item.id === $("#subInPlayer").value);

  if (team === "Casa Pia" && ["Golo", "Cartão amarelo", "Cartão vermelho", "Falta"].includes(type) && !player) {
    alert("Escolhe uma jogadora da ficha de jogo guardada.");
    return;
  }
  if (team === "Casa Pia" && type === "Substituição" && (!outPlayer || !inPlayer)) {
    alert("Escolhe a jogadora que sai e a jogadora que entra.");
    return;
  }

  await saveDelegateAction($("#addEvent"), "/api/events", {
      matchId: state.selectedMatch.id,
      type,
      team,
      period: selectedMatchLive()?.period || "Jogo",
      playerId: team === "Adversário" ? "" : player?.id || "",
      playerName: team === "Adversário" ? "" : player?.name || "",
      assistId: team === "Adversário" ? "" : assist?.id || "",
      assistName: team === "Adversário" ? "" : assist?.name || "",
      outPlayerId: team === "Adversário" ? "" : outPlayer?.id || "",
      outPlayerName: team === "Adversário" ? "" : outPlayer?.name || "",
      inPlayerId: team === "Adversário" ? "" : inPlayer?.id || "",
      inPlayerName: team === "Adversário" ? "" : inPlayer?.name || "",
  });
});

$("#uploadExcel")?.addEventListener("click", async () => {
  if (!isAdmin()) return;
  const file = $("#excelFileInput").files[0];
  if (!file) {
    $("#syncStatus").textContent = "Escolhe primeiro o ficheiro Casa pia.xlsx.";
    return;
  }
  $("#syncStatus").textContent = "A importar Excel...";
  const response = await fetch("/api/import-xlsx", {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Filename": file.name,
    },
    body: await file.arrayBuffer(),
  });
  if (!response.ok) {
    $("#syncStatus").textContent = "Nao foi possivel importar o Excel.";
    throw new Error(await response.text());
  }
  applyFreshDb(await response.json());
  $("#syncStatus").textContent = "Resultados, jogos e jogadoras atualizados pelo Excel.";
});

$("#syncExcelUrl")?.addEventListener("click", async () => {
  if (!isAdmin()) return;
  $("#syncStatus").textContent = "A sincronizar pelo link online...";
  try {
    const fresh = await request("/api/sync-excel-url", { method: "POST" });
    applyFreshDb(fresh);
    $("#syncStatus").textContent = "Excel online sincronizado automaticamente.";
  } catch (error) {
    $("#syncStatus").textContent = "Configura primeiro CASA_PIA_XLSX_URL no servidor.";
    throw error;
  }
});

$("#reloadSource")?.addEventListener("click", async () => {
  if (!isAdmin()) return;
  $("#syncStatus").textContent = "A recarregar o Excel local...";
  try {
    applyFreshDb(await request("/api/reload-source", { method: "POST" }));
    $("#syncStatus").textContent = "Excel local recarregado.";
  } catch (error) {
    $("#syncStatus").textContent = "Este botao so funciona no computador/servidor que tem acesso ao Excel local.";
    throw error;
  }
});

$("#syncZerozeroDryRun")?.addEventListener("click", async () => {
  if (!isAdmin()) return;
  const season = zerozeroStartSeason();
  $("#syncStatus").textContent = `A testar ZeroZero desde ${season} até à época atual...`;
  const result = await request("/api/sync-zerozero", {
    method: "POST",
    body: JSON.stringify({ dryRun: true, season, untilCurrent: true }),
  });
  $("#syncStatus").textContent = result.status?.ok
    ? `Teste ZeroZero concluído: ${result.status.fetched || 0} jogos encontrados.`
    : `Não foi possível testar o ZeroZero: ${result.status?.error || "erro desconhecido"}.`;
});

$("#syncZerozero")?.addEventListener("click", async () => {
  if (!isAdmin()) return;
  const season = zerozeroStartSeason();
  $("#syncStatus").textContent = `A sincronizar resultados ZeroZero desde ${season} até à época atual...`;
  const fresh = await request("/api/sync-zerozero", {
    method: "POST",
    body: JSON.stringify({ dryRun: false, season, untilCurrent: true, updateResults: true }),
  });
  if (fresh.status?.ok) {
    keepResultFilters(() => applyFreshDb(fresh));
    renderAll();
    $("#syncStatus").textContent = `ZeroZero sincronizado: ${fresh.status.fetched || 0} jogos de todas as épocas aplicados aos Resultados.`;
  } else {
    $("#syncStatus").textContent = `Não foi possível sincronizar o ZeroZero: ${fresh.status?.error || "erro desconhecido"}.`;
  }
});

$("#syncZerozeroUntilCurrent")?.addEventListener("click", async () => {
  if (!isAdmin()) return;
  const season = zerozeroStartSeason();
  $("#syncStatus").textContent = `A sincronizar ZeroZero desde ${season} até à época atual...`;
  const fresh = await request("/api/sync-zerozero", {
    method: "POST",
    body: JSON.stringify({ dryRun: false, season, untilCurrent: true, updateResults: true }),
  });
  if (fresh.status?.ok) {
    keepResultFilters(() => applyFreshDb(fresh));
    renderAll();
    $("#syncStatus").textContent = `ZeroZero sincronizado até à atualidade: ${fresh.status.fetched || 0} jogos aplicados.`;
  } else {
    $("#syncStatus").textContent = `Não foi possível sincronizar até à atualidade: ${fresh.status?.error || "erro desconhecido"}.`;
  }
});

$("#saveManualMatch")?.addEventListener("click", async () => {
  if (!isAdmin()) return;
  const payload = {
    level: $("#manualLevel").value,
    season: $("#manualSeason").value.trim(),
    competition: $("#manualCompetition").value.trim(),
    opponent: $("#manualOpponent").value.trim(),
    venue: $("#manualVenue").value,
    round: $("#manualRound").value.trim(),
    date: $("#manualDate").value,
    time: $("#manualTime").value,
    goalsFor: $("#manualGoalsFor").value,
    goalsAgainst: $("#manualGoalsAgainst").value,
    createdBy: state.user?.name || "",
  };
  if (!payload.competition || !payload.opponent) {
    $("#syncStatus").textContent = "Preenche pelo menos a competição e o adversário.";
    return;
  }
  const fresh = await request("/api/manual-match", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  applyFreshDb(fresh);
  state.dataLevel = payload.level === "Sub13" ? `Sub13:${matchFormat(payload.level, fresh.manualMatch)}` : payload.level;
  state.resultsSeason = payload.season || "all";
  state.competitionFilter = payload.competition;
  renderAll();
  ["manualCompetition", "manualOpponent", "manualRound", "manualDate", "manualTime", "manualGoalsFor", "manualGoalsAgainst"].forEach((id) => {
    const input = $(`#${id}`);
    if (input) input.value = "";
  });
  $("#syncStatus").textContent = "Jogo manual guardado e aplicado aos Resultados.";
});

const delegateMobileLayout = window.matchMedia("(max-width: 900px)");
function positionDelegateActions() {
  const parent = delegateMobileLayout.matches ? $("#delegateSetup .lineup-panel") : $("#delegateSetup > .compact");
  parent.append($(".delegate-actions"));
}
positionDelegateActions();
delegateMobileLayout.addEventListener("change", positionDelegateActions);

await bootstrap();
window.addEventListener("hashchange", () => setView(viewFromHash()));
function refreshVisiblePublicData() {
  if (!state.savingReport && document.visibilityState === "visible" && ["live", "data", "teams"].includes(state.currentView)) {
    refreshLive().catch(error => console.warn("Nao foi possivel atualizar os dados:", error.message));
  }
}
setInterval(() => {
  if (document.visibilityState === "visible" && state.currentView === "live") refreshLive();
}, 5000);
setInterval(() => {
  if (["data", "teams"].includes(state.currentView)) refreshVisiblePublicData();
}, 30000);

window.addEventListener("focus", () => {
  refreshVisiblePublicData();
});

document.addEventListener("visibilitychange", () => {
  refreshVisiblePublicData();
});

window.addEventListener("pageshow", () => {
  refreshVisiblePublicData();
});
