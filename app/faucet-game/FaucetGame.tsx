"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── 定数 ──────────────────────────────────────────────────────────────────────
const W = 420;
const H = 560;
const FAUCET_COUNT = 5;
const FAUCET_Y = 72;          // 蛇口の中心Y
const BOTTLE_Y = H - 64;      // 瓶の中心Y
const BOTTLE_W = W * 0.15;    // 瓶の口の幅
const BOTTLE_H = 80;          // 瓶の高さ
const BOTTLE_MIN_X = BOTTLE_W / 2 + 16;
const BOTTLE_MAX_X = W - BOTTLE_W / 2 - 16;
const DROP_R = 6;             // 水滴の半径
const DROP_SPEED = 220;       // px/s
const SPAWN_INTERVAL = 120;   // ms（1蛇口あたりの水滴生成間隔）
const SWITCH_MIN = 1200;      // アクティブ蛇口が切り替わる最小間隔(ms)
const SWITCH_MAX = 2400;
const GAME_SECS = 20;
const SCALE = 2;              // canvas の devicePixelRatio 相当

type Phase = "ready" | "playing" | "result";

interface Drop {
  id: number;
  x: number;
  y: number;
}

interface FaucetState {
  x: number;
  active: boolean;
  spawnCd: number;
}

// 蛇口のX座標を均等分割
function makeFaucets(): FaucetState[] {
  return Array.from({ length: FAUCET_COUNT }, (_, i) => ({
    x: (W / (FAUCET_COUNT + 1)) * (i + 1),
    active: false,
    spawnCd: 0,
  }));
}

