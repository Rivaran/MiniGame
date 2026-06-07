"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type GameSnapshot = {
  phase: "ready" | "playing" | "result";
  score: number;
  bestScore: number;
  combo: number;
  maxCombo: number;
  timeLeft: number;
};

type GameController = {
  onTap: () => void;
  restart: () => void;
  destroy: () => void;
};

const initialSnapshot: GameSnapshot = {
  phase: "ready",
  score: 0,
  bestScore: 0,
  combo: 0,
  maxCombo: 0,
  timeLeft: 30,
};

export function KageFumiPrototype() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<GameController | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !mountRef.current) return;
    let cancelled = false;

    const setup = async () => {
      const PhaserModule = await import("phaser");
      const Phaser = PhaserModule.default ?? PhaserModule;
      if (cancelled || !mountRef.current) return;

      const W = 420;
      const H = 280;
      const GROUND_Y = 198;
      const STEP_X = 72;
      const PERFECT_R = 9;
      const GOOD_R = 22;
      const GAME_SEC = 30;

      class KageFumiScene extends Phaser.Scene {
        private phase: GameSnapshot["phase"] = "ready";
        private score = 0;
        private bestScore = 0;
        private combo = 0;
        private maxCombo = 0;
        private timeLeft = GAME_SEC;
        private elapsed = 0;

        private shadows: { x: number; w: number; judged: boolean; speed: number }[] = [];
        private spawnCd = 0;

        private judgeLabel = "";
        private judgeTtl = 0;
        private judgeColor = 0xffffff;
        private footTtl = 0;
        private stepAnim = 0; // 0 = standing, 1 = step left, 2 = step right

        // Graphics
        private cloudA?: Phaser.GameObjects.Ellipse;
        private cloudB?: Phaser.GameObjects.Ellipse;
        private hillA?: Phaser.GameObjects.Ellipse;
        private hillB?: Phaser.GameObjects.Ellipse;
        private gShadows!: Phaser.GameObjects.Graphics;
        private gZone!: Phaser.GameObjects.Graphics;
        private gFoot!: Phaser.GameObjects.Graphics;
        private gPlayer!: Phaser.GameObjects.Graphics;
        private tJudge!: Phaser.GameObjects.Text;
        private tCombo!: Phaser.GameObjects.Text;

        constructor() {
          super("kage-fumi-scene");
        }

        create() {
          // Sky
          this.add.rectangle(W / 2, GROUND_Y / 2, W, GROUND_Y, 0xcce8ff).setDepth(-20);

          // Clouds
          this.cloudA = this.add.ellipse(100, 46, 120, 40, 0xffffff, 0.80).setDepth(-18);
          this.cloudB = this.add.ellipse(320, 30, 150, 46, 0xffffff, 0.70).setDepth(-18);

          // Hills (behind ground)
          this.hillA = this.add.ellipse(110, GROUND_Y + 18, 200, 80, 0xa8d5a2).setDepth(-13);
          this.hillB = this.add.ellipse(340, GROUND_Y + 8, 240, 92, 0x86bf86).setDepth(-12);

          // Ground
          this.add.rectangle(W / 2, GROUND_Y + (H - GROUND_Y) / 2, W, H - GROUND_Y, 0x7bcf6e).setDepth(-10);
          this.add.rectangle(W / 2, GROUND_Y + 4, W, 8, 0x95d98a).setDepth(-9);

          // Dynamic graphics
          this.gShadows = this.add.graphics().setDepth(2);
          this.gZone    = this.add.graphics().setDepth(4);
          this.gFoot    = this.add.graphics().setDepth(6);
          this.gPlayer  = this.add.graphics().setDepth(8);

          // Judge text
          this.tJudge = this.add.text(STEP_X, GROUND_Y - 30, "", {
            fontFamily: "'Yu Gothic UI', sans-serif",
            fontSize: "20px",
            fontStyle: "bold",
            color: "#ffffff",
            stroke: "#2d3748",
            strokeThickness: 4,
          }).setOrigin(0.5, 1).setDepth(20).setAlpha(0);

          // Combo text
          this.tCombo = this.add.text(W - 12, 12, "", {
            fontFamily: "'Yu Gothic UI', sans-serif",
            fontSize: "15px",
            fontStyle: "bold",
            color: "#ffd700",
            stroke: "#2d3748",
            strokeThickness: 3,
          }).setOrigin(1, 0).setDepth(20).setAlpha(0);

          this.drawZone();
          this.drawPlayer(false);
          this.pushSnapshot();
        }

        onTap() {
          if (this.phase === "ready" || this.phase === "result") {
            this.startGame();
          } else {
            this.doStep();
          }
        }

        restart() {
          this.startGame();
        }

        private startGame() {
          this.phase = "playing";
          this.score = 0;
          this.combo = 0;
          this.maxCombo = 0;
          this.timeLeft = GAME_SEC;
          this.elapsed = 0;
          this.shadows = [];
          this.spawnCd = 500;
          this.judgeTtl = 0;
          this.footTtl = 0;
          this.pushSnapshot();
        }

        private doStep() {
          const inRange = this.shadows
            .filter(s => !s.judged && Math.abs(s.x - STEP_X) < GOOD_R + s.w / 2)
            .sort((a, b) => Math.abs(a.x - STEP_X) - Math.abs(b.x - STEP_X));

          if (inRange.length === 0) {
            this.combo = 0;
            this.showJudge("MISS", 0xe53e3e);
            this.pushSnapshot();
            return;
          }

          const s = inRange[0];
          s.judged = true;
          const dist = Math.abs(s.x - STEP_X);

          if (dist <= PERFECT_R) {
            const pts = 10 + this.combo * 2;
            this.score += pts;
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.showJudge("PERFECT!", 0x48d368);
          } else {
            const pts = 5 + this.combo;
            this.score += pts;
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.showJudge("GOOD", 0x63b3ed);
          }

          this.footTtl = 320;
          this.stepAnim = Phaser.Math.Between(1, 2);
          this.pushSnapshot();
        }

        private showJudge(text: string, color: number) {
          this.judgeLabel = text;
          this.judgeColor = color;
          this.judgeTtl = 720;
        }

        update(_t: number, delta: number) {
          // Scroll background
          if (this.cloudA) { this.cloudA.x -= 0.14; if (this.cloudA.x < -80) this.cloudA.x = W + 80; }
          if (this.cloudB) { this.cloudB.x -= 0.10; if (this.cloudB.x < -90) this.cloudB.x = W + 90; }
          if (this.hillA)  { this.hillA.x  -= 0.22; if (this.hillA.x  < -120) this.hillA.x  = W + 120; }
          if (this.hillB)  { this.hillB.x  -= 0.34; if (this.hillB.x  < -130) this.hillB.x  = W + 130; }

          if (this.phase === "playing") {
            this.elapsed += delta;
            this.timeLeft = Math.max(0, GAME_SEC - Math.floor(this.elapsed / 1000));

            if (this.timeLeft <= 0) {
              this.phase = "result";
              this.bestScore = Math.max(this.bestScore, this.score);
              this.pushSnapshot();
            } else {
              this.tick(delta);
            }
          }

          // Timers
          if (this.judgeTtl > 0) this.judgeTtl = Math.max(0, this.judgeTtl - delta);
          if (this.footTtl > 0) {
            this.footTtl = Math.max(0, this.footTtl - delta);
            if (this.footTtl === 0) this.stepAnim = 0;
          }

          this.drawShadows();
          this.drawZone();
          this.drawPlayer(this.footTtl > 0);
          this.drawFoot();
          this.updateTexts();
        }

        private tick(delta: number) {
          this.spawnCd -= delta;
          if (this.spawnCd <= 0) {
            const speed = 2.1 + Math.min(1.6, this.elapsed / 22000);
            this.shadows.push({
              x: W + 44,
              w: Phaser.Math.Between(46, 74),
              judged: false,
              speed,
            });
            this.spawnCd = Phaser.Math.Between(1100, 1750);
          }

          for (const s of this.shadows) {
            s.x -= s.speed;
          }

          this.shadows = this.shadows.filter(s => {
            if (s.x < -60) {
              if (!s.judged) {
                this.combo = 0;
                this.showJudge("MISS", 0xe53e3e);
                this.pushSnapshot();
              }
              return false;
            }
            return true;
          });
        }

        private drawShadows() {
          const g = this.gShadows;
          g.clear();

          for (const s of this.shadows) {
            // Walking character silhouette (above ground)
            const cx = s.x + 8;
            const charY = GROUND_Y - 32;
            g.fillStyle(0x4a5568, 0.82);
            g.fillCircle(cx, charY - 20, 8);           // head
            g.fillRoundedRect(cx - 5, charY - 13, 10, 20, 3); // body
            // Animated legs
            const legOff = Math.sin((s.x / 14)) * 5;
            g.fillRect(cx - 5, charY + 6, 4, 12 + legOff);
            g.fillRect(cx + 1, charY + 6, 4, 12 - legOff);

            // Shadow ellipse on ground
            const dist = Math.abs(s.x - STEP_X);
            const inRange = dist < GOOD_R + s.w / 2;
            const alpha = s.judged ? 0.12 : (inRange ? 0.80 : 0.55);
            g.fillStyle(0x1a202c, alpha);
            g.fillEllipse(s.x, GROUND_Y + 7, s.w, 16);
          }
        }

        private drawZone() {
          const g = this.gZone;
          g.clear();
          const golden = this.combo >= 5;
          const lineColor = golden ? 0xffd700 : 0xffffff;
          const fillAlpha = golden ? 0.28 : 0.18;
          g.lineStyle(3, lineColor, 0.9);
          g.strokeEllipse(STEP_X, GROUND_Y + 7, 60, 20);
          g.fillStyle(lineColor, fillAlpha);
          g.fillEllipse(STEP_X, GROUND_Y + 7, 60, 20);
        }

        private drawPlayer(stepping: boolean) {
          const g = this.gPlayer;
          g.clear();
          const charY = GROUND_Y - 32;
          // Orange player character
          g.fillStyle(0xf97316, 1);
          g.fillCircle(STEP_X, charY - 20, 9);              // head
          g.fillRoundedRect(STEP_X - 6, charY - 12, 12, 22, 3); // body
          if (stepping && this.stepAnim === 1) {
            // Left foot down
            g.fillRect(STEP_X - 7, charY + 9, 5, 14);
            g.fillRect(STEP_X + 2, charY + 9, 5, 9);
          } else if (stepping && this.stepAnim === 2) {
            // Right foot down
            g.fillRect(STEP_X - 7, charY + 9, 5, 9);
            g.fillRect(STEP_X + 2, charY + 9, 5, 14);
          } else {
            g.fillRect(STEP_X - 7, charY + 9, 5, 12);
            g.fillRect(STEP_X + 2, charY + 9, 5, 12);
          }
        }

        private drawFoot() {
          const g = this.gFoot;
          g.clear();
          if (this.footTtl > 0) {
            const a = (this.footTtl / 320) * 0.85;
            g.fillStyle(0xff6b35, a);
            g.fillEllipse(STEP_X, GROUND_Y + 7, 58, 18);
          }
        }

        private updateTexts() {
          // Judge text
          if (this.judgeTtl > 0) {
            this.tJudge.setAlpha(Math.min(1, this.judgeTtl / 160));
            const c = "#" + this.judgeColor.toString(16).padStart(6, "0");
            this.tJudge.setColor(c);
            this.tJudge.setText(this.judgeLabel);
          } else {
            this.tJudge.setAlpha(0);
          }

          // Combo text
          if (this.combo >= 3) {
            this.tCombo.setText(`${this.combo} COMBO`);
            this.tCombo.setAlpha(1);
          } else {
            this.tCombo.setAlpha(0);
          }
        }

        private pushSnapshot() {
          setSnapshot({
            phase: this.phase,
            score: this.score,
            bestScore: this.bestScore,
            combo: this.combo,
            maxCombo: this.maxCombo,
            timeLeft: this.timeLeft,
          });
        }
      }

      const scene = new KageFumiScene();
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width: W,
        height: H,
        parent: mountRef.current,
        backgroundColor: "#cce8ff",
        scene,
        physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      });

      controllerRef.current = {
        onTap: () => scene.onTap(),
        restart: () => scene.restart(),
        destroy: () => game.destroy(true),
      };
    };

    setup();

    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [isMounted]);

  const chipClass = snapshot.phase === "result" ? "phase-cleared" : `phase-${snapshot.phase}`;
  const summaryText = useMemo(() => {
    if (snapshot.phase === "ready") return "タップでスタート";
    if (snapshot.phase === "result") return "ゲーム終了";
    return `残り ${snapshot.timeLeft}秒`;
  }, [snapshot.phase, snapshot.timeLeft]);

  return (
    <section className="prototype-shell">
      <div className="status-panel card">
        <div className={`phase-chip ${chipClass}`}>{summaryText}</div>

        <div className="status-grid">
          <div>
            <span>スコア</span>
            <strong>{snapshot.score}</strong>
          </div>
          <div>
            <span>最高スコア</span>
            <strong>{snapshot.bestScore}</strong>
          </div>
          <div>
            <span>コンボ</span>
            <strong>{snapshot.combo}連</strong>
          </div>
          <div>
            <span>最大コンボ</span>
            <strong>{snapshot.maxCombo}連</strong>
          </div>
        </div>
      </div>

      <div className="play-panel card kage-shell">
        <div className="canvas-shell tap-enabled">
          <div ref={mountRef} className="phaser-mount" />
          <button
            aria-label="影を踏む"
            className="tap-surface"
            onPointerDown={(e) => {
              e.preventDefault();
              controllerRef.current?.onTap();
            }}
          />
          {snapshot.phase === "ready" && (
            <div className="result-overlay clear">
              <strong>影ふみリズム</strong>
              <span>タップして影を踏もう！</span>
            </div>
          )}
          {snapshot.phase === "result" && (
            <div className="result-overlay clear">
              <strong>{snapshot.score}点</strong>
              <span>最大コンボ {snapshot.maxCombo}連！</span>
            </div>
          )}
        </div>

        <div className="controls">
          <button className="wide ghost" onClick={() => controllerRef.current?.restart()}>
            {snapshot.phase === "playing" ? "リスタート" : "もう一度"}
          </button>
        </div>
      </div>
    </section>
  );
}
