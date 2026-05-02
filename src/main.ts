import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Text,
  TextStyle,
} from "pixi.js";
import "./styles.css";

const COLS = 6;
const ROWS = 5;
const PARTS = ["head", "body"] as const;
const TILE_GAP = 8;
const MAX_TILE_SIZE = 76;
const MIN_TILE_SIZE = 48;
const LEVELS: Array<{ score: number; unlockedCats: number }> = [
  { score: 0, unlockedCats: 3 },
  { score: 800, unlockedCats: 4 },
  { score: 1800, unlockedCats: 5 },
  { score: 3200, unlockedCats: 6 },
  { score: 5200, unlockedCats: 7 },
  { score: 7600, unlockedCats: 8 },
  { score: 10400, unlockedCats: 9 },
  { score: 13600, unlockedCats: 10 },
];

type Part = (typeof PARTS)[number];

type Cat = {
  id: string;
  name: string;
  color: number;
  accent: number;
  mark: string;
};

type Piece = {
  uid: string;
  cat: string;
  part: Part;
};

type TileView = {
  root: Container;
  pieceLayer: Container;
  bg: Graphics;
  pieceShape: Graphics;
  mark: Text;
  label: Text;
  index: number;
};

type MatchPair = {
  a: number;
  b: number;
  cat: string;
};

type SoundKind = "drag" | "clean" | "match" | "combo" | "drop" | "meow";

const CATS: Cat[] = [
  { id: "mike", name: "三毛", color: 0xf7b267, accent: 0xfff0d6, mark: "ミ" },
  { id: "kuro", name: "黒猫", color: 0x333745, accent: 0xf8f1ff, mark: "ク" },
  { id: "shiro", name: "白猫", color: 0xf8f5ee, accent: 0xd8a47f, mark: "シ" },
  { id: "tora", name: "茶トラ", color: 0xd9863d, accent: 0xfff4c7, mark: "ト" },
  { id: "saba", name: "サバ", color: 0x8896ab, accent: 0xf4f7fb, mark: "サ" },
  { id: "hai", name: "灰猫", color: 0xa7a8aa, accent: 0xffe0ef, mark: "ハ" },
  { id: "hachi", name: "ハチワレ", color: 0x23252f, accent: 0xffffff, mark: "八" },
  { id: "buchi", name: "ブチ", color: 0xf2eee8, accent: 0x3b3b42, mark: "ブ" },
  { id: "shamu", name: "シャム", color: 0xd6c0a3, accent: 0x4b3a38, mark: "ム" },
  { id: "sabi", name: "サビ", color: 0x775244, accent: 0xd0a35c, mark: "ビ" },
];

const app = new Application();
await app.init({
  backgroundAlpha: 0,
  resizeTo: window,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
});

document.querySelector<HTMLDivElement>("#app")?.appendChild(app.canvas);

const scene = new Container();
const boardLayer = new Container();
const effectLayer = new Container();
const dragLayer = new Container();
const uiLayer = new Container();
app.stage.eventMode = "static";
app.stage.addChild(scene);
scene.addChild(boardLayer, effectLayer, dragLayer, uiLayer);

const titleStyle = new TextStyle({
  fill: "#2a2528",
  fontFamily: "Yu Gothic, Meiryo, sans-serif",
  fontSize: 42,
  fontWeight: "900",
});
const smallStyle = new TextStyle({
  fill: "#756f73",
  fontFamily: "Yu Gothic, Meiryo, sans-serif",
  fontSize: 14,
  fontWeight: "700",
});
const hudStyle = new TextStyle({
  fill: "#2a2528",
  fontFamily: "Yu Gothic, Meiryo, sans-serif",
  fontSize: 18,
  fontWeight: "800",
});
const labelStyle = new TextStyle({
  fill: "#4b4447",
  fontFamily: "Yu Gothic, Meiryo, sans-serif",
  fontSize: 13,
  fontWeight: "900",
});

const title = new Text({ text: "にゃんともかんとも", style: titleStyle });
const subtitle = new Text({ text: "6 x 5 Match Puzzle", style: smallStyle });
const scoreText = new Text({ text: "", style: hudStyle });
const messageText = new Text({
  text: "好きなパーツをドラッグして入れ替えよう",
  style: smallStyle,
});
uiLayer.addChild(subtitle, title, scoreText, messageText);

