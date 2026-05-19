"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FutonSnapshot = {
  phase: "ready" | "playing" | "failed";
  blanketsPlaced: number;
  score: number;
  bestScore: number;
  towerHeight: number;
  tapX: number | null;
};

type FutonController = {
  dropFutonAt: (pointerX: number) => void;
  resetRound: () => void;
  destroy: () => void;
};

const initialSnapshot: FutonSnapshot = {
  phase: "ready",
  blanketsPlaced: 0,
  score: 0,
  bestScore: 0,
  towerHeight: 0,
  tapX: null
};

export function FutonStackPrototype() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<FutonController | null>(null);
  const [snapshot, setSnapshot] = useState<FutonSnapshot>(initialSnapshot);
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
      const dropMinX = 98;
      const dropMaxX = 322;
      const bedLeft = 118;
      const bedRight = 302;
      const catLeft = { x: 50, y: 528, radius: 24 };
      const catRight = { x: 370, y: 528, radius: 24 };
      const futonColors = [0xfde68a, 0xf9a8d4, 0xbfdbfe, 0xbbf7d0, 0xfdba74];

      class FutonScene extends Phaser.Scene {
        private blanketsPlaced = 0;
        private highestTop = 502;
        private phase: FutonSnapshot["phase"] = "ready";
        private futons: Phaser.Physics.Matter.Image[] = [];
        private guide?: Phaser.GameObjects.Graphics;
        private score = 0;
        private bestScore = 0;
        private lastTapX: number | null = null;

        constructor() {
          super("futon-stack-scene");
        }

        preload() {
          this.load.image("sleeping-person", "/assets/futon/sleeping-person.png");
          this.load.image("sleeping-cat", "/assets/futon/sleeping-cat.png");
        }

        create() {
          this.matter.world.setBounds(0, 0, width, height);
          this.matter.world.setGravity(0, 0.95);

          this.add.rectangle(width / 2, height / 2, width, height, 0xfffbeb).setDepth(-10);
          this.add.rectangle(width / 2, 592, width, 96, 0xf5d0a1).setDepth(-9);
          this.add.ellipse(86, 92, 120, 52, 0xffffff, 0.72).setDepth(-8);
          this.add.ellipse(328, 112, 128, 48, 0xffffff, 0.52).setDepth(-8);

          this.matter.add.rectangle(width / 2, 620, width, 40, {
            isStatic: true,
            friction: 1
          });

          this.matter.add.rectangle(width / 2, 534, 160, 14, {
            isStatic: true,
            chamfer: { radius: 6 },
            friction: 0.98
          });

          this.add.image(width / 2, 528, "sleeping-person").setDisplaySize(206, 206).setDepth(1);
          this.add.image(catLeft.x, catLeft.y, "sleeping-cat").setDisplaySize(74, 74).setDepth(1);
          this.add.image(catRight.x, catRight.y, "sleeping-cat").setDisplaySize(74, 74).setDepth(1);

          this.guide = this.add.graphics();
          this.drawGuide(width / 2);
          this.pushSnapshot();
        }

        dropFutonAt(pointerX: number) {
          if (this.phase === "failed") {
            return;
          }

          if (this.phase === "ready") {
            this.phase = "playing";
          }

          const id = this.blanketsPlaced + 1;
          const bodyWidth = 108 + ((id * 11) % 24);
          const bodyHeight = 18 + ((id * 7) % 10);
          const x = Phaser.Math.Clamp(pointerX, dropMinX, dropMaxX);
          const color = futonColors[id % futonColors.length];
          const centerGap = (x - width / 2) / (dropMaxX - dropMinX);
          const textureKey = this.createFutonTexture(id, bodyWidth, bodyHeight, color);
          const body = this.matter.add.image(x, 120, textureKey, undefined, {
            restitution: 0.04,
            friction: 0.94,
            frictionAir: 0.02,
            density: 0.0016
          });

          body.setAngle(Phaser.Math.FloatBetween(-4, 4));
          body.setVelocity(Phaser.Math.FloatBetween(-0.35, 0.35), 0);
          body.setAngularVelocity(centerGap * 0.08);
          body.setDepth(4);

          this.futons.push(body);
          this.blanketsPlaced += 1;
          this.lastTapX = Math.round(x);
          this.drawGuide(x);
          this.pushSnapshot();
        }

        resetRound() {
          this.futons.forEach((futon) => futon.destroy());
          this.futons = [];
          this.blanketsPlaced = 0;
          this.highestTop = 502;
          this.phase = "ready";
          this.score = 0;
          this.lastTapX = null;
          this.drawGuide(width / 2);
          this.pushSnapshot();
        }

        update() {
          if (this.phase !== "playing") {
            return;
          }

          let highestTop = 502;
          let failed = false;

          this.futons = this.futons.filter((futon) => futon.active);

          for (const futon of this.futons) {
            highestTop = Math.min(highestTop, futon.y - futon.displayHeight / 2);

            const bottomEdge = futon.y + futon.displayHeight / 2;
            const centerX = futon.x;
            const overlapsLeftCat =
              Phaser.Math.Distance.Between(centerX, futon.y, catLeft.x, catLeft.y) < catLeft.radius + 40;
            const overlapsRightCat =
              Phaser.Math.Distance.Between(centerX, futon.y, catRight.x, catRight.y) < catRight.radius + 40;

            if (
              bottomEdge > 610 ||
              centerX < bedLeft ||
              centerX > bedRight ||
              overlapsLeftCat ||
              overlapsRightCat
            ) {
              failed = true;
            }
          }

          this.highestTop = highestTop;
          const towerHeight = Math.max(0, Math.round(534 - highestTop));
          this.score = this.blanketsPlaced * 120 + towerHeight * 3;

          if (failed) {
            this.bestScore = Math.max(this.bestScore, this.score);
            this.phase = "failed";
          }

          this.pushSnapshot(towerHeight);
        }

        private drawGuide(pointerX: number) {
          if (!this.guide) {
            return;
          }

          this.guide.clear();
          const x = Phaser.Math.Clamp(pointerX, dropMinX, dropMaxX);
          this.guide.lineStyle(3, 0xf59e0b, 0.28);
          this.guide.strokeLineShape(new Phaser.Geom.Line(x, 74, x, 476));
          this.guide.fillStyle(0xf59e0b, 0.2);
          this.guide.fillCircle(x, 90, 14);
        }

        private createFutonTexture(id: number, bodyWidth: number, bodyHeight: number, color: number) {
          const key = `futon-${id}-${bodyWidth}-${bodyHeight}-${color}`;

          if (this.textures.exists(key)) {
            return key;
          }

          const graphics = this.make.graphics({ x: 0, y: 0 }, false);
          const w = bodyWidth;
          const h = bodyHeight;
          const radius = Math.min(18, h / 2);

          graphics.fillStyle(color, 1);
          graphics.fillRoundedRect(0, 0, w, h, radius);
          graphics.fillStyle(0xffffff, 0.28);
          graphics.fillRoundedRect(8, 4, w - 16, Math.max(5, h * 0.34), radius / 1.8);
          graphics.lineStyle(2, 0xffffff, 0.5);
          graphics.strokeRoundedRect(1, 1, w - 2, h - 2, radius);
          graphics.lineStyle(2, 0xffffff, 0.18);
          graphics.strokeLineShape(new Phaser.Geom.Line(18, h / 2, w - 18, h / 2));
          graphics.lineStyle(1, 0xffffff, 0.14);
          graphics.strokeLineShape(new Phaser.Geom.Line(w * 0.24, 4, w * 0.24, h - 4));
          graphics.strokeLineShape(new Phaser.Geom.Line(w * 0.5, 4, w * 0.5, h - 4));
          graphics.strokeLineShape(new Phaser.Geom.Line(w * 0.76, 4, w * 0.76, h - 4));
          graphics.generateTexture(key, w, h);
          graphics.destroy();

          return key;
        }

        private pushSnapshot(towerHeight = Math.max(0, Math.round(534 - this.highestTop))) {
          setSnapshot({
            phase: this.phase,
            blanketsPlaced: this.blanketsPlaced,
            score: this.score,
            bestScore: this.bestScore,
            towerHeight,
            tapX: this.lastTapX
          });
        }
      }

      const scene = new FutonScene();

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width,
        height,
        parent: mountRef.current,
        backgroundColor: "#fffbeb",
        scene,
        physics: {
          default: "matter",
          matter: {
            gravity: { x: 0, y: 0.95 },
            debug: false
          }
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH
        }
      });

      controllerRef.current = {
        dropFutonAt: (pointerX) => scene.dropFutonAt(pointerX),
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
      return "タップでふとんをのせる";
    }

    if (snapshot.phase === "failed") {
      return "起きちゃった";
    }

    return "すやすや中";
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
            <span>ふとん</span>
            <strong>{snapshot.blanketsPlaced}枚</strong>
          </div>
          <div>
            <span>高さ</span>
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
        <div className="canvas-shell tap-enabled">
          <div ref={mountRef} className="phaser-mount" />
          <button
            aria-label="ふとんを落とす"
            className="tap-surface"
            onPointerDown={(event) => {
              if (!mountRef.current) {
                return;
              }

              event.preventDefault();
              const bounds = mountRef.current.getBoundingClientRect();
              const pointerX = ((event.clientX - bounds.left) / bounds.width) * 420;
              controllerRef.current?.dropFutonAt(pointerX);
            }}
          />
          {snapshot.phase === "failed" ? (
            <div className="result-overlay fail">
              <strong>起きちゃった</strong>
              <span>猫に当てずにふわっと積もう</span>
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
