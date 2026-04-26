"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type GameSnapshot = {
  phase: "ready" | "playing" | "failed";
  cratesPlaced: number;
  score: number;
  bestScore: number;
  towerHeight: number;
  tapX: number | null;
};

type SceneController = {
  dropCrateAt: (pointerX: number) => void;
  resetRound: () => void;
  destroy: () => void;
};

const initialSnapshot: GameSnapshot = {
  phase: "ready",
  cratesPlaced: 0,
  score: 0,
  bestScore: 0,
  towerHeight: 0,
  tapX: null
};

export function PhaserTowerPrototype() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SceneController | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !mountRef.current) {
      return;
    }

    let cancelled = false;

    const setup = async () => {
      const PhaserModule = await import("phaser");
      const Phaser = PhaserModule.default ?? PhaserModule;

      if (cancelled || !mountRef.current) {
        return;
      }

      const width = 420;
      const height = 640;
      const colors = [0xf59e0b, 0x0ea5e9, 0xef4444, 0x22c55e, 0x8b5cf6, 0xf97316];
      const dropMinX = 92;
      const dropMaxX = 328;
      const platformLeft = 119;
      const platformRight = 301;

      class TowerScene extends Phaser.Scene {
        private cratesPlaced = 0;
        private highestTop = 528;
        private phase: GameSnapshot["phase"] = "ready";
        private crates: Phaser.Physics.Matter.Image[] = [];
        private laneGuide?: Phaser.GameObjects.Graphics;
        private score = 0;
        private bestScore = 0;
        private lastTapX: number | null = null;

        constructor() {
          super("tower-scene");
        }

        create() {
          this.matter.world.setBounds(0, 0, width, height);
          this.matter.world.setGravity(0, 1.05);

          this.add
            .rectangle(width / 2, height / 2, width, height, 0xfff7ed)
            .setDepth(-10);
          this.add
            .ellipse(74, 88, 120, 60, 0xffffff, 0.65)
            .setDepth(-9);
          this.add
            .ellipse(334, 122, 140, 56, 0xffffff, 0.52)
            .setDepth(-9);
          this.add
            .rectangle(width / 2, 586, width, 108, 0xfed7aa)
            .setDepth(-8);

          this.add
            .text(24, 22, "Phaser + Matter.js Prototype", {
              fontFamily: "Arial",
              fontSize: "18px",
              color: "#9a3412"
            })
            .setDepth(20);

          this.add
            .text(24, 48, "画面をタップした位置から荷物を落とす", {
              fontFamily: "Arial",
              fontSize: "14px",
              color: "#7c2d12"
            })
            .setDepth(20);

          this.matter.add.rectangle(width / 2, 626, width, 36, {
            isStatic: true,
            friction: 0.9
          });

          this.matter.add.rectangle(width / 2, 546, 182, 18, {
            isStatic: true,
            chamfer: { radius: 8 },
            friction: 0.95
          });

          this.add.rectangle(width / 2, 546, 182, 18, 0x475569, 1).setDepth(5);
          this.add.circle(138, 586, 28, 0x334155).setDepth(4);
          this.add.circle(282, 586, 28, 0x334155).setDepth(4);
          this.add.circle(138, 586, 12, 0x94a3b8).setDepth(5);
          this.add.circle(282, 586, 12, 0x94a3b8).setDepth(5);

          this.laneGuide = this.add.graphics();
          this.drawDropGuide(width / 2);
          this.pushSnapshot();
        }

        dropCrateAt(pointerX: number) {
          if (this.phase === "failed") {
            return;
          }

          if (this.phase === "ready") {
            this.phase = "playing";
          }

          const id = this.cratesPlaced + 1;
          const bodyWidth = 48 + ((id * 19) % 34);
          const bodyHeight = 28 + ((id * 13) % 22);
          const x = Phaser.Math.Clamp(pointerX, dropMinX, dropMaxX);
          const color = colors[id % colors.length];
          const centerGap = (x - width / 2) / (dropMaxX - dropMinX);
          const tiltKick = centerGap * 0.09;

          const crate = this.add.rectangle(x, 126, bodyWidth, bodyHeight, color, 1);
          crate.setStrokeStyle(2, 0xffffff, 0.38);

          const body = this.matter.add.gameObject(crate, {
            restitution: 0.05,
            friction: 0.9,
            frictionAir: 0.018,
            density: 0.0022
          }) as Phaser.Physics.Matter.Image;

          body.setAngle(Phaser.Math.FloatBetween(-8, 8));
          body.setVelocity(Phaser.Math.FloatBetween(-0.4, 0.4), 0);
          body.setAngularVelocity(tiltKick);

          this.crates.push(body);
          this.cratesPlaced += 1;
          this.lastTapX = Math.round(x);
          this.drawDropGuide(x);
          this.pushSnapshot();
        }

        resetRound() {
          this.crates.forEach((crate) => crate.destroy());
          this.crates = [];
          this.cratesPlaced = 0;
          this.highestTop = 528;
          this.phase = "ready";
          this.score = 0;
          this.lastTapX = null;
          this.drawDropGuide(width / 2);
          this.pushSnapshot();
        }

        update() {
          if (this.phase !== "playing") {
            return;
          }

          let maxTilt = 0;
          let highestTop = 528;
          let failed = false;

          this.crates = this.crates.filter((crate) => crate.active);

          for (const crate of this.crates) {
            maxTilt = Math.max(maxTilt, Math.abs(crate.rotation));
            highestTop = Math.min(highestTop, crate.y - crate.displayHeight / 2);

            const bottomEdge = crate.y + crate.displayHeight / 2;
            const centerX = crate.x;

            if (bottomEdge > 610 || centerX < platformLeft || centerX > platformRight) {
              failed = true;
            }
          }

          this.highestTop = highestTop;
          const towerHeight = Math.max(0, Math.round(546 - highestTop));
          const stabilityBonus = Math.max(0, Math.round((1.25 - maxTilt) * 110));
          this.score = this.cratesPlaced * 100 + towerHeight * 2 + stabilityBonus;
          this.bestScore = Math.max(this.bestScore, this.score);

          if (failed) {
            this.phase = "failed";
          }

          this.pushSnapshot(towerHeight);
        }

        private drawDropGuide(pointerX: number) {
          if (!this.laneGuide) {
            return;
          }

          this.laneGuide.clear();

          const x = Phaser.Math.Clamp(pointerX, dropMinX, dropMaxX);
          this.laneGuide.lineStyle(3, 0xfb923c, 0.32);
          this.laneGuide.strokeLineShape(new Phaser.Geom.Line(x, 74, x, 504));
          this.laneGuide.fillStyle(0xfb923c, 0.22);
          this.laneGuide.fillCircle(x, 86, 14);
        }

        private pushSnapshot(towerHeight = Math.max(0, Math.round(546 - this.highestTop))) {
          const nextSnapshot: GameSnapshot = {
            phase: this.phase,
            cratesPlaced: this.cratesPlaced,
            score: this.score,
            bestScore: this.bestScore,
            towerHeight,
            tapX: this.lastTapX
          };

          setSnapshot(nextSnapshot);
        }
      }

      const scene = new TowerScene();

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width,
        height,
        parent: mountRef.current,
        backgroundColor: "#fff7ed",
        scene,
        physics: {
          default: "matter",
          matter: {
            gravity: { x: 0, y: 1.05 },
            debug: false
          }
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH
        }
      });

      controllerRef.current = {
        dropCrateAt: (pointerX) => scene.dropCrateAt(pointerX),
        resetRound: () => scene.resetRound(),
        destroy: () => game.destroy(true)
      };
    };

    setup();

    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [isMounted]);

  const summaryText = useMemo(() => {
    if (snapshot.phase === "ready") {
      return "タップでスタート";
    }

    if (snapshot.phase === "failed") {
      return "荷崩れ";
    }

    return "配達中";
  }, [snapshot.phase]);

  return (
    <section className="prototype-shell">
      <div className="status-panel card">
        <div className={`phase-chip phase-${snapshot.phase}`}>{summaryText}</div>

        <div className="status-grid">
          <div>
            <span>最高得点</span>
            <strong>{snapshot.bestScore}</strong>
          </div>
          <div>
            <span>荷物</span>
            <strong>{snapshot.cratesPlaced}個</strong>
          </div>
          <div>
            <span>塔の高さ</span>
            <strong>{snapshot.towerHeight}px</strong>
          </div>
          <div>
            <span>位置</span>
            <strong>{snapshot.tapX ?? "-"}</strong>
          </div>
        </div>

        <div className="score-card">
          <span>スコア</span>
          <strong>{snapshot.score}</strong>
        </div>
      </div>

      <div className="play-panel card">
        <div
          className="canvas-shell tap-enabled"
          onClick={(event) => {
            if (!mountRef.current) {
              return;
            }

            const bounds = mountRef.current.getBoundingClientRect();
            const pointerX = ((event.clientX - bounds.left) / bounds.width) * 420;
            controllerRef.current?.dropCrateAt(pointerX);
          }}
        >
          <div ref={mountRef} className="phaser-mount" />
          {snapshot.phase === "failed" ? (
            <div className="result-overlay fail">
              <strong>荷崩れ</strong>
              <span>タップで置き方を変えよう</span>
            </div>
          ) : null}
        </div>

        <div className="controls">
          <button className="wide ghost" onClick={() => controllerRef.current?.resetRound()}>
            リセット
          </button>
        </div>
      </div>
    </section>
  );
}
