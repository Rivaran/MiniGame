"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

type GameSnapshot = {
  phase: "ready" | "playing" | "failed";
  cratesPlaced: number;
  score: number;
  bestScore: number;
  towerHeight: number;
  tapX: number | null;
  nextHint: string;
  nextKind: CargoKind;
  nextColor: number;
};

type SceneController = {
  dropCrateAt: (pointerX: number) => void;
  resetRound: () => void;
  destroy: () => void;
};

type CargoKind = "crate" | "wide" | "tall" | "square" | "barrel" | "heavy-barrel";

type CargoBody = Phaser.Physics.Matter.Image & {
  cargoKind?: CargoKind;
};

const CARGO_COLORS = [0xf59e0b, 0x0ea5e9, 0xef4444, 0x22c55e, 0x8b5cf6, 0xf97316];

const CARGO_SIZES: Record<CargoKind, { width: number; height: number; radius: number }> = {
  crate: { width: 58, height: 30, radius: 10 },
  wide: { width: 74, height: 24, radius: 8 },
  tall: { width: 34, height: 54, radius: 10 },
  square: { width: 42, height: 42, radius: 10 },
  barrel: { width: 48, height: 48, radius: 999 },
  "heavy-barrel": { width: 60, height: 60, radius: 999 }
};

function getCargoColor(cratesPlaced: number) {
  const nextId = cratesPlaced + 1;
  return CARGO_COLORS[nextId % CARGO_COLORS.length];
}

