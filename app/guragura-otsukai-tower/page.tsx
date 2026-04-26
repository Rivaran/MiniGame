import Link from "next/link";

import { PhaserTowerPrototype } from "../../components/phaser-tower-prototype";

export default function GuraguraPage() {
  return (
    <main className="page-shell game-page">
      <header className="game-header">
        <Link className="back-link" href="/">
          ミニゲームへ戻る
        </Link>
        <h1>グラグラおつかいタワー</h1>
      </header>

      <PhaserTowerPrototype />
    </main>
  );
}
