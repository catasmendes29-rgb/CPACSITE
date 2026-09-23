import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(os.tmpdir(), 'cpac-test-'));
const port = 14379;
const matches = ['a', 'b', 'zero'].map(id => ({ id, level: 'Sub19', season: '2026/2027', opponent: 'Teste', goalsFor: null, goalsAgainst: null, status: 'scheduled' }));
await writeFile(path.join(dir, 'db.json'), JSON.stringify({ meta: {}, teams: [{level:'Seniores'}], players: [], matches, events: [] }));
let child;
async function start() {
  child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, CASA_PIA_AUTO_SYNC_MINUTES: '0', ZEROZERO_AUTO_SYNC_MINUTES: '0' }, stdio: 'pipe' });
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(new Error(`Server exited ${code}`))); });
}
async function stop() { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
async function api(route, body, method = 'POST') {
  const response = await fetch(`http://localhost:${port}${route}`, body === undefined ? {} : {method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)});
  assert.equal(response.status < 400, true, await response.clone().text());
  return response.json();
}
try {
  await start();
  let db = await api('/api/bootstrap');
  assert(!db.teams.some(team => team.level === 'Seniores'));
  await api('/api/live', {matchId:'a', reset:true, homeScore:0, awayScore:0, period:'1ª Parte', liveEnded:false});
  const goal = await api('/api/events', {matchId:'a', type:'Golo', team:'Casa Pia'});
  await api('/api/live', {matchId:'b', reset:true, homeScore:4, awayScore:2, period:'2ª Parte', liveEnded:false});
  await api('/api/live', {matchId:'a', liveEnded:true, status:'Terminado', period:'Fim de jogo'});
  db = await api('/api/bootstrap');
  assert.equal(db.matches.find(m => m.id === 'a').goalsFor, 1);
  assert.equal(db.matches.find(m => m.id === 'a').goalsAgainst, 0);
  assert.equal(db.matches.find(m => m.id === 'b').goalsFor, null);
  await api(`/api/events/${goal.event.id}`, {}, 'DELETE');
  await api('/api/live', {matchId:'zero', reset:true, homeScore:0, awayScore:0, liveEnded:true});
  await stop(); await start();
  db = await api('/api/bootstrap');
  for (const id of ['a','zero']) {
    const match = db.matches.find(m => m.id === id);
    assert.equal(match.status, 'finished'); assert.equal(match.goalsFor, 0); assert.equal(match.goalsAgainst, 0);
  }
  for (const route of ['/', '/app.js', '/styles.css', '/api/results', '/api/sync-status']) {
    assert.equal((await fetch(`http://localhost:${port}${route}`)).status, 200, route);
  }
  const saved = JSON.parse(await readFile(path.join(dir,'db.json'),'utf8'));
  assert.equal(saved.matches.find(m => m.id === 'a').resultSource, 'delegate');
  console.log('PASS: final results, 0-0, separate games, event correction, restart, teams and HTTP routes');
} finally {
  if (child && child.exitCode === null) await stop();
  await rm(dir, { recursive:true, force:true });
}
