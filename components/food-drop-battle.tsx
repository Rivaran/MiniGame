"use client";

import { useEffect, useRef, useState } from "react";

// ── 定数 ─────────────────────────────────────────────────────────────────────
const W = 420;
const H = 560;
const FLOOR_Y = 526;
const BASKET_CY = 492;   // バスケット中心Y
const BASKET_IW = 80;    // バスケット内側幅
const BASKET_IH = 42;    // バスケット内側高さ
const BASKET_WALL = 10;  // 壁の厚み
const MIN_X = 54;
const MAX_X = W - 54;
const HUMAN_SPD = 440;   // px/s
const CPU_SPD = 220;     // px/s
const ITEM_R = 18;
const GAME_SECS = 60;

type FoodType = "candy" | "choco" | "donut" | "cookie" | "ice" | "pepper" | "broccoli";
type Phase = "menu" | "playing" | "result";
type Mode = "cpu" | "vs";

const FOOD_TABLE: { type: FoodType; good: boolean; pts: number; w: number }[] = [
  { type: "candy",    good: true,  pts: 10, w: 3 },
  { type: "choco",    good: true,  pts: 10, w: 3 },
  { type: "donut",    good: true,  pts: 10, w: 2 },
  { type: "cookie",   good: true,  pts: 10, w: 2 },
  { type: "ice",      good: true,  pts: 15, w: 1 },
  { type: "pepper",   good: false, pts: -5, w: 2 },
  { type: "broccoli", good: false, pts: -5, w: 1 },
];
const TOTAL_W = FOOD_TABLE.reduce((s, f) => s + f.w, 0);

function pickFood() {
  let r = Math.random() * TOTAL_W;
  for (const f of FOOD_TABLE) { r -= f.w; if (r <= 0) return f; }
  return FOOD_TABLE[0];
}

interface FoodItem {
  id: number; type: FoodType; x: number; y: number;
  vy: number; good: boolean; pts: number;
}

interface Snap {
  phase: Phase; mode: Mode;
  s1: number; s2: number;
  t: number; winner: number;
}

type Ctrl = {
  setT1: (x: number) => void;
  setT2: (x: number) => void;
  start: (m: Mode) => void;
  reset: () => void;
  destroy: () => void;
};

