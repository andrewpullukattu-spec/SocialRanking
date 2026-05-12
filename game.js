// game.js — Rank It game logic
 
// ============================================================
//  STATE
// ============================================================
const G = {
  players: [],
  prompts: [],
  scores: {},           // name → number (kept but not displayed)
  round: 1,
  rankerIndex: 0,
  promptIndex: 0,
  phase: 'setup',       // setup | selecting-name | ranking | guessing-wait | guessing | reveal
  trueRanking: [],
  guesses: {},          // name → ordered array
  myName: null,
  submitted: false,
  rankingReady: false,
  chosenNames: new Set(),
};
 
function ranker() { return G.players[G.rankerIndex % G.players.length]; }
function prompt()  { return G.prompts[G.promptIndex % G.prompts.length]; }
function others()  { return G.players.filter(p => p !== ranker()); }
 
// ============================================================
//  SETUP — PLAYERS
// ============================================================
function addPlayer() {
  const inp = document.getElementById('player-input');
  const name = inp.value.trim();
  if (!name || G.players.includes(name)) { inp.focus(); return; }
  G.players.push(name);
  G.scores[name] = 0;
  inp.value = '';
  inp.focus();
  renderPlayerTags();
}
 
function removePlayer(name) {
  G.players = G.players.filter(p => p !== name);
  delete G.scores[name];
  renderPlayerTags();
}
 
function renderPlayerTags() {
  document.getElementById('player-count').textContent = G.players.length;
  document.getElementById('player-tags').innerHTML = G.players.map(p =>
    `<div class="tag">${p}<span class="tag-remove" onclick="removePlayer('${esc(p)}')">&times;</span></div>`
  ).join('');
}
 
// ============================================================
//  SETUP — PROMPTS
// ============================================================
function addPrompt() {
  const inp = document.getElementById('prompt-input');
  const text = inp.value.trim();
  if (!text || G.prompts.includes(text)) { inp.focus(); return; }
  G.prompts.push(text);
  inp.value = '';
  inp.focus();
  renderPromptChips();
}
 
function removePrompt(i) {
  G.prompts.splice(i, 1);
  renderPromptChips();
  renderBankButtons(); // refresh added state
}
 
function renderPromptChips() {
  document.getElementById('prompt-count').textContent = G.prompts.length;
  document.getElementById('prompt-chips').innerHTML = G.prompts.map((p, i) =>
    `<div class="prompt-chip">
      <span>${esc(p)}</span>
      <span class="prompt-chip-remove" onclick="removePrompt(${i})">&times;</span>
    </div>`
  ).join('');
}
 
// ============================================================
//  PROMPT BANK MODAL
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
  const filtered = PROMPT_BANK.map(cat => ({
    ...cat,
    prompts: cat.prompts.filter(p => p.toLowerCase().includes(bankFilter))
  })).filter(cat => cat.prompts.length > 0);
  renderBankCategories(filtered);
}
 
