// game.js — Rank It with Firebase real-time rooms

// ============================================================
//  LOCAL STATE (host only — players read from Firebase)
// ============================================================
const L = {
  players: [],
  prompts: [],
  roomCode: null,
  isHost: false,
  myName: null,
  submitted: false,
  unsubscribe: null,   // Firebase listener teardown
};

// ============================================================
//  UTILITIES
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

function roomRef(path) {
  return window._ref(window._db, `rooms/${L.roomCode}${path ? '/' + path : ''}`);
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

  L.roomCode = generateCode();
  L.isHost = true;

  const initialState = {
    phase: 'picking',       // picking | ranking | guessing | reveal
    round: 1,
    rankerIndex: 0,
    promptIndex: 0,
    players: L.players,
    prompts: L.prompts,
    trueRanking: [],
    guesses: {},
    chosenNames: [],
  };

  await window._set(roomRef(), initialState);

  showScreen('screen-host');
  document.getElementById('host-room-code').textContent = L.roomCode;
  subscribeHost();
}

// ============================================================
//  JOIN ROOM (player)
// ============================================================
async function joinRoom() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (!code) return;

  const snap = await window._get(window._ref(window._db, `rooms/${code}`));
  if (!snap.exists()) {
    document.getElementById('join-error').style.display = 'block';
    return;
  }

  document.getElementById('join-error').style.display = 'none';
  L.roomCode = code;
  L.isHost = false;
  L.myName = null;
  L.submitted = false;

  showScreen('screen-ctrl');
  subscribeController();
}

// ============================================================
//  HOST — FIREBASE LISTENER
// ============================================================
function subscribeHost() {
  if (L.unsubscribe) L.unsubscribe();
  L.unsubscribe = window._onValue(roomRef(), snap => {
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

  const revealEl = document.getElementById('host-reveal');
  const promptArea = document.getElementById('host-prompt-area');
  const statusEl = document.getElementById('host-status');
  const actionsEl = document.getElementById('host-actions');

  revealEl.style.display = 'none';
  promptArea.style.display = 'block';

  const guessCount = Object.keys(s.guesses || {}).length;
  const needed = s.players.length - 1;

  if (s.phase === 'picking') {
    statusEl.textContent = `${(s.chosenNames||[]).length} of ${s.players.length} players picked their name`;
    actionsEl.innerHTML = '';
  } else if (s.phase === 'ranking') {
    statusEl.textContent = 'Waiting for ' + ranker + ' to submit their ranking...';
    actionsEl.innerHTML = '';
  } else if (s.phase === 'guessing') {
    statusEl.textContent = `${guessCount} of ${needed} guesses submitted`;
    actionsEl.innerHTML = `
      <button class="btn-host-secondary" onclick="hostReveal()">Reveal early</button>
      <button class="btn-host-action" onclick="hostReveal()">REVEAL →</button>`;
  } else if (s.phase === 'reveal') {
    promptArea.style.display = 'block';
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

  // Players joined pills
  const chosen = s.chosenNames || [];
  document.getElementById('scoreboard-players').innerHTML = s.players.map(p =>
    `<div class="score-pill ${chosen.includes(p) ? 'is-ranker' : ''}">${esc(p)}</div>`
  ).join('');
}

async function hostReveal() {
  await window._update(roomRef(), { phase: 'reveal' });
}

async function hostNextRound() {
  const snap = await window._get(roomRef());
  const s = snap.val();
  await window._update(roomRef(), {
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
  if (L.unsubscribe) { L.unsubscribe(); L.unsubscribe = null; }
  showScreen('screen-landing');
}

// ============================================================
//  CONTROLLER — FIREBASE LISTENER
// ============================================================
function subscribeController() {
  if (L.unsubscribe) L.unsubscribe();
  L.unsubscribe = window._onValue(roomRef(), snap => {
    if (!snap.exists()) return;
    renderCtrlFromState(snap.val());
  });
}

function renderCtrlFromState(s) {
  const ranker = s.players[s.rankerIndex % s.players.length];
  const prompt = s.prompts[s.promptIndex % s.prompts.length];
  const isRanker = L.myName === ranker;

  // Detect round change — reset local submitted flag
  if (s.phase === 'picking') {
    L.submitted = false;
    L.myName = null;
  }

  hideAllCtrlPanels();
  document.getElementById('ctrl-round-pick').textContent = s.round;

  // No name chosen yet
  if (!L.myName) {
    show('ctrl-pick-name');
    document.getElementById('ctrl-name-grid').innerHTML = s.players.map(p => {
      const taken = (s.chosenNames || []).includes(p);
      return `<button class="name-btn ${taken ? 'used' : ''}" onclick="selectName('${esc(p)}')">${esc(p)}</button>`;
    }).join('');
    return;
  }

  // Already submitted — show done or waiting for next round
  if (L.submitted) {
    if (s.phase === 'reveal' || s.phase === 'picking') {
      show('ctrl-next-round-wait');
    } else {
      show('ctrl-done');
      document.getElementById('ctrl-done-msg').textContent =
        isRanker ? 'Ranking locked in!' : 'Guess submitted!';
    }
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
  const snap = await window._get(roomRef('chosenNames'));
  let chosen = snap.val() || [];
  if (chosen.includes(name)) return; // someone just grabbed it

  L.myName = name;
  chosen.push(name);
  await window._update(roomRef(), { chosenNames: chosen });

  // If this person IS the ranker and everyone has chosen, move to ranking
  const stateSnap = await window._get(roomRef());
  const s = stateSnap.val();
  const ranker = s.players[s.rankerIndex % s.players.length];
  if (name === ranker) {
    await window._update(roomRef(), { phase: 'ranking' });
  }
}

async function submitRanking() {
  const items = document.querySelectorAll('#ranker-sort-list .sort-item');
  const ranking = Array.from(items).map(el => el.dataset.name);
  L.submitted = true;
  await window._update(roomRef(), {
    trueRanking: ranking,
    phase: 'guessing'
  });
}

async function submitGuess() {
  const items = document.querySelectorAll('#guesser-sort-list .sort-item');
  const guess = Array.from(items).map(el => el.dataset.name);
  L.submitted = true;

  const snap = await window._get(roomRef('guesses'));
  const guesses = snap.val() || {};
  guesses[L.myName] = guess;
  await window._update(roomRef(), { guesses });
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
//  DRAG & DROP SORTABLE
// ============================================================
let dragSrc = null;

function buildSortable(containerId, names) {
  const container = document.getElementById(containerId);
  // Only rebuild if names changed (avoid resetting mid-drag)
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

    // Touch
    let ghostEl = null, touchOffsetY = 0;
    item.addEventListener('touchstart', e => {
      dragSrc = item;
      const touch = e.touches[0];
      const rect = item.getBoundingClientRect();
      touchOffsetY = touch.clientY - rect.top;
      ghostEl = item.cloneNode(true);
      ghostEl.style.cssText = `position:fixed;z-index:9999;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;opacity:0.85;pointer-events:none;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.2);`;
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