let board: Array<Piece | null> = [];
let tileViews: TileView[] = [];
let score = 0;
let totalMatches = 0;
let chain = 0;
let level = 1;
let unlockedCatCount: number = LEVELS[0].unlockedCats;
let tileSize = MAX_TILE_SIZE;
let boardX = 0;
let boardY = 0;
let dragging = false;
let draggedIndex = -1;
let draggedPiece: Piece | null = null;
let dragGhost: Container | null = null;
let activeIndex = -1;
let cleanedDuringDrag = 0;
let resolving = false;
let audioContext: AudioContext | null = null;
let lastDragSoundAt = 0;

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function makePiece(): Piece {
  const cats = CATS.slice(0, unlockedCatCount);
  const cat = cats[Math.floor(Math.random() * cats.length)];
  const part = PARTS[Math.floor(Math.random() * PARTS.length)];
  return {
    uid: randomId(),
    cat: cat.id,
    part,
  };
}

function catById(id: string): Cat {
  const cat = CATS.find(item => item.id === id);
  if (!cat) {
    throw new Error(`Unknown cat id: ${id}`);
  }
  return cat;
}

function createBoard(): void {
  board = Array.from({ length: COLS * ROWS }, makePiece);
  score = 0;
  totalMatches = 0;
  chain = 0;
  level = 1;
  unlockedCatCount = LEVELS[0].unlockedCats;
  cleanedDuringDrag = 0;
  updateHud();
  renderBoard();
}

function updateHud(): void {
  scoreText.text = `Lv ${level}   猫 ${unlockedCatCount}種   スコア ${score.toLocaleString("ja-JP")}   マッチ ${totalMatches}   連鎖 ${chain}`;
}

function updateLevel(): void {
  const previousLevel = level;
  let nextLevelIndex = 0;
  LEVELS.forEach((settings, index) => {
    if (score >= settings.score) {
      nextLevelIndex = index;
    }
  });
  const nextLevel = Math.max(1, nextLevelIndex + 1);
  level = nextLevel;
  unlockedCatCount = LEVELS[nextLevel - 1].unlockedCats;
  updateHud();

  if (level > previousLevel) {
    showLevelUpText();
    playSound("combo", level + 1);
    messageText.text = `レベルアップ。猫が${unlockedCatCount}種に増えた`;
  }
}

