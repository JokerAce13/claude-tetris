'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#2196F3', // J - blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const LS_SCORES_KEY = 'tetris-highscores';
const LS_STATS_KEY  = 'tetris-stats';
const MAX_HS = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

// High-scores overlay elements
const overlayNameSection = document.getElementById('overlay-name-section');
const overlayNameInput   = document.getElementById('overlay-name-input');
const overlaySaveBtn     = document.getElementById('overlay-save-btn');
const overlayHsTable     = document.getElementById('overlay-hs-table');
const overlayResetBtn    = document.getElementById('overlay-reset-btn');
const startPlayBtn       = document.getElementById('start-play-btn');

// Records panel elements
const recBestScore = document.getElementById('rec-best-score');
const recBestLines = document.getElementById('rec-best-lines');
const recBestCombo = document.getElementById('rec-best-combo');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, lastClearedLines;
let pendingEntry = null; // { score, lines, maxCombo } waiting for name input

// Block all input before the first game starts (treated as pre-game "game over" state)
gameOver = true;
paused = false;

// ---- Persistence helpers ----

function loadHighScores() {
  try {
    return JSON.parse(localStorage.getItem(LS_SCORES_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function saveHighScores(list) {
  localStorage.setItem(LS_SCORES_KEY, JSON.stringify(list));
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(LS_STATS_KEY)) || { bestScore: 0, bestLines: 0, bestCombo: 0 };
  } catch (_) {
    return { bestScore: 0, bestLines: 0, bestCombo: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem(LS_STATS_KEY, JSON.stringify(stats));
}

function addHighScore(name, entryScore, entryLines, entryCombo) {
  const entry = { name: name || 'AAA', score: entryScore, lines: entryLines, maxCombo: entryCombo };
  const list = loadHighScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_HS);
  saveHighScores(trimmed);

  // Find the saved position (−1 if trimmed out of top-5)
  const index = trimmed.indexOf(entry);

  // Update running stats (use in-memory object to avoid redundant localStorage read)
  const stats = loadStats();
  stats.bestScore = Math.max(stats.bestScore, entryScore);
  stats.bestLines = Math.max(stats.bestLines, entryLines);
  stats.bestCombo = Math.max(stats.bestCombo, entryCombo);
  saveStats(stats);

  return { list: trimmed, index };
}

function resetRecords() {
  localStorage.removeItem(LS_SCORES_KEY);
  localStorage.removeItem(LS_STATS_KEY);
}

// ---- Records panel (aside) ----

function updateRecordsPanel() {
  const stats = loadStats();
  recBestScore.textContent = stats.bestScore.toLocaleString();
  recBestLines.textContent = stats.bestLines;
  recBestCombo.textContent = stats.bestCombo;
}

// ---- High-scores table rendering ----

// highlightIndex: 0-based position of the current session's entry to highlight, or -1 for none
function renderHsTable(list, highlightIndex) {
  overlayHsTable.innerHTML = '';

  if (!list || list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hs-empty';
    empty.textContent = 'Sin records aún';
    overlayHsTable.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'hs-table';

  const thead = table.createTHead();
  const hrow = thead.insertRow();
  ['#', 'Nombre', 'Puntos', 'Líneas'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    hrow.appendChild(th);
  });

  const tbody = table.createTBody();
  list.forEach((entry, i) => {
    const tr = tbody.insertRow();
    if (i === highlightIndex) {
      tr.className = 'hs-highlight';
    }
    [i + 1, entry.name, entry.score.toLocaleString(), entry.lines].forEach(val => {
      const td = tr.insertCell();
      td.textContent = val;
    });
  });

  overlayHsTable.appendChild(table);
}

// ---- Overlay state machine ----

function showStartScreen() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  overlayNameSection.classList.add('hidden');
  overlayResetBtn.classList.remove('hidden');
  startPlayBtn.classList.remove('hidden');
  restartBtn.classList.add('hidden');
  overlay.classList.remove('hidden');

  const list = loadHighScores();
  renderHsTable(list, -1);
  overlayHsTable.classList.remove('hidden');
}

function showGameOverEntry(entryScore, entryLines, entryCombo) {
  pendingEntry = { score: entryScore, lines: entryLines, maxCombo: entryCombo };
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${entryScore.toLocaleString()}`;
  overlayNameSection.classList.remove('hidden');
  overlayHsTable.classList.add('hidden');
  overlayResetBtn.classList.add('hidden');
  startPlayBtn.classList.add('hidden');
  restartBtn.classList.add('hidden');
  overlayNameInput.value = '';
  overlay.classList.remove('hidden');
  // Focus on the next paint so the overlay is rendered before focus()
  requestAnimationFrame(() => overlayNameInput.focus());
}

function commitScore() {
  if (!pendingEntry) return;
  const name = overlayNameInput.value.trim().slice(0, 16) || 'AAA';
  const { list, index } = addHighScore(name, pendingEntry.score, pendingEntry.lines, pendingEntry.maxCombo);
  pendingEntry = null;

  overlayNameSection.classList.add('hidden');
  overlayScore.textContent = '';
  renderHsTable(list, index);
  overlayHsTable.classList.remove('hidden');
  overlayResetBtn.classList.remove('hidden');
  restartBtn.classList.remove('hidden');
  updateRecordsPanel();
}

// ---- Board helpers ----

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    lastClearedLines = cleared;
    updateHUD();
  } else {
    lastClearedLines = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  // Combo tracking: increment if this lock cleared lines, reset otherwise
  if (lastClearedLines > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = document.documentElement.dataset.theme === 'light' ? '#c8cce0' : '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  showGameOverEntry(score, lines, maxCombo);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlayNameSection.classList.add('hidden');
    overlayHsTable.classList.add('hidden');
    overlayResetBtn.classList.add('hidden');
    startPlayBtn.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  lastClearedLines = 0;
  pendingEntry = null;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Event listeners ----

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

// Name input: submit on Enter
overlayNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitScore();
  }
});

overlaySaveBtn.addEventListener('click', commitScore);

overlayResetBtn.addEventListener('click', () => {
  resetRecords();
  updateRecordsPanel();
  renderHsTable([], -1);
});

startPlayBtn.addEventListener('click', init);

restartBtn.addEventListener('click', init);

themeToggleBtn.addEventListener('click', toggleTheme);

// ---- Theme ----

function toggleTheme() {
  const html = document.documentElement;
  const goLight = html.dataset.theme !== 'light';
  html.dataset.theme = goLight ? 'light' : 'dark';
  themeToggleBtn.textContent = goLight ? '☾ DARK' : '☀ LIGHT';
  localStorage.setItem('tetris-theme', html.dataset.theme);
}

function initTheme() {
  const saved = localStorage.getItem('tetris-theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  themeToggleBtn.textContent = saved === 'light' ? '☾ DARK' : '☀ LIGHT';
}

// ---- Startup ----

initTheme();
updateRecordsPanel();
showStartScreen();