// ── コンポーネント ─────────────────────────────────────────────────────────────
export function FoodDropBattle() {
  const mountRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<Ctrl | null>(null);
  const [snap, setSnap] = useState<Snap>({
    phase: "menu", mode: "cpu", s1: 0, s2: 0, t: GAME_SECS, winner: 0,
  });

  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;

    const run = async () => {
      const PM = await import("phaser");
      const Phaser = PM.default ?? PM;
      if (cancelled || !mountRef.current) return;

      // ── ゲームステート（クロージャ変数）──────────────────────────────────────
      let phase: Phase = "menu";
      let mode: Mode = "cpu";
      let s1 = 0, s2 = 0;
      let t = GAME_SECS;
      let winner = 0;

      let b1x = W / 3, b2x = (W * 2) / 3;
      let tgt1 = W / 3, tgt2 = (W * 2) / 3;

      let items: FoodItem[] = [];
      let idCnt = 0;
      let spawnT = 700;
      let spawnI = 900;

      let cpuTgt = W * 0.65;
      let cpuDelay = 0;

      const push = () => {
        if (!cancelled) setSnap({ phase, mode, s1, s2, t: Math.ceil(t), winner });
      };

      // ── Phaserシーン ──────────────────────────────────────────────────────────
      class Scene extends Phaser.Scene {
        private b1g!: Phaser.GameObjects.Graphics;
        private b2g!: Phaser.GameObjects.Graphics;
        private itemGfx = new Map<number, Phaser.GameObjects.Graphics>();
        private flashes: { txt: Phaser.GameObjects.Text; life: number }[] = [];
        private keyA!: Phaser.Input.Keyboard.Key;
        private keyD!: Phaser.Input.Keyboard.Key;
        private keyLeft!: Phaser.Input.Keyboard.Key;
        private keyRight!: Phaser.Input.Keyboard.Key;

        constructor() { super("food-drop"); }

        create() {
          // 背景
          this.add.rectangle(W / 2, H / 2, W, H, 0xfff8e7).setDepth(-20);
          this.add.rectangle(W / 2, 56, W, 112, 0xfef3c7).setDepth(-19);
          this.add.rectangle(W / 2, 111, W, 2, 0xfde68a).setDepth(-18);
          // 床
          this.add.rectangle(W / 2, FLOOR_Y + 15, W, 30, 0xf59e0b).setDepth(-10);
          this.add.rectangle(W / 2, FLOOR_Y + 1, W, 6, 0xd97706).setDepth(-9);
          for (let i = 0; i < 8; i++) {
            this.add.circle(28 + i * 54, FLOOR_Y + 15, 5, 0xfde68a).setDepth(-8);
          }

          this.b1g = this.add.graphics().setDepth(10);
          this.b2g = this.add.graphics().setDepth(10);
          this.drawBaskets();

          this.keyA = this.input.keyboard!.addKey("A");
          this.keyD = this.input.keyboard!.addKey("D");
          this.keyLeft = this.input.keyboard!.addKey("LEFT");
          this.keyRight = this.input.keyboard!.addKey("RIGHT");
        }

        update(_: number, delta: number) {
          if (phase !== "playing") return;
          const dt = delta / 1000;

          // P1 キーボード
          if (this.keyA.isDown) tgt1 = Math.max(MIN_X, tgt1 - HUMAN_SPD * dt);
          if (this.keyD.isDown) tgt1 = Math.min(MAX_X, tgt1 + HUMAN_SPD * dt);

          // P2 キーボード or CPU
          if (mode === "vs") {
            if (this.keyLeft.isDown)  tgt2 = Math.max(MIN_X, tgt2 - HUMAN_SPD * dt);
            if (this.keyRight.isDown) tgt2 = Math.min(MAX_X, tgt2 + HUMAN_SPD * dt);
          } else {
            cpuDelay -= delta;
            if (cpuDelay <= 0) {
              let nearest: FoodItem | null = null, best = Infinity;
              for (const it of items) {
                if (!it.good) continue;
                const d = Math.abs(it.x - b2x);
                if (d < best) { best = d; nearest = it; }
              }
              cpuTgt = nearest ? nearest.x : W * 0.65;
              cpuDelay = 160 + Math.random() * 280;
            }
            const diff = cpuTgt - b2x;
            tgt2 = Math.max(MIN_X, Math.min(MAX_X,
              b2x + Math.sign(diff) * Math.min(CPU_SPD * dt, Math.abs(diff))
            ));
          }

          // バスケット移動（スムーズ）
          b1x += (tgt1 - b1x) * 0.28;
          b2x += (tgt2 - b2x) * 0.28;

          // アイテムスポーン
          spawnT -= delta;
          if (spawnT <= 0) {
            const f = pickFood();
            const item: FoodItem = {
              id: idCnt++, type: f.type,
              x: ITEM_R + 10 + Math.random() * (W - (ITEM_R + 10) * 2),
              y: -ITEM_R, vy: 155 + Math.random() * 110,
              good: f.good, pts: f.pts,
            };
            items.push(item);
            const g = this.add.graphics().setDepth(7);
            this.drawFood(g, item.type);
            this.itemGfx.set(item.id, g);
            const elapsed = GAME_SECS - t;
            spawnI = Math.max(460, 900 - elapsed * 5);
            spawnT = spawnI + (Math.random() * 180 - 90);
          }

          // アイテム更新
          const toRemove: number[] = [];
          for (const it of items) {
            it.y += it.vy * dt;
            const g = this.itemGfx.get(it.id);
            if (g) g.setPosition(it.x, it.y);

            const inY = it.y > BASKET_CY - BASKET_IH * 0.6 - ITEM_R * 0.5
                     && it.y < BASKET_CY + BASKET_IH * 0.5 + ITEM_R * 0.3;
            if (inY) {
              if (Math.abs(it.x - b1x) < BASKET_IW / 2 + ITEM_R * 0.55) {
                s1 = Math.max(0, s1 + it.pts);
                this.flash(it.x, it.y, it.pts, "#1d4ed8");
                toRemove.push(it.id); continue;
              }
              if (Math.abs(it.x - b2x) < BASKET_IW / 2 + ITEM_R * 0.55) {
                s2 = Math.max(0, s2 + it.pts);
                this.flash(it.x, it.y, it.pts, "#991b1b");
                toRemove.push(it.id); continue;
              }
            }
            if (it.y > FLOOR_Y + ITEM_R) toRemove.push(it.id);
          }
          for (const id of toRemove) {
            const g = this.itemGfx.get(id);
            if (g) { g.destroy(); this.itemGfx.delete(id); }
          }
          items = items.filter(i => !toRemove.includes(i.id));

          // フラッシュ更新
          this.flashes = this.flashes.filter(f => {
            f.life -= dt;
            f.txt.y -= 52 * dt;
            f.txt.setAlpha(f.life * 2);
            if (f.life <= 0) { f.txt.destroy(); return false; }
            return true;
          });

          // タイマー
          t = Math.max(0, t - dt);
          if (t <= 0) {
            phase = "result";
            winner = s1 > s2 ? 1 : s2 > s1 ? 2 : 0;
            this.clearItems();
          }

          this.drawBaskets();
          push();
        }

        private clearItems() {
          for (const g of this.itemGfx.values()) g.destroy();
          this.itemGfx.clear();
          items = [];
          for (const f of this.flashes) f.txt.destroy();
          this.flashes = [];
        }

        private flash(x: number, y: number, pts: number, color: string) {
          const txt = this.add.text(x, y, pts > 0 ? `+${pts}` : `${pts}`, {
            fontFamily: "sans-serif", fontSize: "16px", color,
            fontStyle: "bold", stroke: "#ffffff", strokeThickness: 3,
          }).setOrigin(0.5).setDepth(30);
          this.flashes.push({ txt, life: 0.65 });
        }

        private drawBaskets() {
          this.drawBasket(this.b1g, b1x, 0x3b82f6, 0x1d4ed8);
          this.drawBasket(this.b2g, b2x, 0xef4444, 0x991b1b);
        }

        private drawBasket(g: Phaser.GameObjects.Graphics, x: number, fill: number, dark: number) {
          const hw = BASKET_IW / 2;
          const ht = BASKET_IH / 2;
          const cy = BASKET_CY;
          const wt = BASKET_WALL;
          g.clear();
          // 影
          g.fillStyle(0x000000, 0.1);
          g.fillEllipse(x, cy + ht + 6, BASKET_IW + wt * 2 + 4, 10);
          // 壁（暗い色）
          g.fillStyle(dark, 1);
          g.fillRect(x - hw - wt, cy - ht, wt, BASKET_IH + 6);
          g.fillRect(x + hw,      cy - ht, wt, BASKET_IH + 6);
          g.fillRect(x - hw - wt, cy + ht, BASKET_IW + wt * 2, 7);
          // 内側（明るい色）
          g.fillStyle(fill, 0.88);
          g.fillRect(x - hw, cy - ht, BASKET_IW, BASKET_IH);
          // リム
          g.fillStyle(dark, 1);
          g.fillRect(x - hw - wt, cy - ht - 7, BASKET_IW + wt * 2, 8);
          // 光沢
          g.fillStyle(0xffffff, 0.18);
          g.fillRect(x - hw + 4, cy - ht + 4, BASKET_IW - 8, 7);
        }

        private drawFood(g: Phaser.GameObjects.Graphics, type: FoodType) {
          const R = ITEM_R;
          g.clear();
          if (type === "candy") {
            g.fillStyle(0xf472b6, 1); g.fillCircle(0, 0, R);
            g.fillStyle(0xffffff, 0.5); g.fillCircle(-R * 0.3, -R * 0.3, R * 0.32);
            g.lineStyle(3, 0xbe185d, 1); g.strokeCircle(0, 0, R);
            g.fillStyle(0xbe185d, 1); g.fillRect(-2, -R - 6, 4, 7);
            g.fillStyle(0xbe185d, 1); g.fillRect(-5, -R - 7, 10, 3);
          } else if (type === "choco") {
            g.fillStyle(0x78350f, 1); g.fillRoundedRect(-R, -R * 0.65, R * 2, R * 1.3, 5);
            for (let row = 0; row < 2; row++)
              for (let col = 0; col < 3; col++) {
                g.fillStyle(0xfef3c7, 0.35);
                g.fillRect(
                  -R + 3 + col * ((R * 2 - 6) / 3),
                  -R * 0.65 + 3 + row * ((R * 1.3 - 6) / 2),
                  (R * 2 - 6) / 3 - 2,
                  (R * 1.3 - 6) / 2 - 2
                );
              }
          } else if (type === "donut") {
            g.fillStyle(0xd97706, 1); g.fillCircle(0, 0, R);
            g.fillStyle(0xfff8e7, 1); g.fillCircle(0, 0, R * 0.4);
            g.fillStyle(0xfb7185, 0.9);
            g.slice(0, 0, R * 0.75, Math.PI * 0.15, Math.PI * 1.1, false);
            g.fillPath();
          } else if (type === "cookie") {
            g.fillStyle(0xca8a04, 1); g.fillCircle(0, 0, R);
            g.fillStyle(0x92400e, 1);
            [[-5, -5], [4, -6], [0, 4], [-4, 7], [6, 2]].forEach(([cx, cy]) =>
              g.fillCircle(cx, cy, 2.5)
            );
            g.lineStyle(1, 0x92400e, 0.4); g.strokeCircle(0, 0, R);
          } else if (type === "ice") {
            g.fillStyle(0xfde68a, 1);
            g.fillTriangle(-R * 0.72, -R * 0.1, R * 0.72, -R * 0.1, 0, R + 5);
            g.lineStyle(1, 0xd97706, 0.5);
            g.lineBetween(-R * 0.36, -R * 0.1, 0, R + 3);
            g.lineBetween(R * 0.36, -R * 0.1, 0, R + 3);
            g.fillStyle(0xfb7185, 1); g.fillCircle(0, -R * 0.45, R * 0.88);
            g.fillStyle(0xffffff, 0.38); g.fillCircle(-R * 0.24, -R * 0.7, R * 0.28);
          } else if (type === "pepper") {
            g.fillStyle(0x16a34a, 1); g.fillEllipse(0, R * 0.12, R * 1.3, R * 1.8);
            g.fillStyle(0x15803d, 1); g.fillRect(-2, -R, 4, R * 0.7);
            g.fillStyle(0x4ade80, 0.45); g.fillEllipse(-R * 0.2, 0, R * 0.38, R * 0.78);
          } else if (type === "broccoli") {
            g.fillStyle(0x15803d, 1); g.fillRect(-4, R * 0.1, 8, R * 0.88);
            g.fillStyle(0x4ade80, 1);
            [[-7, -4], [7, -4], [0, -9], [-4, 0], [4, 0]].forEach(([cx, cy]) =>
              g.fillCircle(cx, cy, 9)
            );
            g.fillStyle(0x86efac, 0.5);
            [[-7, -4], [7, -4], [0, -9]].forEach(([cx, cy]) =>
              g.fillCircle(cx - 2, cy - 2, 3.5)
            );
          }
        }

        setTarget1(x: number) { tgt1 = Math.max(MIN_X, Math.min(MAX_X, x)); }
        setTarget2(x: number) { tgt2 = Math.max(MIN_X, Math.min(MAX_X, x)); }

        startGame(m: Mode) {
          mode = m; phase = "playing";
          s1 = 0; s2 = 0; t = GAME_SECS; winner = 0;
          b1x = W / 3; b2x = (W * 2) / 3;
          tgt1 = W / 3; tgt2 = (W * 2) / 3;
          this.clearItems();
          idCnt = 0; spawnT = 650; spawnI = 900;
          cpuDelay = 0; cpuTgt = W * 0.65;
          push();
        }

        resetGame() {
          phase = "menu";
          this.clearItems();
          s1 = 0; s2 = 0; t = GAME_SECS; winner = 0;
          b1x = W / 3; b2x = (W * 2) / 3;
          tgt1 = W / 3; tgt2 = (W * 2) / 3;
          this.drawBaskets();
          push();
        }
      }

      const scene = new Scene();
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width: W, height: H,
        parent: mountRef.current,
        backgroundColor: "#fff8e7",
        scene,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      });

      ctrlRef.current = {
        setT1: (x) => scene.setTarget1(x),
        setT2: (x) => scene.setTarget2(x),
        start: (m) => scene.startGame(m),
        reset: () => scene.resetGame(),
        destroy: () => game.destroy(true),
      };
    };

    run();
    return () => {
      cancelled = true;
      ctrlRef.current?.destroy();
      ctrlRef.current = null;
    };
  }, []);

  // ── タッチ・マウス入力 ────────────────────────────────────────────────────────
  const handleTouch = (e: React.TouchEvent) => {
    if (!mountRef.current || snap.phase !== "playing") return;
    e.preventDefault();
    const bounds = mountRef.current.getBoundingClientRect();
    const scaleX = W / bounds.width;
    Array.from(e.touches).forEach((touch) => {
      const x = (touch.clientX - bounds.left) * scaleX;
      if (snap.mode === "cpu") {
        ctrlRef.current?.setT1(x);
      } else {
        if (x < W / 2) ctrlRef.current?.setT1(x);
        else ctrlRef.current?.setT2(x);
      }
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!mountRef.current || snap.phase !== "playing" || e.pointerType === "touch") return;
    const bounds = mountRef.current.getBoundingClientRect();
    const x = ((e.clientX - bounds.left) / bounds.width) * W;
    if (snap.mode === "cpu") {
      ctrlRef.current?.setT1(x);
    } else {
      if (x < W / 2) ctrlRef.current?.setT1(x);
      else ctrlRef.current?.setT2(x);
    }
  };

  // ── UI ───────────────────────────────────────────────────────────────────────
  const cpuLabel = snap.mode === "cpu" ? "CPU" : "P2";

  return (
    <section className="prototype-shell">
      <div className="play-panel card" style={{ padding: 0 }}>
        <div className="canvas-shell" style={{ position: "relative" }}>
          <div ref={mountRef} className="phaser-mount" />

          {/* 入力キャプチャ層（プレイ中のみ） */}
          {snap.phase === "playing" && (
            <div
              style={{ position: "absolute", inset: 0, zIndex: 5, touchAction: "none" }}
              onPointerMove={handlePointerMove}
              onTouchStart={handleTouch}
              onTouchMove={handleTouch}
            />
          )}

          {/* スコア・タイマー HUD */}
          {snap.phase === "playing" && (
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, zIndex: 6,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 16px", pointerEvents: "none",
            }}>
              <div style={{ fontWeight: 800, color: "#1d4ed8", fontSize: "1.3rem",
                textShadow: "0 1px 4px rgba(255,255,255,0.8)" }}>
                P1: {snap.s1}
              </div>
              <div style={{ fontWeight: 700, color: snap.t <= 10 ? "#ef4444" : "#78350f",
                fontSize: "1.1rem", textShadow: "0 1px 4px rgba(255,255,255,0.8)" }}>
                ⏱ {snap.t}s
              </div>
              <div style={{ fontWeight: 800, color: "#991b1b", fontSize: "1.3rem",
                textShadow: "0 1px 4px rgba(255,255,255,0.8)" }}>
                {cpuLabel}: {snap.s2}
              </div>
            </div>
          )}

          {/* メニュー */}
          {snap.phase === "menu" && (
            <div className="result-overlay" style={{ background: "rgba(255,248,231,0.97)", gap: 16 }}>
              <strong style={{ fontSize: "1.6rem", color: "#92400e" }}>🍬 おかし落とし</strong>
              <div style={{ fontSize: "0.82rem", color: "#78350f", textAlign: "center", lineHeight: 1.7 }}>
                落ちてくるおかしをかごでキャッチ！<br />
                🥦ピーマン・ブロッコリーは‒5点<br />
                <strong>P1: A/Dキー　P2: ←/→キー</strong><br />
                スマホ: 画面の左右をタッチ
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  style={{ background: "#3b82f6", color: "white", border: "none",
                    padding: "12px 22px", borderRadius: 12, fontSize: "0.95rem",
                    fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  onClick={() => ctrlRef.current?.start("cpu")}
                >
                  🤖 1人プレイ（CPU対戦）
                </button>
                <button
                  style={{ background: "#22c55e", color: "white", border: "none",
                    padding: "12px 22px", borderRadius: 12, fontSize: "0.95rem",
                    fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  onClick={() => ctrlRef.current?.start("vs")}
                >
                  👨‍👧 2人プレイ
                </button>
              </div>
            </div>
          )}

          {/* リザルト */}
          {snap.phase === "result" && (
            <div className="result-overlay" style={{ gap: 14 }}>
              <strong style={{ fontSize: "1.5rem" }}>
                {snap.winner === 1
                  ? "🎉 P1の勝ち！"
                  : snap.winner === 2
                    ? snap.mode === "cpu" ? "🤖 CPUの勝ち！" : "🎉 P2の勝ち！"
                    : "🤝 引き分け！"}
              </strong>
              <div style={{ display: "flex", gap: 24, fontSize: "1.15rem" }}>
                <span style={{ color: "#1d4ed8", fontWeight: 700 }}>P1: {snap.s1}</span>
                <span style={{ color: "#991b1b", fontWeight: 700 }}>{cpuLabel}: {snap.s2}</span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  style={{ background: "#3b82f6", color: "white", border: "none",
                    padding: "11px 22px", borderRadius: 12, fontSize: "0.92rem",
                    fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  onClick={() => ctrlRef.current?.start(snap.mode)}
                >
                  もう一度
                </button>
                <button
                  style={{ background: "transparent", color: "#78350f",
                    border: "2px solid #d97706", padding: "11px 22px",
                    borderRadius: 12, fontSize: "0.92rem", fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit" }}
                  onClick={() => ctrlRef.current?.reset()}
                >
                  メニューへ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