function ensureAudio(): void {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function indexToPos(index: number): { x: number; y: number } {
  return {
    x: index % COLS,
    y: Math.floor(index / COLS),
  };
}

function posToIndex(x: number, y: number): number {
  return y * COLS + x;
}

function getStepToward(fromIndex: number, toIndex: number): number {
  const from = indexToPos(fromIndex);
  const to = indexToPos(toIndex);
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  return posToIndex(from.x + dx, from.y + dy);
}

function indexFromGlobalPoint(globalX: number, globalY: number): number | null {
  const localX = globalX - boardX;
  const localY = globalY - boardY;
  const pitch = tileSize + TILE_GAP;
  const x = Math.floor(localX / pitch);
  const y = Math.floor(localY / pitch);
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
  const withinX = localX - x * pitch <= tileSize;
  const withinY = localY - y * pitch <= tileSize;
  if (!withinX || !withinY) return null;
  return posToIndex(x, y);
}

function canCleanWithDraggedPiece(fromIndex: number, toIndex: number): boolean {
  const draggedPiece = board[fromIndex];
  const targetPiece = board[toIndex];
  if (!draggedPiece || !targetPiece) return false;
  return draggedPiece.uid !== targetPiece.uid
    && draggedPiece.cat === targetPiece.cat
    && draggedPiece.part === targetPiece.part;
}

function moveOrCleanPiece(fromIndex: number, toIndex: number): void {
  if (canCleanWithDraggedPiece(fromIndex, toIndex)) {
    playSound("clean", cleanedDuringDrag);
    spawnCleanBurst(toIndex);
    board[toIndex] = board[fromIndex];
    board[fromIndex] = null;
    cleanedDuringDrag += 1;
    score += 80;
    messageText.text = `${cleanedDuringDrag}個おそうじ`;
    updateLevel();
    return;
  }

  [board[fromIndex], board[toIndex]] = [board[toIndex], board[fromIndex]];
}

function makeTileView(index: number): TileView {
  const root = new Container();
  const bg = new Graphics();
  const pieceLayer = new Container();
  const pieceShape = new Graphics();
  const mark = new Text({ text: "", style: labelStyle });
  const label = new Text({ text: "", style: labelStyle });
  root.eventMode = "static";
  root.cursor = "grab";
  root.on("pointerdown", event => onPointerDown(event, index));
  pieceLayer.addChild(pieceShape, mark, label);
  root.addChild(bg, pieceLayer);
  return { root, pieceLayer, bg, pieceShape, mark, label, index };
}

function renderBoard(): void {
  boardLayer.removeChildren();
  tileViews = board.map((_, index) => makeTileView(index));

  tileViews.forEach(view => {
    const { x, y } = indexToPos(view.index);
    view.root.position.set(x * (tileSize + TILE_GAP), y * (tileSize + TILE_GAP));
    drawTile(view, board[view.index]);
    boardLayer.addChild(view.root);
  });
}

function drawTile(view: TileView, piece: Piece | null): void {
  view.bg.clear();
  view.pieceShape.clear();
  view.mark.text = "";
  view.label.text = "";

  view.bg.roundRect(0, 0, tileSize, tileSize, 8).fill(piece ? 0xfffdf8 : 0xfff4df);
  view.bg.roundRect(2, tileSize - 7, tileSize - 4, 5, 4).fill({ color: 0x2a2528, alpha: 0.08 });

  if (!piece) {
    view.root.alpha = 0.45;
    view.pieceLayer.visible = true;
    return;
  }

  view.root.alpha = 1;
  view.pieceLayer.visible = !(dragging && view.index === activeIndex);
  const cat = catById(piece.cat);
  const center = tileSize / 2;
  const size = tileSize * 0.58;
  const shapeX = center - size / 2;
  const shapeY = center - size / 2;

  if (piece.part === "head") {
    view.pieceShape.poly([
      center - size * 0.32, shapeY + size * 0.12,
      center - size * 0.12, shapeY - size * 0.12,
      center + size * 0.02, shapeY + size * 0.18,
    ]).fill(cat.color);
    view.pieceShape.poly([
      center + size * 0.32, shapeY + size * 0.12,
      center + size * 0.12, shapeY - size * 0.12,
      center - size * 0.02, shapeY + size * 0.18,
    ]).fill(cat.color);
    view.pieceShape.circle(center, center, size * 0.46).fill(cat.color);
    view.pieceShape.circle(center - size * 0.16, center - size * 0.05, size * 0.04).fill(0x2a2528);
    view.pieceShape.circle(center + size * 0.16, center - size * 0.05, size * 0.04).fill(0x2a2528);
    view.pieceShape.circle(center - size * 0.28, center - size * 0.2, size * 0.16).fill({ color: cat.accent, alpha: 0.72 });
  } else {
    view.pieceShape.roundRect(shapeX + size * 0.08, shapeY + size * 0.08, size * 0.8, size * 0.7, size * 0.28).fill(cat.color);
    view.pieceShape.roundRect(shapeX + size * 0.68, shapeY + size * 0.12, size * 0.32, size * 0.18, size * 0.12).fill(cat.color);
    view.pieceShape.circle(shapeX + size * 0.63, shapeY + size * 0.24, size * 0.13).fill(cat.accent);
  }

  view.mark.text = cat.mark;
  view.mark.anchor.set(0.5);
  view.mark.position.set(center, center + (piece.part === "head" ? size * 0.18 : 0));
  view.label.text = piece.part === "head" ? "頭" : "体";
  view.label.anchor.set(1, 1);
  view.label.position.set(tileSize - 6, tileSize - 5);

  view.pieceLayer.scale.set(view.index === activeIndex ? 1.13 : 1);
  view.pieceLayer.position.set(
    view.index === activeIndex ? -tileSize * 0.065 : 0,
    view.index === activeIndex ? -tileSize * 0.065 : 0,
  );
}

function refreshTiles(): void {
  tileViews.forEach(view => drawTile(view, board[view.index]));
}

function onPointerDown(event: FederatedPointerEvent, index: number): void {
  if (resolving || !board[index]) return;
  ensureAudio();
  dragging = true;
  draggedIndex = index;
  draggedPiece = board[index];
  activeIndex = index;
  cleanedDuringDrag = 0;
  showDragGhost(event.global.x, event.global.y);
  app.stage.eventMode = "static";
  app.stage.on("pointermove", onPointerMove);
  app.stage.once("pointerup", onPointerUp);
  app.stage.once("pointerupoutside", onPointerUp);
  event.stopPropagation();
  refreshTiles();
}

function onPointerMove(event: FederatedPointerEvent): void {
  if (!dragging || resolving) return;
  updateDragGhost(event.global.x, event.global.y);
  const nextIndex = indexFromGlobalPoint(event.global.x, event.global.y);
  if (nextIndex === null || nextIndex === draggedIndex) return;

  while (draggedIndex !== nextIndex) {
    const stepIndex = getStepToward(draggedIndex, nextIndex);
    playDragStepSound(stepIndex);
    moveOrCleanPiece(draggedIndex, stepIndex);
    draggedIndex = stepIndex;
  }

  activeIndex = nextIndex;
  refreshTiles();
}

async function onPointerUp(): Promise<void> {
  if (!dragging) return;
  dragging = false;
  activeIndex = -1;
  draggedPiece = null;
  hideDragGhost();
  app.stage.off("pointermove", onPointerMove);
  refreshTiles();

  if (cleanedDuringDrag > 0) {
    totalMatches += cleanedDuringDrag;
    updateHud();
    await wait(140);
    await dropAndRefill();
  }

  const cleanedFirst = cleanedDuringDrag > 0;
  cleanedDuringDrag = 0;
  resolveBoard(cleanedFirst);
}

function showDragGhost(globalX: number, globalY: number): void {
  if (!draggedPiece) return;
  hideDragGhost();

  const ghost = new Container();
  const bg = new Graphics();
  const shape = new Graphics();
  const mark = new Text({ text: "", style: labelStyle });
  const label = new Text({ text: "", style: labelStyle });
  ghost.addChild(bg, shape, mark, label);
  dragLayer.addChild(ghost);
  dragGhost = ghost;

  drawGhostPiece(bg, shape, mark, label, draggedPiece);
  ghost.alpha = 0.96;
  ghost.scale.set(1.12);
  updateDragGhost(globalX, globalY);
}

function updateDragGhost(globalX: number, globalY: number): void {
  if (!dragGhost) return;
  dragGhost.position.set(globalX - tileSize / 2, globalY - tileSize / 2);
}

function hideDragGhost(): void {
  if (!dragGhost) return;
  dragGhost.destroy({ children: true });
  dragGhost = null;
}

function drawGhostPiece(
  bg: Graphics,
  shape: Graphics,
  mark: Text,
  label: Text,
  piece: Piece,
): void {
  bg.clear();
  shape.clear();
  const cat = catById(piece.cat);
  const center = tileSize / 2;
  const size = tileSize * 0.62;
  const shapeX = center - size / 2;
  const shapeY = center - size / 2;

  bg.roundRect(0, 0, tileSize, tileSize, 10).fill({ color: 0xffffff, alpha: 0.82 });
  bg.roundRect(4, tileSize - 8, tileSize - 8, 5, 4).fill({ color: 0x2a2528, alpha: 0.16 });

  if (piece.part === "head") {
    shape.poly([
      center - size * 0.32, shapeY + size * 0.12,
      center - size * 0.12, shapeY - size * 0.12,
      center + size * 0.02, shapeY + size * 0.18,
    ]).fill(cat.color);
    shape.poly([
      center + size * 0.32, shapeY + size * 0.12,
      center + size * 0.12, shapeY - size * 0.12,
      center - size * 0.02, shapeY + size * 0.18,
    ]).fill(cat.color);
    shape.circle(center, center, size * 0.46).fill(cat.color);
    shape.circle(center - size * 0.16, center - size * 0.05, size * 0.04).fill(0x2a2528);
    shape.circle(center + size * 0.16, center - size * 0.05, size * 0.04).fill(0x2a2528);
    shape.circle(center - size * 0.28, center - size * 0.2, size * 0.16).fill({ color: cat.accent, alpha: 0.72 });
  } else {
    shape.roundRect(shapeX + size * 0.08, shapeY + size * 0.08, size * 0.8, size * 0.7, size * 0.28).fill(cat.color);
    shape.roundRect(shapeX + size * 0.68, shapeY + size * 0.12, size * 0.32, size * 0.18, size * 0.12).fill(cat.color);
    shape.circle(shapeX + size * 0.63, shapeY + size * 0.24, size * 0.13).fill(cat.accent);
  }

  mark.text = cat.mark;
  mark.anchor.set(0.5);
  mark.position.set(center, center + (piece.part === "head" ? size * 0.18 : 0));
  label.text = piece.part === "head" ? "頭" : "体";
  label.anchor.set(1, 1);
  label.position.set(tileSize - 6, tileSize - 5);
}

function findMatches(): { cells: Set<number>; pairs: MatchPair[]; pairCount: number } {
  const cells = new Set<number>();
  const pairKeys = new Set<string>();
  const pairs: MatchPair[] = [];

  for (let index = 0; index < board.length; index += 1) {
    const piece = board[index];
    if (!piece) continue;
    const { x, y } = indexToPos(index);
    const neighbors: number[] = [];
    if (x > 0) neighbors.push(posToIndex(x - 1, y));
    if (x < COLS - 1) neighbors.push(posToIndex(x + 1, y));
    if (y > 0) neighbors.push(posToIndex(x, y - 1));
    if (y < ROWS - 1) neighbors.push(posToIndex(x, y + 1));

    neighbors.forEach(nextIndex => {
      const other = board[nextIndex];
      if (!other) return;
      if (piece.cat === other.cat && piece.part !== other.part) {
        cells.add(index);
        cells.add(nextIndex);
        const [a, b] = [index, nextIndex].sort((left, right) => left - right);
        const key = `${a}-${b}`;
        if (!pairKeys.has(key)) {
          pairKeys.add(key);
          pairs.push({ a, b, cat: piece.cat });
        }
      }
    });
  }

  return { cells, pairs, pairCount: pairs.length };
}

async function resolveBoard(cleanedFirst = false): Promise<void> {
  if (resolving) return;
  resolving = true;
  chain = 0;
  let matched = findMatches();

  if (matched.cells.size === 0) {
    messageText.text = cleanedFirst
      ? "きれいになった。次のパーツをおそうじしよう"
      : "惜しい。頭と体が隣り合うように動かしてみよう";
    resolving = false;
    updateHud();
    return;
  }

  while (matched.cells.size > 0) {
    chain += 1;
    totalMatches += matched.pairCount;
    score += matched.pairCount * 120 * chain;
    updateLevel();
    messageText.text = `${matched.pairCount}ペア成立。${chain}連鎖`;
    playSound(chain > 1 ? "combo" : "match", chain);
    playSound("meow", chain);
    showComboText(chain, matched.pairCount);
    matched.pairs.forEach((pair, index) => spawnRunningCat(pair, index));
    matched.cells.forEach(index => spawnMatchBurst(index));
    await wait(250);
    matched.cells.forEach(index => {
      board[index] = null;
    });
    refreshTiles();
    await wait(120);
    await dropAndRefill();
    playSound("drop", chain);
    matched = findMatches();
  }

  chain = 0;
  messageText.text = "次のペアを作ろう";
  updateHud();
  resolving = false;
}

async function dropAndRefill(): Promise<void> {
  const before = board.slice();
  const previousIndexByUid = new Map<string, number>();
  before.forEach((piece, index) => {
    if (piece) previousIndexByUid.set(piece.uid, index);
  });

  const spawnCountsByColumn = new Map<number, number>();

  for (let x = 0; x < COLS; x += 1) {
    const column: Piece[] = [];
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      const piece = board[posToIndex(x, y)];
      if (piece) column.push(piece);
    }
    spawnCountsByColumn.set(x, ROWS - column.length);
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      board[posToIndex(x, y)] = column.shift() ?? makePiece();
    }
  }

  refreshTiles();
  const pitch = tileSize + TILE_GAP;
  const startOffsets = tileViews.map(view => {
    const piece = board[view.index];
    if (!piece) return 0;

    const { x, y } = indexToPos(view.index);
    const previousIndex = previousIndexByUid.get(piece.uid);
    if (previousIndex !== undefined) {
      const previousY = indexToPos(previousIndex).y;
      return (previousY - y) * pitch;
    }

    return -(spawnCountsByColumn.get(x) ?? 1) * pitch;
  });

  let maxDistance = 0;
  tileViews.forEach(view => {
    const offset = startOffsets[view.index];
    maxDistance = Math.max(maxDistance, Math.abs(offset));
    view.pieceLayer.y += offset;
  });

  const maxCells = maxDistance / pitch;
  await animate(260 + maxCells * 70, progress => {
    tileViews.forEach(view => {
      const offset = startOffsets[view.index];
      const distanceCells = Math.abs(offset) / pitch;
      const delay = Math.min(0.28, distanceCells * 0.035);
      const localProgress = clamp((progress - delay) / (1 - delay), 0, 1);
      const eased = easeOutCubic(localProgress);
      const bounce = Math.sin(localProgress * Math.PI) * Math.min(9, distanceCells * 2.2) * (1 - localProgress);
      view.pieceLayer.y = offset * (1 - eased) + bounce;
    });
  });

  tileViews.forEach(view => {
    view.pieceLayer.y = 0;
  });
}

