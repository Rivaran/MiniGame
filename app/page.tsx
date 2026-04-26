import { PhaserTowerPrototype } from "../components/phaser-tower-prototype";

export default function Page() {
  return (
    <main className="page-shell">
      <header className="game-header">
        <h1>グラグラおつかいタワー</h1>
      </header>

      <PhaserTowerPrototype />
    </main>
  );
}
