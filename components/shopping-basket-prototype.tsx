"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type IngredientKey = "meat" | "onion" | "potato" | "carrot" | "roux" | "apple" | "milk" | "fish";

type BasketSnapshot = {
  phase: "ready" | "playing" | "cleared" | "failed";
  failReason: "overflow" | null;
  score: number;
  bestScore: number;
  collected: Record<IngredientKey, number>;
  target: Record<IngredientKey, number>;
  misses: number;
  basketCount: number;
  capacity: number;
};

type BasketController = {
  moveTo: (pointerX: number) => void;
  resetRound: () => void;
  destroy: () => void;
};

type IngredientBody = Phaser.Physics.Matter.Image & {
  ingredient?: IngredientKey;
  counted?: boolean;
  insideSince?: number | null;
};

const recipeTarget: Record<IngredientKey, number> = {
  meat: 2,
  onion: 2,
  potato: 2,
  carrot: 1,
  roux: 1,
  apple: 0,
  milk: 0,
  fish: 0
};

const ingredientLabels: Record<IngredientKey, string> = {
  meat: "肉",
  onion: "玉ねぎ",
  potato: "じゃがいも",
  carrot: "にんじん",
  roux: "カレールー",
  apple: "りんご",
  milk: "牛乳",
  fish: "おさかな"
};

const initialCollected = (): Record<IngredientKey, number> => ({
  meat: 0,
  onion: 0,
  potato: 0,
  carrot: 0,
  roux: 0,
  apple: 0,
  milk: 0,
  fish: 0
});

const basketCapacity = 12;

const initialSnapshot: BasketSnapshot = {
  phase: "ready",
  failReason: null,
  score: 0,
  bestScore: 0,
  collected: initialCollected(),
  target: recipeTarget,
  misses: 0,
  basketCount: 0,
  capacity: basketCapacity
};

