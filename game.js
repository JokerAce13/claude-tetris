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

// Pastel variants: lighter, desaturated versions of COLORS
const COLORS_PASTEL = [
  null,
  '#a8e8f0', // I - pastel cyan
  '#fff0a8', // O - pastel yellow
  '#ddb8ec', // T - pastel purple
  '#b8e4bb', // S - pastel green
  '#f5b8b8', // Z - pastel red/pink
  '#96c8f5', // J - pastel blue
  '#ffdcaa', // L - pastel orange
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
const skinSelect = document.getElementById('skin-select');

let activeSkin = 'retro';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
    updateHUD();
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

// ---- Skin: Retro (default) ----
function drawBlockRetro(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight strip
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// ---- Skin: Neon ----
function drawBlockNeon(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  // Dark fill with color tint
  context.fillStyle = color + '33';
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // Glow border
  context.shadowBlur = 12;
  context.shadowColor = color;
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  context.globalAlpha = 1;
}

// ---- Skin: Pastel ----
function drawBlockPastel(context, x, y, colorIndex, size, alpha) {
  const color = COLORS_PASTEL[colorIndex];
  const cornerSize = 4;
  context.globalAlpha = alpha ?? 1;
  // Main fill
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // Soft highlight strip
  context.fillStyle = 'rgba(255,255,255,0.30)';
  context.fillRect(x * size + 2, y * size + 2, size - 4, 3);
  // Simulate rounded corners by masking with canvas background color
  const bgColor = getCanvasBg();
  context.fillStyle = bgColor;
  // top-left corner
  context.fillRect(x * size + 1, y * size + 1, cornerSize, cornerSize);
  // top-right corner
  context.fillRect(x * size + size - 1 - cornerSize, y * size + 1, cornerSize, cornerSize);
  // bottom-left corner
  context.fillRect(x * size + 1, y * size + size - 1 - cornerSize, cornerSize, cornerSize);
  // bottom-right corner
  context.fillRect(x * size + size - 1 - cornerSize, y * size + size - 1 - cornerSize, cornerSize, cornerSize);
  context.globalAlpha = 1;
}

// ---- Skin: Pixel ----
function drawBlockPixel(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  // Derive a darker shade by parsing hex and darkening
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const dark = `rgb(${Math.floor(r * 0.45)},${Math.floor(g * 0.45)},${Math.floor(b * 0.45)})`;
  const mid = `rgb(${Math.floor(r * 0.7)},${Math.floor(g * 0.7)},${Math.floor(b * 0.7)})`;

  context.globalAlpha = alpha ?? 1;

  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  const half = Math.floor(s / 2);

  // Dithered 2x2 quadrant fill
  context.fillStyle = color;
  context.fillRect(px, py, half, half);
  context.fillRect(px + half, py + half, s - half, s - half);

  context.fillStyle = mid;
  context.fillRect(px + half, py, s - half, half);
  context.fillRect(px, py + half, half, s - half);

  // Inner dot pattern (cross)
  const cx = px + Math.floor(s / 2);
  const cy = py + Math.floor(s / 2);
  context.fillStyle = dark;
  context.fillRect(cx - 1, cy - 3, 2, 6);
  context.fillRect(cx - 3, cy - 1, 6, 2);

  context.globalAlpha = 1;
}

// ---- Dispatcher ----
function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  switch (activeSkin) {
    case 'neon':   drawBlockNeon(context, x, y, colorIndex, size, alpha); break;
    case 'pastel': drawBlockPastel(context, x, y, colorIndex, size, alpha); break;
    case 'pixel':  drawBlockPixel(context, x, y, colorIndex, size, alpha); break;
    default:       drawBlockRetro(context, x, y, colorIndex, size, alpha); break;
  }
}

function drawGrid() {
  if (activeSkin === 'neon') {
    // Neon: barely visible grid
    ctx.strokeStyle = 'rgba(80,80,120,0.15)';
    ctx.lineWidth = 0.5;
  } else if (activeSkin === 'pixel') {
    // Pixel: thicker, more visible grid
    ctx.strokeStyle = document.documentElement.dataset.theme === 'light' ? '#8888aa' : '#444466';
    ctx.lineWidth = 1;
  } else {
    ctx.strokeStyle = document.documentElement.dataset.theme === 'light' ? '#c8cce0' : '#22222e';
    ctx.lineWidth = 0.5;
  }
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

function getCanvasBg() {
  if (activeSkin === 'neon') return '#050508';
  return document.documentElement.dataset.theme === 'light' ? '#dde0f0' : '#1a1a25';
}

function draw() {
  // Set canvas background based on active skin
  ctx.fillStyle = getCanvasBg();
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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
  nextCtx.fillStyle = getCanvasBg();
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
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
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
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
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
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

function toggleTheme() {
  const html = document.documentElement;
  const goLight = html.dataset.theme !== 'light';
  html.dataset.theme = goLight ? 'light' : 'dark';
  themeToggleBtn.textContent = goLight ? '☾ DARK' : '☀ LIGHT';
  localStorage.setItem('tetris-theme', html.dataset.theme);
  // Re-render canvas with updated background color (unconditional — must repaint even when paused/game-over)
  draw();
  drawNext();
}

function initTheme() {
  const saved = localStorage.getItem('tetris-theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  themeToggleBtn.textContent = saved === 'light' ? '☾ DARK' : '☀ LIGHT';
}

function setSkin(skin) {
  activeSkin = skin;
  localStorage.setItem('tetris-skin', skin);
  skinSelect.value = skin;
  // Sync canvas CSS background so neon's #050508 fill matches at border-radius corners
  canvas.style.background = skin === 'neon' ? '#050508' : '';
  draw();
  drawNext();
}

function initSkin() {
  const saved = localStorage.getItem('tetris-skin') || 'retro';
  activeSkin = saved;
  skinSelect.value = saved;
}

restartBtn.addEventListener('click', init);
themeToggleBtn.addEventListener('click', toggleTheme);
skinSelect.addEventListener('change', () => setSkin(skinSelect.value));

initTheme();
initSkin();
init();
