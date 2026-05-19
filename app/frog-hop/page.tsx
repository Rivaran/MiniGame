import Link from "next/link";

import { FrogHopPrototype } from "../../components/frog-hop-prototype";

export default function FrogHopPage() {
  return (
    <main className="page-shell game-page">
      <header className="game-header">
        <Link className="back-link" href="/">
          ミニゲームへ戻る
        </Link>
        <h1>ぴょんぴょんカエル</h1>
      </header>

      <FrogHopPrototype />
    </main>
  );
}