function spawnCleanBurst(index: number): void {
  spawnBurst(index, 0x7ba9d6, 12, "clean");
}

function spawnMatchBurst(index: number): void {
  spawnBurst(index, 0xd85c6f, 18, "match");
}

function spawnBurst(index: number, color: number, count: number, kind: "clean" | "match"): void {
  const { x, y } = indexToPos(index);
  const originX = boardX + x * (tileSize + TILE_GAP) + tileSize / 2;
  const originY = boardY + y * (tileSize + TILE_GAP) + tileSize / 2;
  const ring = new Graphics();
  ring.circle(0, 0, tileSize * 0.22).stroke({ width: 3, color, alpha: 0.78 });
  ring.position.set(originX, originY);
  effectLayer.addChild(ring);
  animate(kind === "clean" ? 260 : 360, progress => {
    const eased = easeOutCubic(progress);
    ring.scale.set(1 + eased * (kind === "clean" ? 0.9 : 1.35));
    ring.alpha = 1 - progress;
  }).then(() => ring.destroy());

  for (let i = 0; i < count; i += 1) {
    const particle = new Graphics();
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
    const distance = tileSize * (0.42 + Math.random() * (kind === "clean" ? 0.48 : 0.72));
    if (kind === "match" && i % 3 === 0) {
      drawStar(particle, 0, 0, 5 + Math.random() * 3, color);
    } else {
      particle.circle(0, 0, 3 + Math.random() * 3).fill(color);
    }
    particle.position.set(originX, originY);
    effectLayer.addChild(particle);
    animate(kind === "clean" ? 340 : 480, progress => {
      const eased = 1 - (1 - progress) ** 2;
      particle.position.set(
        originX + Math.cos(angle) * distance * eased,
        originY + Math.sin(angle) * distance * eased + progress * progress * tileSize * 0.22,
      );
      particle.alpha = 1 - progress;
      particle.rotation += 0.16;
      particle.scale.set(1 + progress * (kind === "clean" ? 0.65 : 1.1));
    }).then(() => particle.destroy());
  }
}

