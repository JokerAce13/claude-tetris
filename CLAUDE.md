# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

No build step. Open `index.html` directly in a browser, or serve statically:

```
python3 -m http.server 8000
```

No package manager, no bundler, no transpiler, no test framework.

## Architecture

Three files, no modules, single global scope:

- `index.html` — Canvas `#board` (300×600px) + aside panel with score/level/next-piece canvas + overlay div
- `style.css` — Dark/retro theme using flexbox; `backdrop-filter` overlays for pause/game-over
- `game.js` — All game logic (~305 lines, `'use strict'`)

### Board and Piece Model

**Board**: `ROWS×COLS` (20×10) 2D array. Cell value `0` = empty; `1–7` = piece type (doubles as color index).

**Piece**: `{ type, x, y, shape }` where `shape` is a 2D matrix deep-copied from `PIECES[type]`.

### Key Constants

| Constant | Value | Purpose |
|---|---|---|
| `COLS`, `ROWS` | 10, 20 | Board dimensions |
| `BLOCK` | 30px | Cell size in pixels |
| `PIECES` | array[8] | Null at [0]; shapes 1–7 |
| `COLORS` | array[8] | Null at [0]; hex colors 1–7 |
| `LINE_SCORES` | [0,100,300,500,800] | Points per 1–4 lines cleared |

### Game Loop

`requestAnimationFrame`-driven. `loop(ts)` accumulates `dt`, drops piece when `dropAccum >= dropInterval`.

`dropInterval = max(100, 1000 − (level − 1) × 90)` ms. Level advances every 10 lines.

### Core Functions

| Function | What it does |
|---|---|
| `collide(shape, ox, oy)` | Out-of-bounds or overlap check |
| `rotateCW(shape)` | Transpose + reverse rows |
| `tryRotate()` | Rotation with wall kicks `[0, -1, 1, -2, 2]` |
| `merge()` | Stamps current piece into board |
| `clearLines()` | Removes complete rows, updates score/level/speed |
| `ghostY()` | Projects piece downward to landing Y |
| `hardDrop()` | Teleports to `ghostY`, +2pts/row |
| `lockPiece()` | `merge` → `clearLines` → `spawn` |
| `spawn()` | Promotes `next` to `current`; calls `endGame` if spawn collides |
| `init()` | Full reset, starts loop |
| `togglePause()` | Cancels/resumes `animId`, shows/hides overlay |

### Input

Single `keydown` listener on `document`: `ArrowLeft/Right/Down`, `ArrowUp`/`KeyX` (rotate), `Space` (hard drop), `KeyP` (pause).
