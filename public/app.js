const state = {
  db: null,
  level: "Sub13",
  dataLevel: "Sub13",
  selectedMatch: null,
  starters: new Set(),
  bench: new Set(),
  lineupSlots: [],
  selectedSlot: null,
  pickerMode: "starter",
  user: JSON.parse(localStorage.getItem("cpacUser") || "null"),
  liveDetailMatchId: null,
  competitionFilter: "all",
  teamsLevel: "Sub13",
  selectedPlayerId: null,
  playerSearch: "",
  resultsSeason: "all",
  reportSetupVisible: true,
  currentView: "data",
  refreshingLive: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const viewTitles = { data: "Resultados", teams: "Equipas", delegate: "Delegado", live: "Live" };
const viewHashes = { resultados: "data", equipas: "teams", delegado: "delegate", live: "live" };
const delegateTeams = [
  { level: "Sub13", format: 7, label: "Sub13 Futebol 7" },
  { level: "Sub15", format: 9, label: "Sub15 Futebol 9" },
  { level: "Sub17", format: 11, label: "Sub17 Futebol 11" },
  { level: "Sub19", format: 11, label: "Sub19 Futebol 11" },
  { level: "Seniores", format: 11, label: "Seniores Futebol 11" },
];

async function request(route, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const freshRoute = method === "GET" ? `${route}${route.includes("?") ? "&" : "?"}_=${Date.now()}` : route;
  const response = await fetch(freshRoute, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function option(label, value = label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function activeTeam() {
  return delegateTeams.find((team) => team.level === state.level) || state.db.teams.find((team) => team.level === state.level) || delegateTeams[0];
}

function levelPlayers(level = state.level) {
  return allPlayers()
    .filter((player) => player.level === level);
}

function teamOptions() {
  const byLevel = new Map();
  [...(state.db?.teams || []), ...delegateTeams].forEach((team) => {
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
  if (level === "all") return seasonMatches();
  return seasonMatches().filter((match) => match.level === level);
}

function dataCompetitions(level = state.dataLevel) {
  return [...new Set(dataLevelMatches(level).map((match) => match.competition || "Sem competição"))]
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
  competitions.forEach((competition) => select.append(option(competition, competition)));
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
  if (view === "delegate" && !canDelegate()) {
    $(".delegate-tab").hidden = false;
  }
  $("#brandTitle").textContent = "Casa Pia AC";
  $("#pageTitle").textContent = viewTitles[view] || "Casa Pia AC";
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  if (view === "data") renderDataPage();
  if (view === "teams") renderTeamsPage();
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
  if (key.startsWith("live/")) {
    state.liveDetailMatchId = decodeURIComponent(rawKey.slice(5));
    return "live";
  }
  return viewHashes[key] || (viewTitles[key] ? key : "data");
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
    return hasSystemEvent("Início do jogo")
      ? { ok: false, reason: "O jogo já foi iniciado." }
      : { ok: true };
  }
  if (control === "half-time") {
    return hasSystemEvent("Início do jogo") && period === "1ª Parte"
      ? { ok: true }
      : { ok: false, reason: "Só podes terminar a 1ª parte depois de clicar em Início do jogo." };
  }
  if (control === "start-second") {
    return hasSystemEvent("Fim da 1ª parte") && period === "Intervalo"
      ? { ok: true }
      : { ok: false, reason: "Só podes iniciar a 2ª parte depois de clicar em Fim da 1ª parte." };
  }
  if (control === "full-time") {
    return hasSystemEvent("Início da 2ª parte") && period === "2ª Parte"
      ? { ok: true }
      : { ok: false, reason: "Só podes terminar o jogo depois de clicar em Início da 2ª parte." };
  }
  return { ok: false, reason: "Controlo inválido." };
}

function canRegisterMatchEvent() {
  if (!state.selectedMatch) return { ok: false, reason: "Guarda primeiro a ficha/cria o jogo." };
  const live = selectedMatchLive();
  if (!hasSystemEvent("Início do jogo")) {
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
    button.disabled = !stateForButton.ok;
    button.title = stateForButton.ok ? "" : stateForButton.reason;
  });
  const addEventButton = $("#addEvent");
  if (addEventButton) {
    const eventState = canRegisterMatchEvent();
    addEventButton.disabled = !eventState.ok;
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
  const teams = teamOptions();
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

  teamOptions().forEach((team) => {
    dataLevelSelect.append(option(team.label, team.level));
  });

  levelSelect.value = state.level;
  if (state.dataLevel !== "all" && !teamOptions().some((team) => team.level === state.dataLevel)) state.dataLevel = "all";
  dataLevelSelect.value = state.dataLevel;
  if (manualLevelSelect) manualLevelSelect.value = state.dataLevel === "all" ? state.level : state.dataLevel;
  if ($("#manualSeason") && !$("#manualSeason").value) $("#manualSeason").value = state.resultsSeason === "all" ? currentSeasonLabel() : state.resultsSeason;

  $("#manualOpponentWrap").hidden = false;
}

function renderMatchCard() {
  const match = state.selectedMatch;
  $("#matchCard").innerHTML = match
    ? `<strong>${match.level} vs ${match.opponent}</strong><br>${match.competition}<br>${match.venue || "Local por definir"} · Jornada ${match.round || "-"}`
    : "Escreve a equipa adversária e cria a partida para continuar.";
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

function playerForName(name, level) {
  return state.db.players.find((player) => player.level === level && player.name === name) || null;
}

function playerPhotoSrc(name, level) {
  return playerForName(name, level)?.photoUrl || playerPhoto(name);
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
            return `<span class="player-dot photo-dot" style="left:${slot.x}%;top:${slot.y}%"><img src="${playerPhotoSrc(name, level)}" alt="${name}" onerror="this.remove(); this.parentElement.dataset.initials='${initials(name)}';" /><small>${name}</small></span>`;
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
        <img src="${playerPhotoSrc(name, level)}" alt="${name}" onerror="this.remove(); this.parentElement.dataset.initials='${initials(name)}';" />
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
  const activeId = candidates.find((matchId) => state.db.matchReports?.[matchId] && matchById(matchId));
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
  $("#scoreMini").textContent = `${live.homeScore ?? 0} - ${live.awayScore ?? 0}`;
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
  if (timeline) timeline.innerHTML = eventsChronological.length ? "" : "<p>Sem eventos registados neste jogo.</p>";
  if (eventLog) eventLog.innerHTML = eventsChronological.length ? "" : "<p>Sem eventos registados neste jogo.</p>";

  if (timeline) eventsChronological.forEach((event, index) => {
    const item = document.createElement("div");
    item.className = `timeline-item ${eventClass(event)}`;
    item.innerHTML = `<strong>#${index + 1}</strong>${eventMarkup(event)}`;
    timeline.append(item);
  });

  if (eventLog) {
    eventsChronological.forEach((event, index) => {
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

function renderDataPage() {
  const level = state.dataLevel;
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

  const groups = filteredDataMatches(level).reduce((map, match) => {
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
    .join("") || "<p>Sem jogos para esta competição.</p>";
}

function playerAppearances(player) {
  const history = player.history || [];
  if (!state.resultsSeason || state.resultsSeason === "all") return history;
  return history.filter((item) => item.season === state.resultsSeason);
}

function playerStats(player) {
  const appearances = playerAppearances(player);
  const goals = appearances.reduce((sum, item) => sum + Number(item.goals || 0), 0);
  const assists = appearances.reduce((sum, item) => sum + Number(item.assists || 0), 0);
  const yellows = appearances.reduce((sum, item) => sum + Number(item.yellows || 0), 0);
  const reds = appearances.reduce((sum, item) => sum + Number(item.reds || 0), 0);
  return { appearances, goals, assists, yellows, reds };
}

function renderTeamsPage() {
  renderResultsSeasonSelect();
  const teamsSelect = $("#teamsLevelSelect");
  if (!teamsSelect) return;
  teamsSelect.innerHTML = "";
  teamOptions().forEach((team) => teamsSelect.append(option(team.label, team.level)));
  if (!teamOptions().some((team) => team.level === state.teamsLevel)) state.teamsLevel = teamOptions()[0]?.level || "Sub13";
  teamsSelect.value = state.teamsLevel;

  const players = levelPlayers(state.teamsLevel);
  if (!players.some((player) => player.id === state.selectedPlayerId)) state.selectedPlayerId = players[0]?.id || null;
  $("#teamsGrid").innerHTML = players
    .map((player) => {
      const stats = playerStats(player);
      const photo = player.photoUrl
        ? `<img src="${player.photoUrl}" alt="${player.name}" loading="lazy" />`
        : `<span class="player-photo-fallback">${player.name.slice(0, 1)}</span>`;
      return `
        <button class="team-player-card ${state.selectedPlayerId === player.id ? "active" : ""}" data-player-id="${player.id}">
          ${photo}
          <span>
            <strong>${player.name}</strong>
            <small>${stats.appearances.length} jogos</small>
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
    item.opponent || "-",
    item.role || "-",
    item.minutes === "" || item.minutes === null || item.minutes === undefined ? "-" : `${item.minutes} min`,
    `${Number(item.goals || 0)} G`,
    `${Number(item.assists || 0)} A`,
    `${Number(item.yellows || 0)} CA`,
    `${Number(item.reds || 0)} CV`,
  ]);
  const photo = player.photoUrl
    ? `<img src="${player.photoUrl}" alt="${player.name}" />`
    : `<span class="player-photo-fallback large">${player.name.slice(0, 1)}</span>`;
  detail.hidden = false;
  content.innerHTML = `
    <div class="player-profile">
      ${photo}
      <div>
        <p class="eyebrow">Histórico da jogadora</p>
        <h2>${player.name}</h2>
        <span>${player.level}</span>
      </div>
    </div>
    <div class="player-stat-row">
      <article><strong>${stats.appearances.length}</strong><span>Jogos</span></article>
      <article><strong>${stats.goals}</strong><span>Golos</span></article>
      <article><strong>${stats.assists}</strong><span>Assist.</span></article>
      <article><strong>${stats.yellows}</strong><span>Amarelos</span></article>
      <article><strong>${stats.reds}</strong><span>Vermelhos</span></article>
    </div>
    <h3 class="competition-title">Histórico</h3>
    ${table(["Adversário", "Papel", "Tempo", "Golos", "Assist.", "Amarelos", "Vermelhos"], rows)}
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
  if (match.source === "ZEROZERO") return "ZeroZero";
  if (match.source === "MANUAL") return "Manual";
  if (match.source === "EXCEL") return "Excel";
  return match.source || "Excel / base inicial";
}

function matchUpdatedAt(match) {
  return match.updatedAt || match.syncedAt || match.importedAt || state.db.zerozero?.lastSync?.at || state.db.meta?.updatedAt || "";
}

function showMatchAdmin(matchId) {
  if (!isAdmin()) return;
  const match = matchById(matchId);
  if (!match) return;
  const report = state.db.matchReports?.[matchId];
  const live = state.db.liveGames?.[matchId] || (state.db.live?.matchId === matchId ? state.db.live : null);
  const events = state.db.events.filter((event) => event.matchId === matchId);
  $("#matchAdminContent").innerHTML = `
    <h2>Gestão do jogo</h2>
    <p class="modal-kicker">${escapeHtml(match.level || "-")} · ${escapeHtml(match.competition || "Sem competição")}</p>
    <h3>Casa Pia ${match.goalsFor ?? live?.homeScore ?? 0} - ${match.goalsAgainst ?? live?.awayScore ?? 0} ${escapeHtml(match.opponent || "Adversário")}</h3>
    <dl class="match-meta-list">
      <div><dt>Fonte</dt><dd>${escapeHtml(matchSourceLabel(match))}</dd></div>
      <div><dt>Época</dt><dd>${escapeHtml(match.season || "-")}</dd></div>
      <div><dt>Atualizado</dt><dd>${escapeHtml(formatDateTime(matchUpdatedAt(match)))}</dd></div>
      <div><dt>Estado</dt><dd>${escapeHtml(live?.status || match.status || "-")}</dd></div>
      <div><dt>Ficha</dt><dd>${report ? "Criada" : "Sem ficha"}</dd></div>
      <div><dt>Eventos</dt><dd>${events.length}</dd></div>
    </dl>
    <p class="modal-note">Ao apagar, este jogo sai dos Resultados, Live, ficha e eventos. Antes de apagar, o servidor cria um backup do db.json.</p>
    <button class="danger delete-match" data-match-id="${escapeHtml(match.id)}">Apagar jogo</button>
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
  const total = teamOptions().find((team) => team.level === match?.level)?.format || (report.starters || []).length || 11;
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
        const clickable = isAdmin() ? "match-admin-row" : "";
        return `
          <tr class="${clickable}" data-match-id="${escapeHtml(match.id)}">
            <td>${escapeHtml(match.round || "-")}</td>
            <td>${escapeHtml(match.opponent || "-")}</td>
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
  state.dataLevel = state.level;
  state.teamsLevel = state.level;
  restoreActiveDelegateMatch();
  renderAll();
  renderAuth();
  setView(viewFromHash());
}

async function refreshLive() {
  if (state.refreshingLive) return;
  state.refreshingLive = true;
  try {
    const fresh = await request("/api/bootstrap");
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
  state.dataLevel = state.dataLevel === "all" ? "all" : teamOptions().find((team) => team.level === state.dataLevel)?.level || state.level;
  state.teamsLevel = teamOptions().find((team) => team.level === state.teamsLevel)?.level || state.level;
  restoreActiveDelegateMatch();
  renderAll();
  renderAuth();
  renderLiveHub();
}

async function addSystemEvent(type, period) {
  await request("/api/events", {
    method: "POST",
    body: JSON.stringify({
      matchId: state.selectedMatch.id,
      type,
      team: "Sistema",
      period,
    }),
  });
}

async function setMatchControl(control) {
  const allowed = canUseMatchControl(control);
  if (!allowed.ok) {
    alert(allowed.reason);
    updateMatchControlButtons();
    return;
  }
  const config = {
    "start-first": { period: "1ª Parte", status: "Em direto", liveEnded: false, event: "Início do jogo" },
    "half-time": { period: "Intervalo", status: "Intervalo", liveEnded: false, event: "Fim da 1ª parte" },
    "start-second": { period: "2ª Parte", status: "Em direto", liveEnded: false, event: "Início da 2ª parte" },
    "full-time": { period: "Fim de jogo", status: "Terminado", liveEnded: true, event: "Fim de jogo" },
  }[control];
  await request("/api/live", {
    method: "POST",
    body: JSON.stringify({ ...config, matchId: state.selectedMatch.id }),
  });
  await addSystemEvent(config.event, config.period);
  await refreshLive();
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

document.addEventListener("click", async (event) => {
  const matchRow = event.target.closest(".match-admin-row");
  if (matchRow && isAdmin()) {
    showMatchAdmin(matchRow.dataset.matchId);
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
  state.level = $("#levelSelect").value;
  state.selectedMatch = null;
  resetLineup();
  renderAll();
});

$("#dataLevelSelect").addEventListener("change", () => {
  state.dataLevel = $("#dataLevelSelect").value;
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
  state.selectedPlayerId = null;
  renderTeamsPage();
});

$("#teamsSeasonSelect")?.addEventListener("change", () => {
  state.resultsSeason = $("#teamsSeasonSelect").value;
  state.competitionFilter = "all";
  renderDataPage();
  renderTeamsPage();
});

async function ensureDelegateMatch() {
  if (state.selectedMatch) return state.selectedMatch;
  const opponent = $("#delegateManualOpponent").value.trim();
  if (!opponent) {
    alert("Escreve a equipa adversária.");
    return null;
  }
  const fresh = await request("/api/manual-match", {
    method: "POST",
    body: JSON.stringify({
      level: state.level,
      season: state.resultsSeason === "all" ? currentSeasonLabel() : state.resultsSeason,
      competition: "Jogo manual",
      opponent,
      venue: "Casa",
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
  const team = activeTeam();
  if (state.starters.size !== team.format) {
    alert(`Este escalão precisa de ${team.format} titulares.`);
    return;
  }
  const match = await ensureDelegateMatch();
  if (!match) {
    return;
  }
  await request("/api/report", {
    method: "POST",
    body: JSON.stringify({
      matchId: state.selectedMatch.id,
      delegate: $("#delegateName").value,
      tactic: $("#tacticInput").value,
      notes: $("#notesInput").value,
      starters: state.lineupSlots.filter(Boolean),
      lineupSlots: state.lineupSlots,
      bench: [...state.bench],
    }),
  });
  await refreshLive();
  renderEventPlayers();
  state.reportSetupVisible = false;
  renderDelegateMode();
});

$("#clearReport").addEventListener("click", async () => {
  if (!state.selectedMatch) return;
  if (!confirm("Limpar a ficha de jogo deste jogo? Os eventos registados ficam guardados.")) return;
  resetLineup();
  $("#delegateName").value = "";
  $("#tacticInput").value = "";
  $("#notesInput").value = "";
  await request("/api/report", {
    method: "POST",
    body: JSON.stringify({
      matchId: state.selectedMatch.id,
      clear: true,
    }),
  });
  await refreshLive();
  state.reportSetupVisible = true;
  renderAll();
});

$("#toggleReportView")?.addEventListener("click", () => {
  state.reportSetupVisible = !state.reportSetupVisible;
  renderDelegateMode();
});

$("#addEvent").addEventListener("click", async () => {
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

  await request("/api/events", {
    method: "POST",
    body: JSON.stringify({
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
    }),
  });
  await refreshLive();
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
  state.dataLevel = payload.level;
  state.resultsSeason = payload.season || "all";
  state.competitionFilter = payload.competition;
  renderAll();
  ["manualCompetition", "manualOpponent", "manualRound", "manualDate", "manualTime", "manualGoalsFor", "manualGoalsAgainst"].forEach((id) => {
    const input = $(`#${id}`);
    if (input) input.value = "";
  });
  $("#syncStatus").textContent = "Jogo manual guardado e aplicado aos Resultados.";
});

await bootstrap();
setInterval(() => {
  if (document.visibilityState === "visible" && state.currentView === "live") refreshLive();
}, 5000);

window.addEventListener("focus", () => {
  if (state.currentView === "live") refreshLive();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.currentView === "live") refreshLive();
});

window.addEventListener("pageshow", () => {
  if (state.currentView === "live") refreshLive();
});