function drawStar(graphics: Graphics, x: number, y: number, radius: number, color: number): void {
  const points: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 10;
    const pointRadius = i % 2 === 0 ? radius : radius * 0.42;
    points.push(x + Math.cos(angle) * pointRadius, y + Math.sin(angle) * pointRadius);
  }
  graphics.poly(points).fill(color);
}

function showComboText(combo: number, pairCount: number): void {
  const text = new Text({
    text: combo > 1 ? `${combo}連鎖!` : `${pairCount}ペア!`,
    style: new TextStyle({
      fill: combo > 1 ? "#d85c6f" : "#7ba9d6",
      fontFamily: "Yu Gothic, Meiryo, sans-serif",
      fontSize: combo > 1 ? 46 : 34,
      fontWeight: "900",
      stroke: { color: "#fffdf8", width: 8 },
    }),
  });
  text.anchor.set(0.5);
  text.position.set(app.screen.width / 2, boardY - 24);
  text.scale.set(0.7);
  effectLayer.addChild(text);

  animate(620, progress => {
    const pop = progress < 0.28
      ? 0.7 + easeOutCubic(progress / 0.28) * 0.46
      : 1.16 - (progress - 0.28) * 0.12;
    text.scale.set(pop);
    text.y = boardY - 24 - progress * 34;
    text.alpha = progress < 0.72 ? 1 : 1 - (progress - 0.72) / 0.28;
  }).then(() => text.destroy());
}