// ── コンポーネント ──────────────────────────────────────────────────────────────
export function FaucetGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  // ゲームステート（Reactに公開するもの）
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECS);

  // ゲームループ内で使うミュータブルな参照
  const stateRef = useRef({
    phase: "ready" as Phase,
    score: 0,
    bestScore: 0,
    timeLeft: GAME_SECS,
    bottleX: W / 2,
    faucets: makeFaucets(),
    drops: [] as Drop[],
    nextDropId: 0,
    nextSwitch: 0,
    elapsed: 0,
    lastTs: 0,
    rafId: 0,
  });

  // ドラッグ状態
  const dragRef = useRef({ dragging: false, startPointerX: 0, startBottleX: W / 2 });

  // ── ゲームロジック ─────────────────────────────────────────────────────────
  const tick = useCallback((ts: number) => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dt = s.lastTs ? Math.min(ts - s.lastTs, 80) : 16;
    s.lastTs = ts;

    if (s.phase === "playing") {
      s.elapsed += dt;
      s.timeLeft = Math.max(0, GAME_SECS - Math.floor(s.elapsed / 1000));
      setTimeLeft(s.timeLeft);

      // タイムアップ
      if (s.timeLeft <= 0) {
        s.phase = "result";
        s.bestScore = Math.max(s.bestScore, s.score);
        setBestScore(s.bestScore);
        setPhase("result");
        draw(ctx, s);
        return;
      }

      // アクティブ蛇口切り替え
      s.nextSwitch -= dt;
      if (s.nextSwitch <= 0) {
        // 1〜3個をランダムにアクティブ化
        const count = Math.floor(Math.random() * 2) + 1;
        const indices = [...Array(FAUCET_COUNT).keys()]
          .sort(() => Math.random() - 0.5)
          .slice(0, count);
        s.faucets.forEach((f, i) => {
          f.active = indices.includes(i);
        });
        s.nextSwitch = SWITCH_MIN + Math.random() * (SWITCH_MAX - SWITCH_MIN);
      }

      // 水滴生成
      for (const f of s.faucets) {
        if (!f.active) continue;
        f.spawnCd -= dt;
        if (f.spawnCd <= 0) {
          s.drops.push({
            id: s.nextDropId++,
            x: f.x + (Math.random() - 0.5) * 6,
            y: FAUCET_Y + 24,
          });
          f.spawnCd = SPAWN_INTERVAL;
        }
      }

      // 水滴移動 & 当たり判定
      const dtSec = dt / 1000;
      const bLeft = s.bottleX - BOTTLE_W / 2;
      const bRight = s.bottleX + BOTTLE_W / 2;

      s.drops = s.drops.filter((d) => {
        d.y += DROP_SPEED * dtSec;

        // 瓶の口に入ったか
        if (d.y + DROP_R >= BOTTLE_Y - BOTTLE_H / 2 && d.y - DROP_R < BOTTLE_Y + BOTTLE_H / 2) {
          if (d.x >= bLeft && d.x <= bRight) {
            s.score += 1;
            setScore(s.score);
            return false; // 削除
          }
        }

        // 画面外
        if (d.y > H + 20) return false;

        return true;
      });
    }

    draw(ctx, s);
    s.rafId = requestAnimationFrame(tick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 描画 ───────────────────────────────────────────────────────────────────
  function draw(ctx: CanvasRenderingContext2D, s: typeof stateRef.current) {
    ctx.save();
    ctx.scale(SCALE, SCALE);

    // 背景
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#fff7ed");
    bgGrad.addColorStop(1, "#fde68a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 蛇口
    for (const f of s.faucets) {
      drawFaucet(ctx, f.x, FAUCET_Y, f.active);
    }

    // 水滴
    for (const d of s.drops) {
      drawDrop(ctx, d.x, d.y);
    }

    // 瓶
    drawBottle(ctx, s.bottleX, BOTTLE_Y, s.score);

    // タイマーバー
    if (s.phase === "playing") {
      const ratio = s.timeLeft / GAME_SECS;
      const barW = W - 32;
      const barH = 10;
      const barX = 16;
      const barY = H - 18;
      ctx.fillStyle = "rgba(146, 64, 14, 0.14)";
      roundRect(ctx, barX, barY, barW, barH, 5);
      ctx.fill();
      const fillColor = ratio > 0.4 ? "#f97316" : ratio > 0.2 ? "#ef4444" : "#dc2626";
      ctx.fillStyle = fillColor;
      roundRect(ctx, barX, barY, barW * ratio, barH, 5);
      ctx.fill();
    }

    // オーバーレイ（ready / result）
    if (s.phase === "ready") {
      ctx.fillStyle = "rgba(255, 247, 237, 0.72)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#4a2a14";
      ctx.font = `bold ${28 / 1}px 'Yu Gothic UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("じゃぐちゲーム", W / 2, H / 2 - 20);
      ctx.font = `${16 / 1}px 'Yu Gothic UI', sans-serif`;
      ctx.fillStyle = "#8a5a3b";
      ctx.fillText("タップしてスタート", W / 2, H / 2 + 14);
    }

    if (s.phase === "result") {
      ctx.fillStyle = "rgba(255, 247, 237, 0.82)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#4a2a14";
      ctx.font = `bold ${36 / 1}px 'Yu Gothic UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`${s.score} 滴`, W / 2, H / 2 - 28);
      ctx.font = `bold ${17 / 1}px 'Yu Gothic UI', sans-serif`;
      ctx.fillStyle = "#f97316";
      ctx.fillText("タイムアップ！", W / 2, H / 2 + 10);
      if (s.score === s.bestScore && s.score > 0) {
        ctx.font = `bold ${14 / 1}px 'Yu Gothic UI', sans-serif`;
        ctx.fillStyle = "#ea580c";
        ctx.fillText("🏆 ベスト更新！", W / 2, H / 2 + 34);
      }
    }

    ctx.restore();
  }

  function drawFaucet(ctx: CanvasRenderingContext2D, x: number, y: number, active: boolean) {
    // パイプ部分（上からつながる縦棒）
    ctx.fillStyle = active ? "#f97316" : "#d6b08a";
    ctx.fillRect(x - 8, 0, 16, y - 16);

    // 蛇口本体
    ctx.fillStyle = active ? "#ea580c" : "#c08040";
    roundRect(ctx, x - 20, y - 20, 40, 20, 6);
    ctx.fill();

    // 蛇口の先端（下向き）
    ctx.fillStyle = active ? "#c2410c" : "#a06830";
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.lineTo(x + 7, y + 16);
    ctx.lineTo(x - 7, y + 16);
    ctx.closePath();
    ctx.fill();

    // アクティブ光エフェクト
    if (active) {
      ctx.shadowColor = "#f97316";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(249, 115, 22, 0.3)";
      ctx.beginPath();
      ctx.arc(x, y - 10, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawDrop(ctx: CanvasRenderingContext2D, x: number, y: number) {
    // しずく形（下が細くなる楕円）
    ctx.save();
    ctx.beginPath();
    // 上部は楕円、下部をすぼめてしずく形に近似
    ctx.arc(x, y - DROP_R * 0.3, DROP_R, 0, Math.PI * 2);
    ctx.fillStyle = "#60a5fa";
    ctx.shadowColor = "#3b82f6";
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;

    // ハイライト
    ctx.beginPath();
    ctx.arc(x - DROP_R * 0.35, y - DROP_R * 0.6, DROP_R * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fill();
    ctx.restore();
  }

  function drawBottle(ctx: CanvasRenderingContext2D, cx: number, cy: number, score: number) {
    const bw = BOTTLE_W;
    const bh = BOTTLE_H;
    const x = cx - bw / 2;
    const y = cy - bh / 2;

    // 瓶本体
    const bottleGrad = ctx.createLinearGradient(x, y, x + bw, y);
    bottleGrad.addColorStop(0, "rgba(186, 230, 253, 0.92)");
    bottleGrad.addColorStop(0.5, "rgba(224, 242, 254, 0.95)");
    bottleGrad.addColorStop(1, "rgba(147, 197, 253, 0.88)");
    ctx.fillStyle = bottleGrad;
    roundRect(ctx, x, y, bw, bh, 8);
    ctx.fill();

    // 水位（スコア量を表示）
    const maxDrops = 80; // 満水の目安
    const fillRatio = Math.min(score / maxDrops, 1);
    if (fillRatio > 0) {
      const waterH = (bh - 16) * fillRatio;
      const waterY = y + bh - 8 - waterH;
      const waterGrad = ctx.createLinearGradient(x, waterY, x, waterY + waterH);
      waterGrad.addColorStop(0, "rgba(96, 165, 250, 0.7)");
      waterGrad.addColorStop(1, "rgba(37, 99, 235, 0.85)");
      ctx.fillStyle = waterGrad;
      ctx.beginPath();
      ctx.rect(x + 4, waterY, bw - 8, waterH);
      ctx.clip();
      roundRect(ctx, x + 2, waterY, bw - 4, waterH + 8, 4);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.scale(SCALE, SCALE);
    }

    // 瓶の枠線
    ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, bw, bh, 8);
    ctx.stroke();

    // 瓶の口（強調）
    ctx.strokeStyle = "rgba(37, 99, 235, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x + bw, y + 4);
    ctx.stroke();
  }

  function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ── ゲーム開始 / リスタート ────────────────────────────────────────────────
  const startGame = useCallback(() => {
    const s = stateRef.current;
    cancelAnimationFrame(s.rafId);
    s.phase = "playing";
    s.score = 0;
    s.timeLeft = GAME_SECS;
    s.elapsed = 0;
    s.lastTs = 0;
    s.bottleX = W / 2;
    s.faucets = makeFaucets();
    s.drops = [];
    s.nextDropId = 0;
    s.nextSwitch = 0;
    setPhase("playing");
    setScore(0);
    setTimeLeft(GAME_SECS);
    s.rafId = requestAnimationFrame(tick);
  }, [tick]);

  // ── ポインター操作（瓶を動かす）─────────────────────────────────────────────
  const getCanvasX = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return W / 2;
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    if (s.phase === "ready" || s.phase === "result") {
      startGame();
      return;
    }
    dragRef.current = {
      dragging: true,
      startPointerX: e.clientX,
      startBottleX: s.bottleX,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [startGame]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const s = stateRef.current;
    const canvasX = getCanvasX(e.clientX);
    s.bottleX = Math.max(BOTTLE_MIN_X, Math.min(BOTTLE_MAX_X, canvasX));
  }, [getCanvasX]);

  const onPointerUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  // ── マウント時にループ開始 ────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // HiDPI対応
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    // 初回描画（readyオーバーレイ）
    const ctx = canvas.getContext("2d");
    if (ctx) draw(ctx, s);

    // ループ開始
    s.rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(s.rafId);
    };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 表示 ───────────────────────────────────────────────────────────────────
  const chipClass =
    phase === "result" ? "phase-cleared" : phase === "playing" ? "phase-playing" : "phase-ready";

  const summaryText =
    phase === "ready"
      ? "タップしてスタート"
      : phase === "result"
      ? "タイムアップ！"
      : `残り ${timeLeft}秒`;

  return (
    <section className="prototype-shell">
      {/* ステータスパネル */}
      <div className="status-panel card">
        <div className={`phase-chip ${chipClass}`}>{summaryText}</div>

        <div className="status-grid">
          <div>
            <span>集めた水</span>
            <strong>{score} 滴</strong>
          </div>
          <div>
            <span>ベスト</span>
            <strong>{bestScore} 滴</strong>
          </div>
          <div>
            <span>残り時間</span>
            <strong>{timeLeft}秒</strong>
          </div>
          <div>
            <span>蛇口</span>
            <strong>{FAUCET_COUNT} 個</strong>
          </div>
        </div>

        {phase === "result" && (
          <div className="controls" style={{ marginTop: 12 }}>
            <button className="wide" onClick={startGame}>
              もう一度
            </button>
          </div>
        )}
      </div>

      {/* プレイエリア */}
      <div className="play-panel card faucet-shell">
        <div
          className="canvas-shell faucet-canvas-shell tap-enabled"
          ref={shellRef}
        >
          <canvas
            ref={canvasRef}
            style={{ display: "block", cursor: phase === "playing" ? "grab" : "pointer" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        <div className="controls">
          <button
            className="wide ghost"
            onClick={() => {
              if (phase === "ready" || phase === "result") {
                startGame();
              } else {
                // playing中はリスタート
                startGame();
              }
            }}
          >
            {phase === "playing" ? "リスタート" : "もう一度"}
          </button>
        </div>
      </div>
    </section>
  );
}