export function ShoppingBasketPrototype() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<BasketController | null>(null);
  const [snapshot, setSnapshot] = useState<BasketSnapshot>(initialSnapshot);
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
      const height = 560;
      const floorY = 510;
      const MatterBody = ((Phaser as unknown as { Physics?: { Matter?: { Matter?: { Body?: { setPosition: Function } } } } }).Physics?.Matter?.Matter?.Body ?? null) as { setPosition: (body: MatterJS.BodyType, position: { x: number; y: number }) => void } | null;
      const ingredientOrder: IngredientKey[] = [
        "meat",
        "onion",
        "potato",
        "carrot",
        "roux",
        "apple",
        "milk",
        "fish"
      ];
      const goodIngredients = new Set<IngredientKey>(["meat", "onion", "potato", "carrot", "roux"]);

      class ShoppingBasketScene extends Phaser.Scene {
        private items: IngredientBody[] = [];
        private phase: BasketSnapshot["phase"] = "ready";
        private score = 0;
        private bestScore = 0;
        private collected = initialCollected();
        private misses = 0;
        private spawnTimer = 0;
        private failReason: BasketSnapshot["failReason"] = null;
        private basketX = width / 2;
        private targetBasketX = width / 2;
        private basketLeftWall?: MatterJS.BodyType;
        private basketRightWall?: MatterJS.BodyType;
        private basketBottom?: MatterJS.BodyType;
        private basketVisual?: Phaser.GameObjects.Container;
        private basketInnerLeft = 118;
        private basketInnerRight = 302;
        private basketInnerTop = 392;
        private basketInnerBottom = 472;
        private basketCount = 0;

        constructor() {
          super("shopping-basket-scene");
        }

        create() {
          this.matter.world.setBounds(0, 0, width, height);
          this.matter.world.setGravity(0, 1.06);

          this.add.rectangle(width / 2, height / 2, width, height, 0xfffbeb).setDepth(-20);
          this.add.rectangle(width / 2, 410, width, 300, 0xfef3c7).setDepth(-19);
          this.add.ellipse(88, 82, 120, 52, 0xffffff, 0.74).setDepth(-18);
          this.add.ellipse(332, 118, 128, 48, 0xffffff, 0.6).setDepth(-18);
          this.add.rectangle(width / 2, floorY + 20, width, 82, 0xf59e0b).setDepth(-10);
          this.add.rectangle(width / 2, floorY - 6, width, 16, 0xd97706).setDepth(-9);

          this.matter.add.rectangle(width / 2, floorY + 28, width, 26, {
            isStatic: true,
            friction: 0.8
          });

          this.createBasket();
          this.pushSnapshot();
        }

        moveTo(pointerX: number) {
          if (this.phase === "failed" || this.phase === "cleared") return;
          if (this.phase === "ready") this.phase = "playing";
          this.targetBasketX = Phaser.Math.Clamp(pointerX, 120, width - 120);
        }

        resetRound() {
          this.phase = "ready";
          this.score = 0;
          this.collected = initialCollected();
          this.misses = 0;
          this.spawnTimer = 0;
          this.failReason = null;
          this.targetBasketX = width / 2;
          this.basketX = width / 2;
          this.basketCount = 0;
          this.items.forEach((item) => item.destroy());
          this.items = [];
          this.syncBasketPosition(true);
          this.pushSnapshot();
        }

        update(_: number, delta: number) {
          this.syncBasketPosition(false);

          if (this.phase !== "playing") {
            return;
          }

          this.spawnTimer -= delta;
          if (this.spawnTimer <= 0) {
            this.spawnIngredient();
            this.spawnTimer = Phaser.Math.Between(720, 1180);
          }

          this.items = this.items.filter((item) => item.active);

          for (const item of this.items) {
            this.evaluateIngredient(item);
          }

          this.pushSnapshot();
        }

        private createBasket() {
          const wallThickness = 16;
          const innerWidth = 184;
          const innerHeight = 80;
          const outerWidth = innerWidth + wallThickness * 2;
          const outerHeight = innerHeight + 44;
          const x = this.basketX;
          const y = 430;

          this.basketInnerLeft = x - innerWidth / 2;
          this.basketInnerRight = x + innerWidth / 2;
          this.basketInnerTop = y - 38;
          this.basketInnerBottom = y + 42;

          this.basketBottom = this.matter.add.rectangle(x, y + 42, outerWidth, wallThickness, {
            isStatic: true,
            friction: 0.88,
            restitution: 0.08
          }) as MatterJS.BodyType;
          this.basketLeftWall = this.matter.add.rectangle(x - innerWidth / 2 - wallThickness / 2, y + 4, wallThickness, innerHeight, {
            isStatic: true,
            friction: 0.88,
            restitution: 0.08
          }) as MatterJS.BodyType;
          this.basketRightWall = this.matter.add.rectangle(x + innerWidth / 2 + wallThickness / 2, y + 4, wallThickness, innerHeight, {
            isStatic: true,
            friction: 0.88,
            restitution: 0.08
          }) as MatterJS.BodyType;

          const base = this.add.rectangle(0, 42, outerWidth, 24, 0x92400e).setOrigin(0.5);
          const leftWall = this.add.rectangle(-innerWidth / 2 - 6, 2, wallThickness + 8, innerHeight + 18, 0xb45309).setOrigin(0.5);
          const rightWall = this.add.rectangle(innerWidth / 2 + 6, 2, wallThickness + 8, innerHeight + 18, 0xb45309).setOrigin(0.5);
          const lip = this.add.rectangle(0, -34, outerWidth - 18, 12, 0xd97706).setOrigin(0.5);
          const shadow = this.add.rectangle(0, 14, innerWidth, innerHeight, 0x78350f, 0.18).setOrigin(0.5);
          const label = this.add.text(0, -2, "かご", {
            fontFamily: '"Yu Gothic UI", sans-serif',
            fontSize: "18px",
            color: "#fff7ed"
          }).setOrigin(0.5);

          this.basketVisual = this.add.container(x, y, [shadow, leftWall, rightWall, base, lip, label]);
          this.basketVisual.setDepth(10);
        }

        private syncBasketPosition(force: boolean) {
          const lerp = force ? 1 : 0.24;
          this.basketX = Phaser.Math.Linear(this.basketX, this.targetBasketX, lerp);
          const x = this.basketX;
          const y = 430;
          const innerWidth = 184;
          const wallThickness = 16;

          this.basketInnerLeft = x - innerWidth / 2;
          this.basketInnerRight = x + innerWidth / 2;
          this.basketInnerTop = y - 38;
          this.basketInnerBottom = y + 42;

          if (this.basketBottom) MatterBody?.setPosition(this.basketBottom, { x, y: y + 42 });
          if (this.basketLeftWall) MatterBody?.setPosition(this.basketLeftWall, { x: x - innerWidth / 2 - wallThickness / 2, y: y + 4 });
          if (this.basketRightWall) MatterBody?.setPosition(this.basketRightWall, { x: x + innerWidth / 2 + wallThickness / 2, y: y + 4 });
          this.basketVisual?.setPosition(x, y);
        }

        private spawnIngredient() {
          const ingredient = ingredientOrder[Phaser.Math.Between(0, ingredientOrder.length - 1)];
          const x = Phaser.Math.Between(42, width - 42);
          const texture = this.createIngredientTexture(ingredient);
          const item = this.matter.add.image(x, -28, texture, undefined, {
            restitution: 0.18,
            friction: 0.5,
            frictionAir: 0.012,
            density: ingredient === "potato" ? 0.0027 : 0.0021
          }) as IngredientBody;
          item.ingredient = ingredient;
          item.counted = false;
          item.insideSince = null;
          item.setDepth(7);

          if (ingredient === "onion" || ingredient === "apple") {
            item.setCircle(18);
            item.setDisplaySize(36, 36);
          } else if (ingredient === "potato") {
            item.setCircle(20);
            item.setDisplaySize(40, 34);
          } else if (ingredient === "fish") {
            item.setBody({ type: "rectangle", width: 42, height: 22 });
            item.setDisplaySize(44, 24);
          } else if (ingredient === "carrot") {
            item.setBody({ type: "rectangle", width: 40, height: 18 });
            item.setDisplaySize(44, 22);
          } else {
            item.setBody({ type: "rectangle", width: 34, height: 28 });
            item.setDisplaySize(38, 32);
          }

          item.setAngle(Phaser.Math.FloatBetween(-10, 10));
          item.setAngularVelocity(Phaser.Math.FloatBetween(-0.02, 0.02));
          this.items.push(item);
        }

        private evaluateIngredient(item: IngredientBody) {
          if (!item.active || !item.ingredient) return;

          if (item.y > floorY + 34) {
            item.destroy();
            this.misses += 1;
            return;
          }

          const insideHorizontal = item.x > this.basketInnerLeft + 8 && item.x < this.basketInnerRight - 8;
          const insideVertical = item.y > this.basketInnerTop && item.y < this.basketInnerBottom;
          const velocity = item.body ? ((item.body as { velocity?: { x?: number; y?: number } }).velocity ?? {}) : {};
          const speed = Math.hypot(velocity.x ?? 0, velocity.y ?? 0);
          const settled = speed < 1.55;

          if (insideHorizontal && insideVertical && settled) {
            if (item.insideSince == null) {
              item.insideSince = this.time.now;
            }
          } else {
            item.insideSince = null;
          }

          if (!item.counted && item.insideSince != null && this.time.now - item.insideSince > 220) {
            this.countIngredient(item);
          }
        }

        private countIngredient(item: IngredientBody) {
          if (!item.ingredient || item.counted) return;
          item.counted = true;
          const ingredient = item.ingredient;
          this.basketCount += 1;

          if (goodIngredients.has(ingredient)) {
            this.collected[ingredient] += 1;
            this.score += this.collected[ingredient] <= recipeTarget[ingredient] ? 100 : 20;
          } else {
            this.score = Math.max(0, this.score - 60);
          }

          if (this.basketCount >= basketCapacity && !this.hasClearedRecipe()) {
            this.finishAsFailed("overflow");
            return;
          }

          if (this.hasClearedRecipe()) {
            this.phase = "cleared";
            this.bestScore = Math.max(this.bestScore, this.score);
          }
        }

        private hasClearedRecipe() {
          return (["meat", "onion", "potato", "carrot", "roux"] as IngredientKey[]).every((key) => {
            return this.collected[key] >= recipeTarget[key];
          });
        }

        private finishAsFailed(reason: BasketSnapshot["failReason"]) {
          this.phase = "failed";
          this.failReason = reason;
          this.bestScore = Math.max(this.bestScore, this.score);
        }

        private createIngredientTexture(ingredient: IngredientKey) {
          const key = `ingredient-${ingredient}`;
          if (this.textures.exists(key)) return key;

          const g = this.make.graphics({ x: 0, y: 0 }, false);
          if (ingredient === "meat") {
            g.fillStyle(0xef4444, 1);
            g.fillRoundedRect(8, 12, 44, 30, 14);
            g.fillStyle(0xfca5a5, 0.8);
            g.fillCircle(24, 26, 8);
          } else if (ingredient === "onion") {
            g.fillStyle(0xf5f3ff, 1);
            g.fillCircle(30, 28, 20);
            g.fillStyle(0xa78bfa, 0.3);
            g.fillCircle(30, 28, 12);
          } else if (ingredient === "potato") {
            g.fillStyle(0xd6b47d, 1);
            g.fillEllipse(30, 28, 40, 30);
          } else if (ingredient === "carrot") {
            g.fillStyle(0xf97316, 1);
            g.fillTriangle(10, 14, 46, 28, 10, 42);
            g.fillStyle(0x22c55e, 1);
            g.fillTriangle(44, 20, 58, 10, 50, 26);
          } else if (ingredient === "roux") {
            g.fillStyle(0x7c3aed, 1);
            g.fillRoundedRect(10, 10, 40, 34, 8);
            g.fillStyle(0xddd6fe, 0.75);
            g.fillRect(16, 18, 28, 8);
          } else if (ingredient === "apple") {
            g.fillStyle(0xef4444, 1);
            g.fillCircle(30, 28, 18);
            g.fillStyle(0x15803d, 1);
            g.fillEllipse(44, 12, 16, 8);
          } else if (ingredient === "milk") {
            g.fillStyle(0xffffff, 1);
            g.fillRoundedRect(14, 10, 32, 40, 8);
            g.lineStyle(2, 0x93c5fd, 1);
            g.strokeRoundedRect(14, 10, 32, 40, 8);
          } else {
            g.fillStyle(0x38bdf8, 1);
            g.fillEllipse(30, 28, 42, 20);
            g.fillTriangle(46, 28, 58, 18, 58, 38);
          }
          g.generateTexture(key, 64, 56);
          g.destroy();
          return key;
        }

        private pushSnapshot() {
          setSnapshot({
            phase: this.phase,
            failReason: this.failReason,
            score: this.score,
            bestScore: this.bestScore,
            collected: { ...this.collected },
            target: recipeTarget,
            misses: this.misses,
            basketCount: this.basketCount,
            capacity: basketCapacity
          });
        }
      }

      const scene = new ShoppingBasketScene();
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
            gravity: { x: 0, y: 1.06 },
            debug: false
          }
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH
        }
      });

      controllerRef.current = {
        moveTo: (pointerX) => scene.moveTo(pointerX),
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
    if (snapshot.phase === "ready") return "大きいかごで集める";
    if (snapshot.phase === "cleared") return "カレー完成";
    if (snapshot.phase === "failed") return "おつかい失敗";
    return "材料あつめ中";
  }, [snapshot.phase]);

  return (
    <section className="prototype-shell">
      <div className="status-panel card">
        <div className={`phase-chip phase-${snapshot.phase}`}>{summaryText}</div>

        <div className="recipe-list">
          {(["meat", "onion", "potato", "carrot", "roux"] as IngredientKey[]).map((key) => (
            <div className="recipe-item" key={key}>
              <span>{ingredientLabels[key]}</span>
              <strong>
                {snapshot.collected[key]} / {snapshot.target[key]}
              </strong>
            </div>
          ))}
        </div>

        <div className="status-grid">
          <div>
            <span>最高得点</span>
            <strong>{snapshot.bestScore}</strong>
          </div>
          <div>
            <span>スコア</span>
            <strong>{snapshot.score}</strong>
          </div>
          <div>
            <span>取り逃し</span>
            <strong>{snapshot.misses}</strong>
          </div>
          <div>
            <span>メニュー</span>
            <strong>カレー</strong>
          </div>
        </div>

        <div className="basket-capacity">
          <span>かごの中</span>
          <strong>
            {snapshot.basketCount} / {snapshot.capacity}
          </strong>
        </div>
      </div>

      <div className="play-panel card">
        <div className="canvas-shell tap-enabled">
          <div ref={mountRef} className="phaser-mount" />
          <button
            aria-label="かごを動かす"
            className="tap-surface"
            onPointerMove={(event) => {
              if (!mountRef.current) return;
              const bounds = mountRef.current.getBoundingClientRect();
              const pointerX = ((event.clientX - bounds.left) / bounds.width) * 420;
              controllerRef.current?.moveTo(pointerX);
            }}
            onPointerDown={(event) => {
              if (!mountRef.current) return;
              const bounds = mountRef.current.getBoundingClientRect();
              const pointerX = ((event.clientX - bounds.left) / bounds.width) * 420;
              controllerRef.current?.moveTo(pointerX);
            }}
          />
          {snapshot.phase === "failed" ? (
            <div className="result-overlay fail">
              <strong>おつかい失敗</strong>
              <span>
                {snapshot.failReason === "overflow"
                  ? "余計な食材でかごがいっぱい"
                  : "かごを整えて集め直そう"}
              </span>
            </div>
          ) : null}
          {snapshot.phase === "cleared" ? (
            <div className="result-overlay clear">
              <strong>カレー完成</strong>
              <span>必要な材料がそろった</span>
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
