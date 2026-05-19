"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FrogSnapshot = {
  phase: "ready" | "playing" | "failed";
  score: number;
  bestScore: number;
  jumps: number;
};

type FrogController = {
  jump: () => void;
  resetRound: () => void;
  destroy: () => void;
};

const initialSnapshot: FrogSnapshot = {
  phase: "ready",
  score: 0,
  bestScore: 0,
  jumps: 0
};

export function FrogHopPrototype() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<FrogController | null>(null);
  const [snapshot, setSnapshot] = useState<FrogSnapshot>(initialSnapshot);
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
      const height = 340;
      const groundY = 278;
      const runSpeed = 4.6;

      class FrogHopScene extends Phaser.Scene {
        private frog?: Phaser.Physics.Arcade.Image;
        private obstacles?: Phaser.Physics.Arcade.Group;
        private phase: FrogSnapshot["phase"] = "ready";
        private score = 0;
        private bestScore = 0;
        private jumps = 0;
        private spawnTimer = 0;
        private lastTick = 0;
        private cloudA?: Phaser.GameObjects.Ellipse;
        private cloudB?: Phaser.GameObjects.Ellipse;
        private hillA?: Phaser.GameObjects.Ellipse;
        private hillB?: Phaser.GameObjects.Ellipse;

        constructor() {
          super("frog-hop-scene");
        }

        preload() {
          this.load.image("frog-runner-main", "/assets/frog/frog.png");
        }

        create() {
          this.add.rectangle(width / 2, height / 2, width, height, 0xe0f2fe).setDepth(-20);
          this.cloudA = this.add.ellipse(84, 70, 116, 48, 0xffffff, 0.74).setDepth(-18);
          this.cloudB = this.add.ellipse(326, 94, 130, 54, 0xffffff, 0.62).setDepth(-18);
          this.add.rectangle(width / 2, 224, width, 124, 0xa7f3d0).setDepth(-17);
          this.hillA = this.add.ellipse(90, 244, 210, 88, 0x86efac, 1).setDepth(-16);
          this.hillB = this.add.ellipse(318, 236, 230, 100, 0x4ade80, 0.86).setDepth(-15);

          const groundVisual = this.add.rectangle(width / 2, groundY + 26, width, 52, 0x8b5a2b).setDepth(-9);
          this.add.rectangle(width / 2, groundY + 2, width, 14, 0x65a30d).setDepth(-8);
          this.add.rectangle(width / 2, groundY + 10, width, 6, 0x84cc16, 0.88).setDepth(-8);
          for (let i = 0; i < 10; i += 1) {
            this.add.circle(20 + i * 42, groundY + 30, 9, 0x6b4423, 0.3).setDepth(-8);
          }
          this.physics.add.existing(groundVisual, true);
          const ground = groundVisual as Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.StaticBody };

          this.frog = this.physics.add.image(92, groundY - 18, "frog-runner-main");
          this.frog.setDisplaySize(64, 64);
          this.frog.setCollideWorldBounds(true);
          this.frog.setGravityY(980);
          this.frog.setDepth(8);

          this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });

          this.physics.add.collider(this.frog, ground);
          this.physics.add.collider(this.obstacles, ground);
          this.physics.add.overlap(this.frog, this.obstacles, () => {
            if (this.phase !== "failed") {
              this.bestScore = Math.max(this.bestScore, Math.floor(this.score));
              this.phase = "failed";
              this.pushSnapshot();
              this.physics.pause();
            }
          });

          this.pushSnapshot();
        }

        jump() {
          if (!this.frog || this.phase === "failed") {
            return;
          }

          if (this.phase === "ready") {
            this.phase = "playing";
          }

          const body = this.frog.body as Phaser.Physics.Arcade.Body | undefined;
          if (!body?.blocked.down) {
            return;
          }

          this.frog.setVelocityY(-430);
          this.jumps += 1;
          this.pushSnapshot();
        }

        resetRound() {
          this.phase = "ready";
          this.score = 0;
          this.jumps = 0;
          this.spawnTimer = 0;
          this.lastTick = 0;
          this.physics.resume();
          this.obstacles?.clear(true, true);

          if (this.frog) {
            this.frog.setPosition(92, groundY - 18);
            this.frog.setVelocity(0, 0);
            this.frog.setRotation(0);
          }

          this.pushSnapshot();
        }

        update(time: number, delta: number) {
          if (this.cloudA) {
            this.cloudA.x -= 0.16;
            if (this.cloudA.x < -60) this.cloudA.x = width + 60;
          }
          if (this.cloudB) {
            this.cloudB.x -= 0.11;
            if (this.cloudB.x < -60) this.cloudB.x = width + 60;
          }
          if (this.hillA) {
            this.hillA.x -= 0.18;
            if (this.hillA.x < -120) this.hillA.x = width + 120;
          }
          if (this.hillB) {
            this.hillB.x -= 0.28;
            if (this.hillB.x < -140) this.hillB.x = width + 140;
          }

          if (this.phase !== "playing" || !this.frog || !this.obstacles) {
            return;
          }

          const deltaSec = delta / 1000;
          this.score += deltaSec * 60;
          this.spawnTimer -= delta;

          if (this.spawnTimer <= 0) {
            this.spawnObstacle();
            this.spawnTimer = Phaser.Math.Between(1180, 1560);
          }

          const frogBody = this.frog.body as Phaser.Physics.Arcade.Body;
          if (!frogBody.blocked.down) {
            this.frog.setRotation(Math.min(0.12, frogBody.velocity.y / 2600));
          } else {
            this.frog.setRotation(0);
          }

          this.obstacles.getChildren().forEach((child) => {
            const obstacle = child as Phaser.Physics.Arcade.Image;
            obstacle.x -= runSpeed;
            if (obstacle.x < -60) obstacle.destroy();
          });

          if (time - this.lastTick > 120) {
            this.lastTick = time;
            this.pushSnapshot();
          }
        }

        private spawnObstacle() {
          if (!this.obstacles) return;
          const obstacleType = Phaser.Math.Between(0, 2);
          const texture = this.createObstacleTexture(obstacleType);
          const obstacle = this.obstacles.create(474, groundY - 14, texture) as Phaser.Physics.Arcade.Image;
          obstacle.setImmovable(true);
          obstacle.setDepth(7);
        }

        private createObstacleTexture(type: number) {
          const key = `frog-obstacle-${type}`;
          if (this.textures.exists(key)) return key;

          const g = this.make.graphics({ x: 0, y: 0 }, false);
          if (type === 0) {
            g.fillStyle(0x16a34a, 1);
            g.fillRoundedRect(8, 10, 24, 44, 12);
            g.fillStyle(0x15803d, 1);
            g.fillCircle(20, 10, 10);
          } else if (type === 1) {
            g.fillStyle(0xfb923c, 1);
            g.fillTriangle(6, 56, 22, 8, 38, 56);
            g.fillStyle(0xf97316, 1);
            g.fillTriangle(14, 56, 28, 20, 42, 56);
          } else {
            g.fillStyle(0x7c3aed, 1);
            g.fillRoundedRect(6, 20, 40, 32, 14);
            g.fillStyle(0xc4b5fd, 0.8);
            g.fillCircle(18, 28, 6);
            g.fillCircle(34, 38, 6);
          }
          g.generateTexture(key, 52, 60);
          g.destroy();
          return key;
        }

        private pushSnapshot() {
          setSnapshot({
            phase: this.phase,
            score: Math.floor(this.score),
            bestScore: this.bestScore,
            jumps: this.jumps
          });
        }
      }

      const scene = new FrogHopScene();
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width,
        height,
        parent: mountRef.current,
        backgroundColor: "#e0f2fe",
        scene,
        physics: {
          default: "arcade",
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
          }
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH
        }
      });

      controllerRef.current = {
        jump: () => scene.jump(),
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
    if (snapshot.phase === "ready") return "タップでジャンプ";
    if (snapshot.phase === "failed") return "ゲームオーバー";
    return "ぴょんぴょん中";
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
            <span>現在得点</span>
            <strong>{snapshot.score}</strong>
          </div>
          <div>
            <span>ジャンプ</span>
            <strong>{snapshot.jumps}回</strong>
          </div>
          <div>
            <span>障害物</span>
            <strong>一定速</strong>
          </div>
        </div>
      </div>

      <div className="play-panel card runner-shell">
        <div className="canvas-shell tap-enabled">
          <div ref={mountRef} className="phaser-mount" />
          <button
            aria-label="ジャンプする"
            className="tap-surface"
            onPointerDown={(event) => {
              event.preventDefault();
              controllerRef.current?.jump();
            }}
          />
          {snapshot.phase === "failed" ? (
            <div className="result-overlay fail">
              <strong>ゲームオーバー</strong>
              <span>もう一回遊ぶならリセット</span>
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