function showLevelUpText(): void {
  const text = new Text({
    text: `LEVEL ${level}`,
    style: new TextStyle({
      fill: "#d85c6f",
      fontFamily: "Yu Gothic, Meiryo, sans-serif",
      fontSize: 48,
      fontWeight: "900",
      stroke: { color: "#fffdf8", width: 9 },
    }),
  });
  const subText = new Text({
    text: `猫 ${unlockedCatCount}種 解放`,
    style: new TextStyle({
      fill: "#2a2528",
      fontFamily: "Yu Gothic, Meiryo, sans-serif",
      fontSize: 20,
      fontWeight: "900",
      stroke: { color: "#fffdf8", width: 6 },
    }),
  });
  const group = new Container();
  text.anchor.set(0.5);
  subText.anchor.set(0.5);
  text.position.set(0, -14);
  subText.position.set(0, 34);
  group.addChild(text, subText);
  group.position.set(app.screen.width / 2, app.screen.height / 2);
  group.scale.set(0.68);
  effectLayer.addChild(group);

  animate(900, progress => {
    const pop = progress < 0.25
      ? 0.68 + easeOutCubic(progress / 0.25) * 0.42
      : 1.1 - (progress - 0.25) * 0.08;
    group.scale.set(pop);
    group.y = app.screen.height / 2 - progress * 28;
    group.alpha = progress < 0.72 ? 1 : 1 - (progress - 0.72) / 0.28;
  }).then(() => group.destroy({ children: true }));
}

