"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── 定数 ──────────────────────────────────────────────────────────────────────
const N = 4;                 // 盤面 4x4
const W = 440;               // ロジック上のキャンバス幅（正方形）
const H = 440;
const PAD = 16;              // 盤面の外周余白
const GAP = 12;              // セル間の隙間
const CELL = (W - PAD * 2 - GAP * (N - 1)) / N; // = 91
const SCALE = 2;             // HiDPI
const SLIDE_MS = 110;        // スライドアニメ時間
const SPAWN_MS = 150;        // 出現アニメ時間
const POP_MS = 170;          // マージ時のポップ時間
const GOAL = 2048;           // ドラゴン到達目標
const BEST_KEY = "egg-merge-best";

type Phase = "playing" | "over" | "won";
type Dir = "up" | "down" | "left" | "right";

interface Tile {
  id: number;
  value: number;
  r: number;        // 現在のセル
  c: number;
  prevR: number;    // スライド元
  prevC: number;
  isNew: boolean;   // 出現アニメ
  bornTs: number;
  justMerged: boolean; // このマスがマージ結果
  popTs: number;
}

interface Style {
  bg: string;
  ring: string;
  emoji: string;
}

// 値ごとの見た目（たまご → ドラゴン）
const STYLES: Record<number, Style> = {
  2: { bg: "#fef3c7", ring: "#fcd34d", emoji: "🥚" },
  4: { bg: "#fde68a", ring: "#fbbf24", emoji: "🐣" },
  8: { bg: "#fed7aa", ring: "#fb923c", emoji: "🐥" },
  16: { bg: "#fdba74", ring: "#f97316", emoji: "🐤" },
  32: { bg: "#fbcfe8", ring: "#f472b6", emoji: "🐔" },
  64: { bg: "#f9a8d4", ring: "#ec4899", emoji: "🦉" },
  128: { bg: "#e9d5ff", ring: "#c084fc", emoji: "🦅" },
  256: { bg: "#d8b4fe", ring: "#a855f7", emoji: "🦩" },
  512: { bg: "#c7d2fe", ring: "#818cf8", emoji: "🦢" },
  1024: { bg: "#bfdbfe", ring: "#60a5fa", emoji: "🦚" },
  2048: { bg: "#a7f3d0", ring: "#34d399", emoji: "🐉" },
};
const STYLE_MAX: Style = { bg: "#6ee7b7", ring: "#10b981", emoji: "🐲" };
function styleFor(v: number): Style {
  return STYLES[v] ?? STYLE_MAX;
}

const VECTORS: Record<Dir, { r: number; c: number }> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
};