function toCssColor(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function getCargoPreviewStyle(kind: CargoKind, color: number): CSSProperties {
  const size = CARGO_SIZES[kind];
  const baseColor = toCssColor(color);

  return {
    width: size.width,
    height: size.height,
    borderRadius: size.radius,
    background: `linear-gradient(180deg, ${baseColor}, ${baseColor})`
  };
}

const initialSnapshot: GameSnapshot = {
  phase: "ready",
  cratesPlaced: 0,
  score: 0,
  bestScore: 0,
  towerHeight: 0,
  tapX: null,
  nextHint: "?",
  nextKind: "square",
  nextColor: getCargoColor(0)
};

export function PhaserTowerPrototype() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SceneController | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot);
  const [isMounted, setIsMounted] = useState(false);
  const nextCargoClass = `cargo-${snapshot.nextKind}`;
  const nextCargoStyle = getCargoPreviewStyle(snapshot.nextKind, snapshot.nextColor);

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
      const height = 470;
      const dropMinX = 78;
      const dropMaxX = 342;
      const platformLeft = 78;
      const platformRight = 342;
      const platformWidth = platformRight - platformLeft;

      class TowerScene extends Phaser.Scene {
        private cratesPlaced = 0;
        private highestTop = 368;
        private phase: GameSnapshot["phase"] = "ready";
        private crates: CargoBody[] = [];
        private laneGuide?: Phaser.GameObjects.Graphics;
        private score = 0;
        private bestScore = 0;
        private lastTapX: number | null = null;
        private nextCargo: CargoKind = "crate";
        private lastDropAt = -1000;

        constructor() {
          super("tower-scene");
        }

        create() {
          this.matter.world.setBounds(0, 0, width, height);
          this.matter.world.setGravity(0, 1.05);

          this.add.rectangle(width / 2, height / 2, width, height, 0xfff7ed).setDepth(-10);
          this.add.ellipse(74, 88, 120, 60, 0xffffff, 0.65).setDepth(-9);
          this.add.ellipse(334, 122, 140, 56, 0xffffff, 0.52).setDepth(-9);
          this.add.rectangle(width / 2, 426, width, 96, 0xfed7aa).setDepth(-8);

          this.matter.add.rectangle(width / 2, 456, width, 30, {
            isStatic: true,
            friction: 0.9
          });

          this.matter.add.rectangle(width / 2, 386, platformWidth, 18, {
            isStatic: true,
            chamfer: { radius: 8 },
            friction: 0.95
          });

          this.add.rectangle(width / 2, 386, platformWidth, 18, 0x475569, 1).setDepth(5);
          this.add.circle(118, 426, 28, 0x334155).setDepth(4);
          this.add.circle(302, 426, 28, 0x334155).setDepth(4);
          this.add.circle(118, 426, 12, 0x94a3b8).setDepth(5);
          this.add.circle(302, 426, 12, 0x94a3b8).setDepth(5);

          this.laneGuide = this.add.graphics();
          this.nextCargo = this.pickNextCargo();
          this.drawDropGuide(width / 2);
          this.pushSnapshot();
        }

        dropCrateAt(pointerX: number) {
          if (this.phase === "failed" || !this.canDrop()) {
            return;
          }

          if (this.phase === "ready") {
            this.phase = "playing";
          }

          const id = this.cratesPlaced + 1;
          const kind = this.nextCargo;
          const x = Phaser.Math.Clamp(pointerX, dropMinX, dropMaxX);
          const color = getCargoColor(this.cratesPlaced);
          const centerGap = (x - width / 2) / (dropMaxX - dropMinX);
          const tiltKick = centerGap * 0.09;
          const cargo = this.createCargo(kind, x, color, tiltKick);

          this.crates.push(cargo);
          this.cratesPlaced += 1;
          this.lastTapX = Math.round(x);
          this.lastDropAt = this.getNow();
          this.nextCargo = this.pickNextCargo();
          this.drawDropGuide(x);
          this.pushSnapshot();
        }

        resetRound() {
          this.crates.forEach((crate) => crate.destroy());
          this.crates = [];
          this.cratesPlaced = 0;
          this.highestTop = 368;
          this.phase = "ready";
          this.score = 0;
          this.lastTapX = null;
          this.lastDropAt = -1000;
          this.nextCargo = this.pickNextCargo();
          this.drawDropGuide(width / 2);
          this.pushSnapshot();
        }

        update() {
          if (this.phase !== "playing") {
            return;
          }

          let highestTop = 528;
          let failed = false;
          let wobblePenalty = 0;

          this.crates = this.crates.filter((crate) => crate.active);

          for (const crate of this.crates) {
            const displayHalfHeight = crate.displayHeight / 2;
            const displayHalfWidth = crate.displayWidth / 2;
            highestTop = Math.min(highestTop, crate.y - displayHalfHeight);

            const bottomEdge = crate.y + displayHalfHeight;
            const centerX = crate.x;
            const isCircular = crate.cargoKind === "barrel" || crate.cargoKind === "heavy-barrel";
            const horizontalPadding = isCircular ? displayHalfWidth * 0.22 : displayHalfWidth * 0.14;

            if (
              bottomEdge > 450 ||
              centerX - horizontalPadding < platformLeft ||
              centerX + horizontalPadding > platformRight
            ) {
              failed = true;
            }

            const angularVelocity = crate.body ? Math.abs((crate.body as { angularVelocity?: number }).angularVelocity ?? 0) : 0;
            wobblePenalty += Math.min(90, angularVelocity * 180);
          }

          this.highestTop = highestTop;
          const towerHeight = Math.max(0, Math.round(386 - highestTop));
          const stabilityBonus = Math.max(0, Math.round(120 - wobblePenalty));
          this.score = Math.max(0, this.cratesPlaced * 95 + towerHeight * 2 + stabilityBonus);

          if (failed) {
            this.bestScore = Math.max(this.bestScore, this.score);
            this.phase = "failed";
          }

          this.pushSnapshot(towerHeight);
        }

        private canDrop() {
          if (this.getNow() - this.lastDropAt < 320) {
            return false;
          }

          return this.crates.every((crate) => {
            const velocityY = crate.body ? Math.abs((crate.body as { velocity?: { y?: number } }).velocity?.y ?? 0) : 0;
            return crate.y > 126 && velocityY < 7;
          });
        }

        private getNow() {
          return this.game?.loop?.time ?? performance.now();
        }

        private pickNextCargo(): CargoKind {
          const roll = Phaser.Math.Between(1, 100);
          if (roll <= 28) return "crate";
          if (roll <= 50) return "wide";
          if (roll <= 68) return "tall";
          if (roll <= 84) return "square";
          if (roll <= 95) return "barrel";
          return "heavy-barrel";
        }

        private createCargo(kind: CargoKind, x: number, color: number, tiltKick: number) {
          const spawnY = 92;
          const commonOptions = {
            restitution: 0.05,
            friction: 0.9,
            frictionAir: 0.018,
            density: kind === "heavy-barrel" ? 0.0036 : 0.0022
          };

          let cargo: CargoBody;

          if (kind === "barrel" || kind === "heavy-barrel") {
            const radius = kind === "heavy-barrel" ? 30 : 24;
            const textureKey = this.createRoundCargoTexture(kind, radius, color);
            cargo = this.matter.add.image(x, spawnY, textureKey, undefined, commonOptions) as CargoBody;
            cargo.setCircle(radius);
            cargo.setDisplaySize(radius * 2, radius * 2);
          } else {
            const sizeMap: Record<Exclude<CargoKind, "barrel" | "heavy-barrel">, { width: number; height: number }> = {
              crate: { width: 58, height: 30 },
              wide: { width: 74, height: 24 },
              tall: { width: 34, height: 54 },
              square: { width: 42, height: 42 }
            };
            const size = sizeMap[kind];
            const textureKey = this.createBoxCargoTexture(kind, size.width, size.height, color);
            cargo = this.matter.add.image(x, spawnY, textureKey, undefined, commonOptions) as CargoBody;
            cargo.setDisplaySize(size.width, size.height);
          }

          cargo.cargoKind = kind;
          cargo.setAngle(Phaser.Math.FloatBetween(-8, 8));
          cargo.setVelocity(Phaser.Math.FloatBetween(-0.4, 0.4), 0);
          cargo.setAngularVelocity(tiltKick + Phaser.Math.FloatBetween(-0.012, 0.012));
          cargo.setDepth(6);
          return cargo;
        }

        private createBoxCargoTexture(kind: Exclude<CargoKind, "barrel" | "heavy-barrel">, bodyWidth: number, bodyHeight: number, color: number) {
          const key = `tower-${kind}-${bodyWidth}-${bodyHeight}-${color.toString(16)}`;
          if (this.textures.exists(key)) {
            return key;
          }

          const g = this.make.graphics({ x: 0, y: 0 }, false);
          g.fillStyle(color, 1);
          g.fillRoundedRect(0, 0, bodyWidth, bodyHeight, Math.min(12, bodyHeight / 3));
          g.fillStyle(0xffffff, 0.16);
          g.fillRoundedRect(4, 4, bodyWidth - 8, Math.max(8, bodyHeight * 0.28), Math.min(8, bodyHeight / 4));
          g.lineStyle(2, 0xffffff, 0.28);
          if (kind === "wide") {
            g.strokeLineShape(new Phaser.Geom.Line(10, bodyHeight / 2, bodyWidth - 10, bodyHeight / 2));
          } else if (kind === "tall") {
            g.strokeLineShape(new Phaser.Geom.Line(bodyWidth / 2, 8, bodyWidth / 2, bodyHeight - 8));
          } else if (kind === "square") {
            g.strokeRect(6, 6, bodyWidth - 12, bodyHeight - 12);
          } else {
            g.strokeLineShape(new Phaser.Geom.Line(8, 8, bodyWidth - 8, bodyHeight - 8));
            g.strokeLineShape(new Phaser.Geom.Line(8, bodyHeight - 8, bodyWidth - 8, 8));
          }
          g.generateTexture(key, bodyWidth, bodyHeight);
          g.destroy();
          return key;
        }

        private createRoundCargoTexture(kind: CargoKind, radius: number, color: number) {
          const size = radius * 2;
          const key = `tower-${kind}-${radius}-${color.toString(16)}`;
          if (this.textures.exists(key)) {
            return key;
          }

          const g = this.make.graphics({ x: 0, y: 0 }, false);
          g.fillStyle(color, 1);
          g.fillCircle(radius, radius, radius);
          g.fillStyle(0xffffff, 0.18);
          g.fillCircle(radius - radius * 0.28, radius - radius * 0.3, radius * 0.35);
          g.lineStyle(3, 0xffffff, 0.22);
          if (kind === "heavy-barrel") {
            g.strokeCircle(radius, radius, radius * 0.58);
            g.strokeCircle(radius, radius, radius * 0.32);
          } else {
            g.strokeLineShape(new Phaser.Geom.Line(radius, 8, radius, size - 8));
            g.strokeLineShape(new Phaser.Geom.Line(8, radius, size - 8, radius));
          }
          g.generateTexture(key, size, size);
          g.destroy();
          return key;
        }

        private drawDropGuide(pointerX: number) {
          if (!this.laneGuide) {
            return;
          }

          this.laneGuide.clear();

          const x = Phaser.Math.Clamp(pointerX, dropMinX, dropMaxX);
          this.laneGuide.lineStyle(3, 0xfb923c, 0.32);
          this.laneGuide.strokeLineShape(new Phaser.Geom.Line(x, 52, x, 344));
          this.laneGuide.fillStyle(0xfb923c, 0.22);
          this.laneGuide.fillCircle(x, 64, 14);
        }

        private cargoLabel(kind: CargoKind) {
          switch (kind) {
            case "wide":
              return "なが箱";
            case "tall":
              return "たて箱";
            case "square":
              return "箱";
            case "barrel":
              return "丸荷物";
            case "heavy-barrel":
              return "大玉";
            default:
              return "木箱";
          }
        }

        private pushSnapshot(towerHeight = Math.max(0, Math.round(386 - this.highestTop))) {
          const nextSnapshot: GameSnapshot = {
            phase: this.phase,
            cratesPlaced: this.cratesPlaced,
            score: this.score,
            bestScore: this.bestScore,
            towerHeight,
            tapX: this.lastTapX,
            nextHint: this.cargoLabel(this.nextCargo),
            nextKind: this.nextCargo,
            nextColor: getCargoColor(this.cratesPlaced)
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

    return "慎重に配達中";
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
          <div className="next-cargo-card">
            <span>次の荷物</span>
            <div className="next-cargo-preview" aria-label={`次の荷物: ${snapshot.nextHint}`}>
              <span className={`cargo-preview ${nextCargoClass}`} style={nextCargoStyle} aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="score-card">
          <span>スコア</span>
          <strong>{snapshot.score}</strong>
        </div>
      </div>

      <div className="play-panel card tower-shell">
        <div className="canvas-shell tap-enabled">
          <div className="canvas-next-cargo" aria-label={`次の荷物: ${snapshot.nextHint}`}>
            <span className={`cargo-preview ${nextCargoClass}`} style={nextCargoStyle} aria-hidden="true" />
          </div>
          <div ref={mountRef} className="phaser-mount" />
          <button
            aria-label="荷物を落とす"
            className="tap-surface"
            onPointerDown={(event) => {
              if (!mountRef.current) {
                return;
              }

              event.preventDefault();
              const bounds = mountRef.current.getBoundingClientRect();
              const pointerX = ((event.clientX - bounds.left) / bounds.width) * 420;
              controllerRef.current?.dropCrateAt(pointerX);
            }}
          />
          {snapshot.phase === "failed" ? (
            <div className="result-overlay fail">
              <strong>荷崩れ</strong>
              <span>丸い荷物はころがりやすい</span>
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