function renderBankCategories(cats) {
  document.getElementById('bank-categories').innerHTML = cats.map(cat =>
    `<div class="bank-category">
      <div class="bank-cat-title">${cat.category}</div>
      <div class="bank-prompts">
        ${cat.prompts.map(p => {
          const added = G.prompts.includes(p);
          return `<button class="bank-prompt-btn ${added ? 'added' : ''}" onclick="toggleBankPrompt('${esc(p)}')">
            <span>${esc(p)}</span>
            <span class="check">${added ? '✓' : '+'}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`
  ).join('');
}
 
function renderBankButtons() {
  renderBankCategories(PROMPT_BANK);
}
 
function toggleBankPrompt(text) {
  if (G.prompts.includes(text)) {
    G.prompts = G.prompts.filter(p => p !== text);
  } else {
    G.prompts.push(text);
  }
  renderPromptChips();
  filterBank();
}
 
// ============================================================
//  START GAME
// ============================================================
function startGame() {
  if (G.players.length < 3) {
    alert('Add at least 3 players to start!');
    return;
  }
  if (G.prompts.length < 1) {
    alert('Add at least 1 prompt — or browse the prompt bank!');
    return;
  }
 
  G.round = 1;
  G.rankerIndex = 0;
  G.promptIndex = 0;
  G.trueRanking = [];
  G.guesses = {};
  G.myName = null;
  G.submitted = false;
  G.rankingReady = false;
  G.chosenNames = new Set();
  G.players.forEach(p => G.scores[p] = 0);
 
  G.phase = 'selecting-name';
  showScreen('ctrl');
  showSwitcher();
  renderController();
  renderHost();
}
 
function goSetup() {
  G.phase = 'setup';
  document.getElementById('view-switcher').style.display = 'none';
  showScreen('setup');
}
 
// ============================================================
//  VIEW SWITCHER
// ============================================================
let currentView = 'ctrl'; // 'host' or 'ctrl'
 
function toggleView() {
  if (currentView === 'ctrl') {
    currentView = 'host';
    showScreen('host');
    renderHost();
    document.getElementById('switcher-btn').textContent = '📱 CONTROLLER';
  } else {
    currentView = 'ctrl';
    showScreen('ctrl');
    renderController();
    document.getElementById('switcher-btn').textContent = '📺 HOST SCREEN';
  }
}
 
function showSwitcher() {
  document.getElementById('view-switcher').style.display = 'block';
  document.getElementById('switcher-btn').textContent = '📺 HOST SCREEN';
  currentView = 'ctrl';
}
 
 
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}
 
// ============================================================
//  HOST SCREEN
// ============================================================
function renderHost() {
  if (G.phase === 'setup') return;
 
  document.getElementById('host-round-num').textContent = G.round;
  document.getElementById('host-ranker-name').textContent = ranker() + ' is ranking';
  document.getElementById('host-prompt-text').textContent = prompt();
 
  const revealEl = document.getElementById('host-reveal');
  const statusEl = document.getElementById('host-status');
  const actionsEl = document.getElementById('host-actions');
 
  revealEl.style.display = 'none';
 
  if (G.phase === 'selecting-name' || G.phase === 'ranking') {
    statusEl.textContent = 'Pass the phone to ' + ranker() + '...';
    actionsEl.innerHTML = '';
  } else if (G.phase === 'guessing-wait' || G.phase === 'guessing') {
    const guessCount = Object.keys(G.guesses).length;
    const needed = others().length;
    statusEl.textContent = `${guessCount} of ${needed} guesses submitted`;
    actionsEl.innerHTML = `
      <button class="btn-host-secondary" onclick="doReveal()">Reveal early</button>
      <button class="btn-host-action" onclick="doReveal()">REVEAL →</button>
    `;
  } else if (G.phase === 'reveal') {
    statusEl.textContent = '';
    revealEl.style.display = 'block';
    renderReveal();
    const hasMore = G.prompts.length > 1 || G.round === 1;
    actionsEl.innerHTML = `
      <button class="btn-host-secondary" onclick="goSetup()">← Setup</button>
      <button class="btn-host-action" onclick="nextRound()">NEXT ROUND →</button>
    `;
  }
 
  renderScoreboardPills();
}
 
function renderReveal() {
  document.getElementById('reveal-list').innerHTML = G.trueRanking.map((name, i) =>
    `<li class="reveal-item">
      <span class="reveal-rank">${i + 1}</span>
      <span class="reveal-name">${esc(name)}</span>
    </li>`
  ).join('');
}
 
function renderScoreboardPills() {
  document.getElementById('scoreboard-players').innerHTML = G.players.map(p =>
    `<div class="score-pill ${p === ranker() ? 'is-ranker' : ''}">${esc(p)}</div>`
  ).join('');
}
 
function doReveal() {
  G.phase = 'reveal';
  renderHost();
}
 
function nextRound() {
  G.rankerIndex++;
  G.promptIndex++;
  G.round++;
  G.trueRanking = [];
  G.guesses = {};
  G.myName = null;
  G.submitted = false;
  G.rankingReady = false;
  G.chosenNames = new Set();
  G.phase = 'selecting-name';
 
  currentView = 'ctrl';
  document.getElementById('switcher-btn').textContent = '📺 HOST SCREEN';
  showScreen('ctrl');
  renderController();
  renderHost();
}
 
// ============================================================
//  CONTROLLER SCREEN
// ============================================================
function renderController() {
  // hide all panels
  ['ctrl-pick-name','ctrl-ranker','ctrl-waiting-ranker','ctrl-guesser','ctrl-done']
    .forEach(id => document.getElementById(id).style.display = 'none');
 
  document.getElementById('ctrl-round-pick').textContent = G.round;
 
  if (G.phase === 'selecting-name' || !G.myName) {
    showCtrlPanel('ctrl-pick-name');
    renderNameGrid();
    return;
  }
 
  if (G.submitted) {
    showCtrlPanel('ctrl-done');
    document.getElementById('ctrl-done-msg').textContent =
      G.myName === ranker() ? 'Ranking submitted!' : 'Guess submitted!';
    return;
  }
 
  if (G.myName === ranker()) {
    showCtrlPanel('ctrl-ranker');
    document.getElementById('ctrl-ranker-prompt').textContent = prompt();
    buildSortable('ranker-sort-list', others());
  } else {
    if (!G.rankingReady) {
      showCtrlPanel('ctrl-waiting-ranker');
      document.getElementById('ctrl-wait-ranker-name').textContent = ranker();
    } else {
      showCtrlPanel('ctrl-guesser');
      document.getElementById('ctrl-guesser-ranker-name').textContent = ranker();
      document.getElementById('ctrl-guesser-prompt').textContent = prompt();
      buildSortable('guesser-sort-list', others());
    }
  }
}
 
function showCtrlPanel(id) {
  document.getElementById(id).style.display = 'flex';
  document.getElementById(id).style.flexDirection = 'column';
}
 
function renderNameGrid() {
  document.getElementById('ctrl-name-grid').innerHTML = G.players.map(p =>
    `<button class="name-btn ${G.chosenNames.has(p) ? 'used' : ''}" onclick="selectName('${esc(p)}')">${esc(p)}</button>`
  ).join('');
}
 
function selectName(name) {
  G.myName = name;
  G.chosenNames.add(name);
  G.submitted = false;
 
  if (name === ranker()) {
    G.phase = 'ranking';
  } else {
    G.phase = G.rankingReady ? 'guessing' : 'guessing-wait';
  }
 
  renderController();
  renderHost();
}
 
function submitRanking() {
  const items = document.querySelectorAll('#ranker-sort-list .sort-item');
  G.trueRanking = Array.from(items).map(el => el.dataset.name);
  G.rankingReady = true;
  G.submitted = true;
  G.phase = 'guessing';
  renderController();
  renderHost();
  // Prompt other players to refresh controller
  setTimeout(() => {
    if (document.getElementById('ctrl-done').style.display !== 'none') {
      document.getElementById('ctrl-done-msg').textContent = 'Ranking locked in!';
    }
  }, 100);
}
 
function submitGuess() {
  const items = document.querySelectorAll('#guesser-sort-list .sort-item');
  const guess = Array.from(items).map(el => el.dataset.name);
  G.guesses[G.myName] = guess;
  G.submitted = true;
  renderController();
  renderHost();
}
 
// ============================================================
//  DRAG & DROP SORTABLE (mouse + touch)
// ============================================================
let dragSrc = null;
 
function buildSortable(containerId, names) {
  const container = document.getElementById(containerId);
  container.innerHTML = names.map((name, i) =>
    `<div class="sort-item" data-name="${esc(name)}" draggable="true">
      <span class="sort-handle">⠿</span>
      <span class="sort-rank">${i + 1}</span>
      <span class="sort-name">${esc(name)}</span>
    </div>`
  ).join('');
 
  container.querySelectorAll('.sort-item').forEach(item => {
    // Mouse drag
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
        const si = all.indexOf(dragSrc);
        const ti = all.indexOf(item);
        if (si < ti) item.after(dragSrc); else item.before(dragSrc);
        updateRankNums(container);
      }
    });
 
    // Touch drag
    let touchOffsetY = 0;
    let ghostEl = null;
 
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
        const r = sib.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        sib.classList.remove('drag-over');
        if (touch.clientY > r.top && touch.clientY < r.bottom) {
          sib.classList.add('drag-over');
          if (touch.clientY < mid) sib.before(dragSrc);
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
//  KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.activeElement.id === 'player-input') addPlayer();
    if (document.activeElement.id === 'prompt-input') addPrompt();
  }
  if (e.key === 'Escape') closePromptBank(null);
  // Host shortcuts
  if (document.getElementById('screen-host').classList.contains('active')) {
    if (e.key === 'r' || e.key === 'R') doReveal();
    if (e.key === 'n' || e.key === 'N') { if (G.phase === 'reveal') nextRound(); }
  }
});
 
// ============================================================
//  UTILITY
// ============================================================
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
 
// Also render host button in setup for convenience
// (tab switching between screens)
document.addEventListener('DOMContentLoaded', () => {
  // Wire Enter key on setup inputs explicitly
  document.getElementById('player-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addPlayer();
  });
  document.getElementById('prompt-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addPrompt();
  });
});
 
