// game.js — Rank It
// Laptop = host. One phone = controller (passed around).
// Ranker ranks secretly → group guesses together → host reveals 1 by 1.

const L = {
  players:   [],
  prompts:   [],
  roomCode:  null,
  isHost:    false,
  listener:  null,
};

// ── DB helpers ──────────────────────────────────────────────
function db()          { return window._db; }
function rp(sub)       { return db().ref('rooms/' + L.roomCode + (sub ? '/' + sub : '')); }

// ── Utils ───────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function generateCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:5}, () => c[Math.floor(Math.random()*c.length)]).join('');
}
function el(id) { return document.getElementById(id); }

// ── Setup: players ──────────────────────────────────────────
function addPlayer() {
  const inp = el('player-input');
  const name = inp.value.trim();
  if (!name || L.players.includes(name)) { inp.focus(); return; }
  L.players.push(name);
  inp.value = ''; inp.focus();
  renderPlayerTags();
}
function removePlayer(name) {
  L.players = L.players.filter(p => p !== name);
  renderPlayerTags();
}
function renderPlayerTags() {
  el('player-count').textContent = L.players.length;
  el('player-tags').innerHTML = L.players.map(p =>
    `<div class="tag">${esc(p)}<span class="tag-remove" onclick="removePlayer('${esc(p)}')">&times;</span></div>`
  ).join('');
}

// ── Setup: prompts ──────────────────────────────────────────
function addPrompt() {
  const inp = el('prompt-input');
  const text = inp.value.trim();
  if (!text || L.prompts.includes(text)) { inp.focus(); return; }
  L.prompts.push(text);
  inp.value = ''; inp.focus();
  renderPromptChips();
}
function removePrompt(i) {
  L.prompts.splice(i,1);
  renderPromptChips(); filterBank();
}
function renderPromptChips() {
  el('prompt-count').textContent = L.prompts.length;
  el('prompt-chips').innerHTML = L.prompts.map((p,i) =>
    `<div class="prompt-chip"><span>${esc(p)}</span>
     <span class="prompt-chip-remove" onclick="removePrompt(${i})">&times;</span></div>`
  ).join('');
}

// ── Prompt bank ─────────────────────────────────────────────
let bankFilter = '';
function openPromptBank() {
  el('prompt-bank-modal').style.display = 'flex';
  el('bank-search').value = ''; bankFilter = '';
  renderBankCategories(PROMPT_BANK);
}
function closePromptBank(e) {
  if (e && e.target !== e.currentTarget) return;
  el('prompt-bank-modal').style.display = 'none';
}
function filterBank() {
  bankFilter = el('bank-search').value.toLowerCase();
  const filtered = PROMPT_BANK
    .map(cat => ({...cat, prompts: cat.prompts.filter(p => p.toLowerCase().includes(bankFilter))}))
    .filter(cat => cat.prompts.length > 0);
  renderBankCategories(filtered);
}
function renderBankCategories(cats) {
  el('bank-categories').innerHTML = cats.map(cat =>
    `<div class="bank-category">
      <div class="bank-cat-title">${cat.category}</div>
      <div class="bank-prompts">${cat.prompts.map(p => {
        const added = L.prompts.includes(p);
        return `<button class="bank-prompt-btn ${added?'added':''}" onclick="toggleBankPrompt('${esc(p)}')">
          <span>${esc(p)}</span><span class="check">${added?'✓':'+'}</span></button>`;
      }).join('')}</div>
    </div>`
  ).join('');
}
function toggleBankPrompt(text) {
  if (L.prompts.includes(text)) L.prompts = L.prompts.filter(p => p !== text);
  else L.prompts.push(text);
  renderPromptChips(); filterBank();
}