// ── ユーティリティ ────────────────────────────────────────────────────────────
function cellX(c: number) {
  return PAD + c * (CELL + GAP);
}
function cellY(r: number) {
  return PAD + r * (CELL + GAP);
}
function within(r: number, c: number) {
  return r >= 0 && r < N && c >= 0 && c < N;
}
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, radius: number
) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── コンポーネント ────────────────────────────────────────────────────────────
export function EggMerge() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<Phase>("playing");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [topEmoji, setTopEmoji] = useState("🥚");
  const [keptGoing, setKeptGoing] = useState(false); // 2048到達後も続行中か

  const s = useRef({
    grid: Array.from({ length: N }, () => Array<Tile | null>(N).fill(null)),
    tiles: [] as Tile[],        // 盤面に生存中のタイル
    absorbing: [] as Tile[],    // マージで吸収され消えるタイル（アニメ中のみ）
    nextId: 1,
    score: 0,
    best: 0,
    phase: "playing" as Phase,
    won: false,                 // 2048に一度到達したか
    wonShown: false,            // 勝利演出を出したか（再表示防止）
    // アニメ
    sliding: false,
    slideStart: 0,
    rafId: 0,
  });

  // ── 盤面操作 ─────────────────────────────────────────────────────────────
  const emptyCells = useCallback(() => {
    const st = s.current;
    const cells: { r: number; c: number }[] = [];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) if (!st.grid[r][c]) cells.push({ r, c });
    return cells;
  }, []);

  const spawn = useCallback(() => {
    const st = s.current;
    const cells = emptyCells();
    if (cells.length === 0) return;
    const { r, c } = cells[Math.floor(Math.random() * cells.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    const tile: Tile = {
      id: st.nextId++,
      value,
      r, c, prevR: r, prevC: c,
      isNew: true,
      bornTs: performance.now(),
      justMerged: false,
      popTs: 0,
    };
    st.grid[r][c] = tile;
    st.tiles.push(tile);
  }, [emptyCells]);

  const syncStats = useCallback(() => {
    const st = s.current;
    setScore(st.score);
    setBest(st.best);
    // 最大値の絵文字
    let mx = 0;
    for (const t of st.tiles) mx = Math.max(mx, t.value);
    setTopEmoji(styleFor(mx || 2).emoji);
  }, []);

  const movesAvailable = useCallback(() => {
    const st = s.current;
    if (emptyCells().length > 0) return true;
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const t = st.grid[r][c];
        if (!t) continue;
        if (r + 1 < N && st.grid[r + 1][c]?.value === t.value) return true;
        if (c + 1 < N && st.grid[r][c + 1]?.value === t.value) return true;
      }
    return false;
  }, [emptyCells]);

  const move = useCallback((dir: Dir) => {
    const st = s.current;
    if (st.sliding) return;
    if (st.phase === "over") return;

    const v = VECTORS[dir];
    const rs = [0, 1, 2, 3];
    const cs = [0, 1, 2, 3];
    if (v.r === 1) rs.reverse();
    if (v.c === 1) cs.reverse();

    // フラグ初期化
    for (const t of st.tiles) {
      t.prevR = t.r;
      t.prevC = t.c;
      t.isNew = false;
      t.justMerged = false;
    }
    st.absorbing = [];

    let moved = false;
    for (const r of rs) {
      for (const c of cs) {
        const tile = st.grid[r][c];
        if (!tile) continue;

        // 進行方向に空きをたどる
        let fr = r, fc = c;
        let nr = r + v.r, nc = c + v.c;
        while (within(nr, nc) && !st.grid[nr][nc]) {
          fr = nr; fc = nc;
          nr += v.r; nc += v.c;
        }

        const next = within(nr, nc) ? st.grid[nr][nc] : null;
        if (next && next.value === tile.value && !next.justMerged) {
          // tile を next に吸収させてマージ
          st.grid[r][c] = null;
          tile.r = next.r; tile.c = next.c;   // 吸収されながらスライド
          st.absorbing.push(tile);
          next.value *= 2;
          next.justMerged = true;
          st.score += next.value;
          if (next.value >= GOAL) st.won = true;
          moved = true;
        } else if (fr !== r || fc !== c) {
          // 空きマスまでスライド
          st.grid[r][c] = null;
          st.grid[fr][fc] = tile;
          tile.r = fr; tile.c = fc;
          moved = true;
        }
      }
    }

    if (!moved) return;

    // 吸収されたタイルは生存リストから外す
    st.tiles = st.tiles.filter((t) => !st.absorbing.includes(t));

    st.sliding = true;
    st.slideStart = performance.now();
  }, []);

  // スライド完了後の後処理
  const finishSlide = useCallback((now: number) => {
    const st = s.current;
    st.sliding = false;
    st.absorbing = [];
    // マージ結果のポップ開始
    for (const t of st.tiles) {
      if (t.justMerged) t.popTs = now;
    }
    st.best = Math.max(st.best, st.score);
    spawn();
    syncStats();

    if (st.won && !st.wonShown && st.phase === "playing") {
      st.wonShown = true;
      st.phase = "won";
      setPhase("won");
    } else if (!movesAvailable()) {
      st.phase = "over";
      setPhase("over");
    }
  }, [spawn, syncStats, movesAvailable]);

  // ── 描画 ─────────────────────────────────────────────────────────────────
  const draw = useCallback((ctx: CanvasRenderingContext2D, now: number) => {
    const st = s.current;
    ctx.save();
    ctx.scale(SCALE, SCALE);
    ctx.clearRect(0, 0, W, H);

    // 盤面パネル
    const boardGrad = ctx.createLinearGradient(0, 0, 0, H);
    boardGrad.addColorStop(0, "#eef4fb");
    boardGrad.addColorStop(1, "#dbe7f5");
    ctx.fillStyle = boardGrad;
    roundRect(ctx, 0, 0, W, H, 22);
    ctx.fill();

    // 空きセル
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        ctx.fillStyle = "rgba(37, 99, 235, 0.06)";
        roundRect(ctx, cellX(c), cellY(r), CELL, CELL, 16);
        ctx.fill();
      }
    }

    const slideT = st.sliding
      ? Math.min(1, (now - st.slideStart) / SLIDE_MS)
      : 1;
    const e = easeOut(slideT);

    // 吸収中タイル（結果タイルの下に描く）
    for (const t of st.absorbing) {
      const x = cellX(t.prevC) + (cellX(t.c) - cellX(t.prevC)) * e;
      const y = cellY(t.prevR) + (cellY(t.r) - cellY(t.prevR)) * e;
      drawTile(ctx, x, y, CELL, t.value, 1);
    }

    // 生存タイル
    for (const t of st.tiles) {
      const x = cellX(t.prevC) + (cellX(t.c) - cellX(t.prevC)) * e;
      const y = cellY(t.prevR) + (cellY(t.r) - cellY(t.prevR)) * e;

      let scale = 1;
      if (t.isNew) {
        const p = Math.min(1, (now - t.bornTs) / SPAWN_MS);
        scale = 0.2 + 0.8 * easeOut(p);
      } else if (t.popTs && now - t.popTs < POP_MS) {
        const p = (now - t.popTs) / POP_MS;
        scale = 1 + 0.18 * Math.sin(p * Math.PI);
      }
      drawTile(ctx, x, y, CELL, t.value, scale);
    }

    ctx.restore();
  }, []);

  function drawTile(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, size: number, value: number, scale: number
  ) {
    const stl = styleFor(value);
    const cx = x + size / 2;
    const cy = y + size / 2;
    const sz = size * scale;
    const sx = cx - sz / 2;
    const sy = cy - sz / 2;

    ctx.save();
    // 影
    ctx.shadowColor = "rgba(30, 64, 120, 0.18)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = stl.bg;
    roundRect(ctx, sx, sy, sz, sz, 16 * scale);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 枠リング
    ctx.strokeStyle = stl.ring;
    ctx.lineWidth = 2.5;
    roundRect(ctx, sx + 1.5, sy + 1.5, sz - 3, sz - 3, 14 * scale);
    ctx.stroke();

    // 絵文字
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(sz * 0.42)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.fillText(stl.emoji, cx, cy + sz * 0.06);

    // 数字（左上に小さく）
    ctx.fillStyle = "rgba(26, 39, 68, 0.62)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `bold ${Math.round(sz * 0.16)}px 'Inter', 'Yu Gothic UI', sans-serif`;
    ctx.fillText(String(value), sx + sz * 0.12, sy + sz * 0.1);
    ctx.restore();
  }

  // ── ループ ───────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const st = s.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const now = performance.now();
    if (st.sliding && now - st.slideStart >= SLIDE_MS) {
      finishSlide(now);
    }
    draw(ctx, now);
    st.rafId = requestAnimationFrame(tick);
  }, [draw, finishSlide]);

  // ── ゲーム開始 / リスタート ─────────────────────────────────────────────
  const reset = useCallback(() => {
    const st = s.current;
    st.grid = Array.from({ length: N }, () => Array<Tile | null>(N).fill(null));
    st.tiles = [];
    st.absorbing = [];
    st.score = 0;
    st.won = false;
    st.wonShown = false;
    st.phase = "playing";
    st.sliding = false;
    setPhase("playing");
    setKeptGoing(false);
    spawn();
    spawn();
    syncStats();
  }, [spawn, syncStats]);

  // ── マウント時 ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    // ベスト読み込み
    try {
      const saved = Number(localStorage.getItem(BEST_KEY) || "0");
      if (saved > 0) {
        s.current.best = saved;
        setBest(saved);
      }
    } catch {
      /* localStorage 不可でも続行 */
    }

    reset();
    s.current.rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.current.rafId);
  }, [reset, tick]);

  // ベスト永続化
  useEffect(() => {
    if (best <= 0) return;
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      /* noop */
    }
  }, [best]);

  // ── キーボード操作 ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
        W: "up", S: "down", A: "left", D: "right",
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      move(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  // ── スワイプ操作 ─────────────────────────────────────────────────────────
  const swipe = useRef({ x: 0, y: 0, active: false });
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, active: true };
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!swipe.current.active) return;
    swipe.current.active = false;
    const dx = e.clientX - swipe.current.x;
    const dy = e.clientY - swipe.current.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) < 24) return; // タップは無視
    if (adx > ady) move(dx > 0 ? "right" : "left");
    else move(dy > 0 ? "down" : "up");
  }, [move]);

  // ── 表示 ─────────────────────────────────────────────────────────────────
  const chipClass =
    phase === "won" ? "phase-cleared" : phase === "over" ? "phase-failed" : "phase-playing";
  const summaryText =
    phase === "won" ? "🐉 ドラゴン誕生！" : phase === "over" ? "うごかせない…" : "スワイプで合体！";

  return (
    <section className="prototype-shell">
      <div className="status-panel card">
        <div className={`phase-chip ${chipClass}`}>{summaryText}</div>

        <div className="status-grid">
          <div>
            <span>スコア</span>
            <strong>{score}</strong>
          </div>
          <div>
            <span>ベスト</span>
            <strong>{best}</strong>
          </div>
          <div>
            <span>いちばん大きいの</span>
            <strong style={{ fontSize: "1.8rem" }}>{topEmoji}</strong>
          </div>
          <div>
            <span>ゴール</span>
            <strong style={{ fontSize: "1.8rem" }}>🐉</strong>
          </div>
        </div>

        <p style={{ margin: "4px 2px 0", color: "var(--muted)", fontSize: "0.82rem", lineHeight: 1.7 }}>
          同じたまご・生きものをぶつけると合体！<br />
          🥚→🐣→🐥…と育てて🐉を目指そう。
        </p>

        <div className="controls" style={{ marginTop: 12 }}>
          <button className="wide" onClick={reset}>はじめから</button>
        </div>
      </div>

      <div className="play-panel card">
        <div className="canvas-shell merge-canvas-shell tap-enabled">
          <canvas
            ref={canvasRef}
            style={{ display: "block", touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          />

          {(phase === "over" || (phase === "won" && !keptGoing)) && (
            <div className={`result-overlay ${phase === "won" ? "clear" : "fail"}`}>
              <strong>{phase === "won" ? "🐉" : `${score}`}</strong>
              <span>{phase === "won" ? "ドラゴン誕生！" : "ゲームオーバー"}</span>
              {phase === "won" ? (
                <div className="controls" style={{ marginTop: 10, width: "70%" }}>
                  <button className="wide" onClick={() => { setKeptGoing(true); s.current.phase = "playing"; setPhase("playing"); }}>
                    このまま続ける
                  </button>
                  <button className="wide ghost" onClick={reset}>はじめから</button>
                </div>
              ) : (
                <div className="controls" style={{ marginTop: 10, width: "70%" }}>
                  <button className="wide" onClick={reset}>もう一度</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="controls">
          <button className="wide ghost" onClick={reset}>リスタート</button>
        </div>
      </div>
    </section>
  );
}