function spawnRunningCat(pair: MatchPair, order: number): void {
  const cat = catById(pair.cat);
  const first = indexToCenter(pair.a);
  const second = indexToCenter(pair.b);
  const startX = (first.x + second.x) / 2;
  const startY = (first.y + second.y) / 2;
  const direction = startX < app.screen.width / 2 ? -1 : 1;
  const runner = createRunningCat(cat);
  runner.position.set(startX, startY + order * 4);
  runner.scale.set(0.62 * direction, 0.62);
  effectLayer.addChild(runner);

  const endX = direction > 0 ? app.screen.width + tileSize : -tileSize * 2;
  const startDelay = order * 55;
  const duration = 1440 + Math.min(360, order * 56);

  animate(startDelay + duration, progress => {
    if (progress < startDelay / (startDelay + duration)) {
      runner.alpha = 0;
      return;
    }

    runner.alpha = 1;
    const localProgress = (progress - startDelay / (startDelay + duration))
      / (duration / (startDelay + duration));
    const eased = easeOutCubic(clamp(localProgress, 0, 1));
    runner.x = startX + (endX - startX) * eased;
    runner.y = startY + Math.sin(localProgress * Math.PI * 8) * 4;
    runner.rotation = Math.sin(localProgress * Math.PI * 10) * 0.05;
  }).then(() => runner.destroy({ children: true }));
}

function indexToCenter(index: number): { x: number; y: number } {
  const { x, y } = indexToPos(index);
  return {
    x: boardX + x * (tileSize + TILE_GAP) + tileSize / 2,
    y: boardY + y * (tileSize + TILE_GAP) + tileSize / 2,
  };
}

function createRunningCat(cat: Cat): Container {
  const root = new Container();
  const body = new Graphics();
  const head = new Graphics();
  const legs = new Graphics();
  const tail = new Graphics();
  const mark = new Text({ text: cat.mark, style: labelStyle });

  body.roundRect(-28, -12, 46, 24, 14).fill(cat.color);
  body.circle(-12, -7, 8).fill({ color: cat.accent, alpha: 0.72 });

  head.circle(22, -11, 15).fill(cat.color);
  head.poly([12, -22, 18, -36, 24, -21]).fill(cat.color);
  head.poly([24, -22, 31, -35, 33, -18]).fill(cat.color);
  head.circle(17, -13, 2.3).fill(0x2a2528);
  head.circle(27, -13, 2.3).fill(0x2a2528);

  tail.roundRect(-42, -16, 28, 9, 6).fill(cat.color);
  tail.rotation = -0.35;

  legs.roundRect(-22, 7, 8, 18, 5).fill(cat.color);
  legs.roundRect(-5, 7, 8, 18, 5).fill(cat.color);
  legs.roundRect(10, 5, 8, 17, 5).fill(cat.color);

  mark.anchor.set(0.5);
  mark.position.set(22, -3);
  mark.scale.set(0.75);

  root.addChild(tail, body, legs, head, mark);
  return root;
}