// ═══════════════════════════════════════════════════════════
//  START GAME (host)
// ═══════════════════════════════════════════════════════════
async function startGame() {
  if (L.players.length < 3) { alert('Add at least 3 players!'); return; }
  if (L.prompts.length < 1) { alert('Add at least 1 prompt!'); return; }

  const btn = el('start-btn');
  btn.textContent = 'CONNECTING...'; btn.disabled = true;

  try {
    L.roomCode = generateCode();
    L.isHost   = true;

    await rp().set({
      phase:        'waiting',   // waiting | ranking | guessing | revealing | done
      round:        1,
      rankerIndex:  0,
      promptIndex:  0,
      players:      L.players,
      prompts:      L.prompts,
      rankerName:   '',
      trueRanking:  [],
      groupGuess:   [],
      revealedCount: 0,
    });

    showScreen('screen-host');
    el('host-room-code').textContent = L.roomCode;
    el('host-big-code').textContent  = L.roomCode;
    subscribeHost();

  } catch (err) {
    console.error(err);
    alert('Firebase error:\n' + err.message);
    btn.textContent = 'START GAME'; btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
//  JOIN ROOM (phone)
// ═══════════════════════════════════════════════════════════
async function joinRoom() {
  const code = el('join-code-input').value.trim().toUpperCase();
  if (!code) return;

  const btn = el('join-btn');
  btn.textContent = '...'; btn.disabled = true;

  try {
    const snap = await db().ref('rooms/' + code).once('value');
    if (!snap.exists()) {
      el('join-error').style.display = 'block';
      btn.textContent = '→'; btn.disabled = false;
      return;
    }
    el('join-error').style.display = 'none';
    L.roomCode = code;
    L.isHost   = false;
    showScreen('screen-ctrl');
    subscribeController();
  } catch(err) {
    alert('Could not connect:\n' + err.message);
    btn.textContent = '→'; btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
//  HOST — Firebase listener
// ═══════════════════════════════════════════════════════════
function subscribeHost() {
  if (L.listener) L.listener.off();
  L.listener = rp();
  L.listener.on('value', snap => {
    if (!snap.exists()) return;
    renderHost(snap.val());
  });
}

function renderHost(s) {
  const ranker  = s.players[s.rankerIndex % s.players.length];
  const prompt  = s.prompts[s.promptIndex % s.prompts.length];
  const actions = el('host-actions');
  const status  = el('host-status');

  el('host-round-num').textContent   = s.round;
  el('host-ranker-name').textContent = ranker + ' is ranking';
  el('host-prompt-text').textContent = prompt;

  // Scoreboard pills
  el('scoreboard-players').innerHTML = s.players.map(p =>
    `<div class="score-pill ${p === ranker ? 'is-ranker' : ''}">${esc(p)}</div>`
  ).join('');

  // Show/hide sections
  el('host-waiting-join').style.display  = s.phase === 'waiting'  ? 'block' : 'none';
  el('host-prompt-area').style.display   = ['ranking','guessing'].includes(s.phase) ? 'block' : 'none';
  el('host-reveal-area').style.display   = ['revealing','done'].includes(s.phase)   ? 'block' : 'none';

  if (s.phase === 'waiting') {
    actions.innerHTML = '';

  } else if (s.phase === 'ranking') {
    status.textContent = 'Pass the phone to ' + ranker + ' to rank secretly...';
    actions.innerHTML  = '';

  } else if (s.phase === 'guessing') {
    status.textContent = 'Group is deciding their guess...';
    actions.innerHTML  = `<button class="btn-host-action" onclick="hostStartReveal()">REVEAL →</button>`;

  } else if (s.phase === 'revealing') {
    status.textContent = '';
    renderReveal(s);
    const revealed = s.revealedCount || 0;
    const total    = s.trueRanking.length;
    if (revealed < total) {
      actions.innerHTML = `<button class="btn-host-action" onclick="hostRevealNext()">REVEAL #${revealed+1} →</button>`;
    } else {
      actions.innerHTML = `
        <button class="btn-host-secondary" onclick="goSetup()">← Setup</button>
        <button class="btn-host-action" onclick="hostNextRound()">NEXT ROUND →</button>`;
    }

  } else if (s.phase === 'done') {
    renderReveal(s);
    actions.innerHTML = `
      <button class="btn-host-secondary" onclick="goSetup()">← Setup</button>
      <button class="btn-host-action" onclick="hostNextRound()">NEXT ROUND →</button>`;
  }
}

function renderReveal(s) {
  const revealed = s.revealedCount || 0;
  const total    = s.trueRanking.length;
  const guess    = s.groupGuess || [];
  const list     = el('reveal-list');

  // Build revealed items (bottom-up: highest rank first = position 1 at top)
  // We reveal from position 1 downward
  list.innerHTML = '';
  for (let i = 0; i < revealed; i++) {
    const name     = s.trueRanking[i];
    const guessed  = guess[i];
    const correct  = name === guessed;
    const li = document.createElement('li');
    li.className = 'reveal-item';
    li.innerHTML = `
      <span class="reveal-rank">${i+1}</span>
      <span class="reveal-name">${esc(name)}</span>
      <span class="reveal-badge ${correct ? 'correct' : 'wrong'}">${correct ? '✓ Correct' : '✗ Wrong'}</span>`;
    list.appendChild(li);
  }

  // Next hidden slot teaser
  const nextSlot = el('reveal-next-slot');
  if (revealed < total) {
    nextSlot.style.display = 'flex';
    el('reveal-next-num').textContent = revealed + 1;
  } else {
    nextSlot.style.display = 'none';
  }

  // Title
  el('reveal-title').textContent = revealed === 0 ? 'GET READY...' :
    revealed < total ? 'THE RANKING' : '🎉 FULL RANKING';
}

async function hostStartReveal() {
  await rp().update({ phase: 'revealing', revealedCount: 0 });
}

async function hostRevealNext() {
  const snap    = await rp().once('value');
  const s       = snap.val();
  const current = s.revealedCount || 0;
  const total   = s.trueRanking.length;
  const next    = current + 1;
  await rp().update({
    revealedCount: next,
    phase: next >= total ? 'done' : 'revealing',
  });
}

async function hostNextRound() {
  const snap = await rp().once('value');
  const s    = snap.val();
  await rp().update({
    phase:         'ranking',
    round:         s.round + 1,
    rankerIndex:   s.rankerIndex + 1,
    promptIndex:   s.promptIndex + 1,
    rankerName:    '',
    trueRanking:   [],
    groupGuess:    [],
    revealedCount: 0,
  });
}

function goSetup() {
  if (L.listener) { L.listener.off(); L.listener = null; }
  showScreen('screen-landing');
}

// ═══════════════════════════════════════════════════════════
//  CONTROLLER — Firebase listener
// ═══════════════════════════════════════════════════════════
function subscribeController() {
  if (L.listener) L.listener.off();
  L.listener = rp();
  L.listener.on('value', snap => {
    if (!snap.exists()) return;
    renderCtrl(snap.val());
  });
}

function hideAllCtrl() {
  ['ctrl-idle','ctrl-ranker-pick','ctrl-ranker','ctrl-guesser','ctrl-done']
    .forEach(id => el(id).style.display = 'none');
}
function showCtrl(id) {
  const e = el(id);
  e.style.display = 'flex';
  e.style.flexDirection = 'column';
}

function renderCtrl(s) {
  const ranker = s.players[s.rankerIndex % s.players.length];
  const prompt = s.prompts[s.promptIndex % s.prompts.length];
  hideAllCtrl();

  if (s.phase === 'waiting') {
    showCtrl('ctrl-idle');
    return;
  }

  if (s.phase === 'ranking') {
    // Has ranker been picked yet?
    if (!s.rankerName) {
      // Show name picker — who is the ranker this round?
      showCtrl('ctrl-ranker-pick');
      el('ctrl-ranker-name-grid').innerHTML = s.players.map(p =>
        `<button class="name-btn" onclick="pickRanker('${esc(p)}')">${esc(p)}</button>`
      ).join('');
    } else {
      // Ranker confirmed — show ranking UI
      showCtrl('ctrl-ranker');
      el('ctrl-ranker-you-badge').textContent = s.rankerName + ' is ranking secretly';
      el('ctrl-ranker-prompt').textContent = prompt;
      buildSortable('ranker-sort-list', s.players.filter(p => p !== s.rankerName));
    }
    return;
  }

  if (s.phase === 'guessing') {
    showCtrl('ctrl-guesser');
    el('ctrl-guess-badge').textContent = 'Guess ' + ranker + "'s ranking as a group";
    el('ctrl-guesser-prompt').textContent = prompt;
    buildSortable('guesser-sort-list', s.players.filter(p => p !== ranker));
    return;
  }

  if (s.phase === 'revealing' || s.phase === 'done') {
    showCtrl('ctrl-done');
    el('ctrl-done-msg').textContent = s.phase === 'done' ? 'Round over!' : 'Watch the big screen!';
    return;
  }
}

async function pickRanker(name) {
  await rp().update({ rankerName: name });
}

async function submitRanking() {
  const snap = await rp().once('value');
  const s    = snap.val();
  const items = document.querySelectorAll('#ranker-sort-list .sort-item');
  const ranking = Array.from(items).map(e => e.dataset.name);
  await rp().update({ trueRanking: ranking, phase: 'guessing' });
}

async function submitGuess() {
  const items = document.querySelectorAll('#guesser-sort-list .sort-item');
  const guess = Array.from(items).map(e => e.dataset.name);
  await rp().update({ groupGuess: guess, phase: 'revealing', revealedCount: 0 });
}

// ═══════════════════════════════════════════════════════════
//  DRAG & DROP SORTABLE
// ═══════════════════════════════════════════════════════════
let dragSrc = null;

function buildSortable(containerId, names) {
  const container = el(containerId);
  const existing  = Array.from(container.querySelectorAll('.sort-item')).map(e => e.dataset.name);
  if (existing.join(',') === names.join(',')) return; // don't rebuild if same

  container.innerHTML = names.map((name, i) =>
    `<div class="sort-item" data-name="${esc(name)}" draggable="true">
      <span class="sort-handle">⠿</span>
      <span class="sort-rank">${i+1}</span>
      <span class="sort-name">${esc(name)}</span>
    </div>`
  ).join('');

  container.querySelectorAll('.sort-item').forEach(item => {
    // Mouse
    item.addEventListener('dragstart', () => { dragSrc = item; setTimeout(() => item.classList.add('dragging'), 0); });
    item.addEventListener('dragend',   () => { item.classList.remove('dragging'); updateNums(container); });
    item.addEventListener('dragover',  e  => { e.preventDefault(); container.querySelectorAll('.sort-item').forEach(el => el.classList.remove('drag-over')); item.classList.add('drag-over'); });
    item.addEventListener('dragleave', ()  => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault(); item.classList.remove('drag-over');
      if (dragSrc && dragSrc !== item) {
        const all = [...container.children];
        if (all.indexOf(dragSrc) < all.indexOf(item)) item.after(dragSrc); else item.before(dragSrc);
        updateNums(container);
      }
    });

    // Touch
    let ghost = null, oy = 0;
    item.addEventListener('touchstart', e => {
      dragSrc = item;
      const t = e.touches[0], r = item.getBoundingClientRect();
      oy = t.clientY - r.top;
      ghost = item.cloneNode(true);
      ghost.style.cssText = `position:fixed;z-index:9999;left:${r.left}px;top:${r.top}px;width:${r.width}px;opacity:0.85;pointer-events:none;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.2);`;
      document.body.appendChild(ghost);
      item.classList.add('dragging');
    }, {passive:true});

    item.addEventListener('touchmove', e => {
      if (!ghost) return;
      ghost.style.top = (e.touches[0].clientY - oy) + 'px';
      const sibs = [...container.children].filter(c => c !== dragSrc);
      for (const sib of sibs) {
        sib.classList.remove('drag-over');
        const r = sib.getBoundingClientRect();
        if (e.touches[0].clientY > r.top && e.touches[0].clientY < r.bottom) {
          sib.classList.add('drag-over');
          if (e.touches[0].clientY < r.top + r.height/2) sib.before(dragSrc); else sib.after(dragSrc);
          break;
        }
      }
    }, {passive:true});

    item.addEventListener('touchend', () => {
      if (ghost) { ghost.remove(); ghost = null; }
      item.classList.remove('dragging');
      container.querySelectorAll('.sort-item').forEach(e => e.classList.remove('drag-over'));
      updateNums(container);
    });
  });
}

function updateNums(container) {
  container.querySelectorAll('.sort-rank').forEach((e, i) => e.textContent = i+1);
}

// ── Keyboard shortcuts ──────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.activeElement.id === 'player-input')    addPlayer();
    if (document.activeElement.id === 'prompt-input')    addPrompt();
    if (document.activeElement.id === 'join-code-input') joinRoom();
  }
  if (e.key === 'Escape') closePromptBank(null);
});

