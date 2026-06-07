import Link from "next/link";

import { KageFumiPrototype } from "../../components/kage-fumi-prototype";

export default function KageFumiPage() {
  return (
    <main className="page-shell game-page">
      <header className="game-header">
        <Link className="back-link" href="/">
          ミニゲームへ戻る
        </Link>
        <h1>影ふみリズム</h1>
      </header>

      <KageFumiPrototype />
    </main>
  );
}