function playSound(kind: SoundKind, intensity = 0): void {
  if (!audioContext) return;
  const ctx = audioContext;
  const now = ctx.currentTime;

  if (kind === "drag") {
    playTone(280 + (intensity % 5) * 24, 0.022, "sine", 0.018, now);
    return;
  }

  if (kind === "clean") {
    playTone(520 + intensity * 42, 0.045, "sine", 0.045, now);
    playTone(860 + intensity * 48, 0.075, "triangle", 0.035, now + 0.02);
    return;
  }

  if (kind === "match") {
    playTone(660, 0.07, "triangle", 0.05, now);
    playTone(990, 0.11, "sine", 0.045, now + 0.055);
    return;
  }

  if (kind === "meow") {
    playMeow(intensity);
    return;
  }

  if (kind === "combo") {
    playTone(720 + intensity * 70, 0.08, "triangle", 0.052, now);
    playTone(960 + intensity * 90, 0.1, "triangle", 0.05, now + 0.065);
    playTone(1240 + intensity * 90, 0.12, "sine", 0.045, now + 0.14);
    return;
  }

  playTone(170, 0.06, "sine", 0.026, now);
}

function playMeow(intensity: number): void {
  if (!audioContext) return;
  const ctx = audioContext;
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const base = 430 + Math.min(intensity, 5) * 28;

  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(base * 1.35, now);
  oscillator.frequency.exponentialRampToValueAtTime(base * 0.92, now + 0.18);
  oscillator.frequency.exponentialRampToValueAtTime(base * 1.08, now + 0.32);
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(980, now);
  filter.Q.setValueAtTime(6, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.018, now + 0.22);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

  oscillator.connect(filter).connect(gain).connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.42);
}

function playDragStepSound(stepIndex: number): void {
  if (!audioContext) return;
  const nowMs = performance.now();
  if (nowMs - lastDragSoundAt < 42) return;
  lastDragSoundAt = nowMs;
  playSound("drag", stepIndex);
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  startTime: number,
): void {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function layout(): void {
  const width = app.screen.width;
  const height = app.screen.height;
  const boardWidthLimit = width - 28;
  const boardHeightLimit = height - 168;
  tileSize = Math.max(
    MIN_TILE_SIZE,
    Math.min(
      MAX_TILE_SIZE,
      Math.floor((boardWidthLimit - TILE_GAP * (COLS - 1)) / COLS),
      Math.floor((boardHeightLimit - TILE_GAP * (ROWS - 1)) / ROWS),
    ),
  );

  const boardWidth = COLS * tileSize + (COLS - 1) * TILE_GAP;
  const boardHeight = ROWS * tileSize + (ROWS - 1) * TILE_GAP;
  boardX = Math.round((width - boardWidth) / 2);
  boardY = Math.round(Math.max(138, (height - boardHeight) / 2 + 42));

  subtitle.position.set(boardX, Math.max(16, boardY - 118));
  title.position.set(boardX, subtitle.y + 18);
  title.scale.set(width < 430 ? 0.78 : 1);
  scoreText.position.set(boardX, title.y + 58 * title.scale.y);
  messageText.position.set(boardX, boardY + boardHeight + 18);
  boardLayer.position.set(boardX, boardY);
  app.stage.hitArea = app.screen;
  renderBoard();
}

function animate(duration: number, frame: (progress: number) => void): Promise<void> {
  return new Promise(resolve => {
    const start = performance.now();
    const tick = (): void => {
      const progress = Math.min(1, (performance.now() - start) / duration);
      frame(progress);
      if (progress >= 1) {
        app.ticker.remove(tick);
        resolve();
      }
    };
    app.ticker.add(tick);
  });
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

window.addEventListener("resize", layout);
createBoard();
layout();
