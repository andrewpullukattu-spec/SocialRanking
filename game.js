// game.js — Rank It with Firebase Realtime Database (compat SDK)

const L = {
  players: [],
  prompts: [],
  roomCode: null,
  isHost: false,
  myName: null,
  submitted: false,
  listener: null,
};

// ============================================================
//  DB HELPERS  (compat SDK uses firebase.database())
// ============================================================
function db() { return window._db; }
function roomPath(sub) {
  return db().ref('rooms/' + L.roomCode + (sub ? '/' + sub : ''));
}

// ============================================================
//  UTILS
// ============================================================
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length: 5}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ============================================================
//  SETUP — PLAYERS
// ============================================================
function addPlayer() {
  const inp = document.getElementById('player-input');
  const name = inp.value.trim();
  if (!name || L.players.includes(name)) { inp.focus(); return; }
  L.players.push(name);
  inp.value = '';
  inp.focus();
  renderPlayerTags();
}

function removePlayer(name) {
  L.players = L.players.filter(p => p !== name);
  renderPlayerTags();
}

function renderPlayerTags() {
  document.getElementById('player-count').textContent = L.players.length;
  document.getElementById('player-tags').innerHTML = L.players.map(p =>
    `<div class="tag">${esc(p)}<span class="tag-remove" onclick="removePlayer('${esc(p)}')">&times;</span></div>`
  ).join('');
}

// ============================================================
//  SETUP — PROMPTS
// ============================================================
function addPrompt() {
  const inp = document.getElementById('prompt-input');
  const text = inp.value.trim();
  if (!text || L.prompts.includes(text)) { inp.focus(); return; }
  L.prompts.push(text);
  inp.value = '';
  inp.focus();
  renderPromptChips();
}

function removePrompt(i) {
  L.prompts.splice(i, 1);
  renderPromptChips();
  filterBank();
}

function renderPromptChips() {
  document.getElementById('prompt-count').textContent = L.prompts.length;
  document.getElementById('prompt-chips').innerHTML = L.prompts.map((p, i) =>
    `<div class="prompt-chip">
      <span>${esc(p)}</span>
      <span class="prompt-chip-remove" onclick="removePrompt(${i})">&times;</span>
    </div>`
  ).join('');
}

// ============================================================
//  PROMPT BANK
// ============================================================
let bankFilter = '';

function openPromptBank() {
  document.getElementById('prompt-bank-modal').style.display = 'flex';
  document.getElementById('bank-search').value = '';
  bankFilter = '';
  renderBankCategories(PROMPT_BANK);
}

function closePromptBank(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('prompt-bank-modal').style.display = 'none';
}

function filterBank() {
  bankFilter = document.getElementById('bank-search').value.toLowerCase();
  const filtered = PROMPT_BANK
    .map(cat => ({ ...cat, prompts: cat.prompts.filter(p => p.toLowerCase().includes(bankFilter)) }))
    .filter(cat => cat.prompts.length > 0);
  renderBankCategories(filtered);
}

function renderBankCategories(cats) {
  document.getElementById('bank-categories').innerHTML = cats.map(cat =>
    `<div class="bank-category">
      <div class="bank-cat-title">${cat.category}</div>
      <div class="bank-prompts">
        ${cat.prompts.map(p => {
          const added = L.prompts.includes(p);
          return `<button class="bank-prompt-btn ${added ? 'added' : ''}" onclick="toggleBankPrompt('${esc(p)}')">
            <span>${esc(p)}</span><span class="check">${added ? '✓' : '+'}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`
  ).join('');
}

function toggleBankPrompt(text) {
  if (L.prompts.includes(text)) L.prompts = L.prompts.filter(p => p !== text);
  else L.prompts.push(text);
  renderPromptChips();
  filterBank();
}

// ============================================================
//  START GAME (host)
// ============================================================
async function startGame() {
  if (L.players.length < 3) { alert('Add at least 3 players!'); return; }
  if (L.prompts.length < 1) { alert('Add at least 1 prompt!'); return; }

  const btn = document.getElementById('start-btn');
  btn.textContent = 'CONNECTING...';
  btn.disabled = true;

  try {
    L.roomCode = generateCode();
    L.isHost = true;

    await roomPath().set({
      phase: 'picking',
      round: 1,
      rankerIndex: 0,
      promptIndex: 0,
      players: L.players,
      prompts: L.prompts,
      trueRanking: [],
      guesses: {},
      chosenNames: [],
    });

    showScreen('screen-host');
    document.getElementById('host-room-code').textContent = L.roomCode;
    subscribeHost();

  } catch (err) {
    console.error(err);
    alert('Could not connect to Firebase:\n' + err.message);
    btn.textContent = 'START GAME';
    btn.disabled = false;
  }
}

// ============================================================
//  JOIN ROOM (player)
// ============================================================
async function joinRoom() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (!code) return;

  const btn = document.getElementById('join-btn');
  btn.textContent = '...';
  btn.disabled = true;

  try {
    const snap = await db().ref('rooms/' + code).once('value');
    if (!snap.exists()) {
      document.getElementById('join-error').style.display = 'block';
      btn.textContent = '→';
      btn.disabled = false;
      return;
    }

    document.getElementById('join-error').style.display = 'none';
    L.roomCode = code;
    L.isHost = false;
    L.myName = null;
    L.submitted = false;

    showScreen('screen-ctrl');
    subscribeController();

  } catch (err) {
    console.error(err);
    alert('Could not connect:\n' + err.message);
    btn.textContent = '→';
    btn.disabled = false;
  }
}

// ============================================================
//  HOST — listen to Firebase
// ============================================================
function subscribeHost() {
  if (L.listener) L.listener.off();
  L.listener = roomPath();
  L.listener.on('value', snap => {
    if (!snap.exists()) return;
    renderHostFromState(snap.val());
  });
}

function renderHostFromState(s) {
  const ranker = s.players[s.rankerIndex % s.players.length];
  const prompt = s.prompts[s.promptIndex % s.prompts.length];

  document.getElementById('host-round-num').textContent = s.round;
  document.getElementById('host-ranker-name').textContent = ranker + ' is ranking';
  document.getElementById('host-prompt-text').textContent = prompt;

  const revealEl  = document.getElementById('host-reveal');
  const statusEl  = document.getElementById('host-status');
  const actionsEl = document.getElementById('host-actions');

  revealEl.style.display = 'none';

  const guessCount = Object.keys(s.guesses || {}).length;
  const needed     = s.players.length - 1;
  const chosen     = s.chosenNames || [];

  if (s.phase === 'picking') {
    statusEl.textContent = chosen.length + ' of ' + s.players.length + ' players picked their name';
    actionsEl.innerHTML = '';
  } else if (s.phase === 'ranking') {
    statusEl.textContent = 'Waiting for ' + ranker + ' to submit their ranking...';
    actionsEl.innerHTML = '';
  } else if (s.phase === 'guessing') {
    statusEl.textContent = guessCount + ' of ' + needed + ' guesses submitted';
    actionsEl.innerHTML = `
      <button class="btn-host-secondary" onclick="hostReveal()">Reveal early</button>
      <button class="btn-host-action" onclick="hostReveal()">REVEAL →</button>`;
  } else if (s.phase === 'reveal') {
    statusEl.textContent = '';
    revealEl.style.display = 'block';
    document.getElementById('reveal-list').innerHTML = (s.trueRanking || []).map((name, i) =>
      `<li class="reveal-item">
        <span class="reveal-rank">${i+1}</span>
        <span class="reveal-name">${esc(name)}</span>
      </li>`
    ).join('');
    actionsEl.innerHTML = `
      <button class="btn-host-secondary" onclick="goSetup()">← Setup</button>
      <button class="btn-host-action" onclick="hostNextRound()">NEXT ROUND →</button>`;
  }

  document.getElementById('scoreboard-players').innerHTML = s.players.map(p =>
    `<div class="score-pill ${chosen.includes(p) ? 'is-ranker' : ''}">${esc(p)}</div>`
  ).join('');
}

function hostReveal() {
  roomPath().update({ phase: 'reveal' });
}

async function hostNextRound() {
  const snap = await roomPath().once('value');
  const s = snap.val();
  roomPath().update({
    phase: 'picking',
    round: s.round + 1,
    rankerIndex: s.rankerIndex + 1,
    promptIndex: s.promptIndex + 1,
    trueRanking: [],
    guesses: {},
    chosenNames: [],
  });
}

function goSetup() {
  if (L.listener) { L.listener.off(); L.listener = null; }
  showScreen('screen-landing');
}

// ============================================================
//  CONTROLLER — listen to Firebase
// ============================================================
function subscribeController() {
  if (L.listener) L.listener.off();
  L.listener = roomPath();
  L.listener.on('value', snap => {
    if (!snap.exists()) return;
    renderCtrlFromState(snap.val());
  });
}

function renderCtrlFromState(s) {
  const ranker   = s.players[s.rankerIndex % s.players.length];
  const prompt   = s.prompts[s.promptIndex % s.prompts.length];
  const isRanker = L.myName === ranker;
  const chosen   = s.chosenNames || [];

  if (s.phase === 'picking') {
    L.submitted = false;
    L.myName = null;
  }

  hideAllCtrlPanels();
  document.getElementById('ctrl-round-pick').textContent = s.round;

  if (!L.myName) {
    show('ctrl-pick-name');
    document.getElementById('ctrl-name-grid').innerHTML = s.players.map(p => {
      const taken = chosen.includes(p);
      return `<button class="name-btn ${taken ? 'used' : ''}" onclick="selectName('${esc(p)}')">${esc(p)}</button>`;
    }).join('');
    return;
  }

  if (L.submitted) {
    show(s.phase === 'reveal' || s.phase === 'picking' ? 'ctrl-next-round-wait' : 'ctrl-done');
    document.getElementById('ctrl-done-msg').textContent = isRanker ? 'Ranking locked in!' : 'Guess submitted!';
    return;
  }

  if (isRanker) {
    if (s.phase === 'ranking') {
      show('ctrl-ranker');
      document.getElementById('ctrl-ranker-prompt').textContent = prompt;
      buildSortable('ranker-sort-list', s.players.filter(p => p !== ranker));
    } else {
      show('ctrl-done');
      document.getElementById('ctrl-done-msg').textContent = 'Waiting...';
    }
  } else {
    if (s.phase === 'picking' || s.phase === 'ranking') {
      show('ctrl-waiting-ranker');
      document.getElementById('ctrl-wait-ranker-name').textContent = ranker;
    } else if (s.phase === 'guessing') {
      show('ctrl-guesser');
      document.getElementById('ctrl-guesser-ranker-name').textContent = ranker;
      document.getElementById('ctrl-guesser-prompt').textContent = prompt;
      buildSortable('guesser-sort-list', s.players.filter(p => p !== ranker));
    } else if (s.phase === 'reveal') {
      show('ctrl-next-round-wait');
    }
  }
}

async function selectName(name) {
  const snap = await roomPath('chosenNames').once('value');
  let chosen = snap.val() || [];
  if (chosen.includes(name)) return;

  L.myName = name;
  chosen.push(name);

  const stateSnap = await roomPath().once('value');
  const s = stateSnap.val();
  const ranker = s.players[s.rankerIndex % s.players.length];
  const updates = { chosenNames: chosen };
  if (name === ranker) updates.phase = 'ranking';
  await roomPath().update(updates);
}

async function submitRanking() {
  const items = document.querySelectorAll('#ranker-sort-list .sort-item');
  const ranking = Array.from(items).map(el => el.dataset.name);
  L.submitted = true;
  await roomPath().update({ trueRanking: ranking, phase: 'guessing' });
}

async function submitGuess() {
  const items = document.querySelectorAll('#guesser-sort-list .sort-item');
  const guess = Array.from(items).map(el => el.dataset.name);
  L.submitted = true;
  const snap = await roomPath('guesses').once('value');
  const guesses = snap.val() || {};
  guesses[L.myName] = guess;
  await roomPath().update({ guesses });
}

// ============================================================
//  CTRL PANEL HELPERS
// ============================================================
function hideAllCtrlPanels() {
  ['ctrl-pick-name','ctrl-ranker','ctrl-waiting-ranker','ctrl-guesser','ctrl-done','ctrl-next-round-wait']
    .forEach(id => document.getElementById(id).style.display = 'none');
}

function show(id) {
  const el = document.getElementById(id);
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
}

// ============================================================
//  DRAG & DROP SORTABLE (mouse + touch)
// ============================================================
let dragSrc = null;

function buildSortable(containerId, names) {
  const container = document.getElementById(containerId);
  const existing = Array.from(container.querySelectorAll('.sort-item')).map(el => el.dataset.name);
  if (existing.join(',') === names.join(',')) return;

  container.innerHTML = names.map((name, i) =>
    `<div class="sort-item" data-name="${esc(name)}" draggable="true">
      <span class="sort-handle">⠿</span>
      <span class="sort-rank">${i + 1}</span>
      <span class="sort-name">${esc(name)}</span>
    </div>`
  ).join('');

  container.querySelectorAll('.sort-item').forEach(item => {
    item.addEventListener('dragstart', () => {
      dragSrc = item;
      setTimeout(() => item.classList.add('dragging'), 0);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      updateRankNums(container);
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      container.querySelectorAll('.sort-item').forEach(el => el.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (dragSrc && dragSrc !== item) {
        const all = [...container.children];
        if (all.indexOf(dragSrc) < all.indexOf(item)) item.after(dragSrc);
        else item.before(dragSrc);
        updateRankNums(container);
      }
    });

    // Touch support
    let ghostEl = null, touchOffsetY = 0;
    item.addEventListener('touchstart', e => {
      dragSrc = item;
      const touch = e.touches[0];
      const rect = item.getBoundingClientRect();
      touchOffsetY = touch.clientY - rect.top;
      ghostEl = item.cloneNode(true);
      ghostEl.style.cssText = `position:fixed;z-index:9999;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;opacity:0.85;pointer-events:none;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.18);`;
      document.body.appendChild(ghostEl);
      item.classList.add('dragging');
    }, { passive: true });

    item.addEventListener('touchmove', e => {
      if (!ghostEl) return;
      const touch = e.touches[0];
      ghostEl.style.top = (touch.clientY - touchOffsetY) + 'px';
      const siblings = [...container.children].filter(c => c !== dragSrc);
      for (const sib of siblings) {
        sib.classList.remove('drag-over');
        const r = sib.getBoundingClientRect();
        if (touch.clientY > r.top && touch.clientY < r.bottom) {
          sib.classList.add('drag-over');
          if (touch.clientY < r.top + r.height / 2) sib.before(dragSrc);
          else sib.after(dragSrc);
          break;
        }
      }
    }, { passive: true });

    item.addEventListener('touchend', () => {
      if (ghostEl) { ghostEl.remove(); ghostEl = null; }
      item.classList.remove('dragging');
      container.querySelectorAll('.sort-item').forEach(el => el.classList.remove('drag-over'));
      updateRankNums(container);
    });
  });
}

function updateRankNums(container) {
  container.querySelectorAll('.sort-rank').forEach((el, i) => el.textContent = i + 1);
}

// ============================================================
//  KEYBOARD
// ============================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.activeElement.id === 'player-input') addPlayer();
    if (document.activeElement.id === 'prompt-input') addPrompt();
    if (document.activeElement.id === 'join-code-input') joinRoom();
  }
  if (e.key === 'Escape') closePromptBank(null);
});
