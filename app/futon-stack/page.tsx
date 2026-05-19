import Link from "next/link";

import { FutonStackPrototype } from "../../components/futon-stack-prototype";

export default function FutonStackPage() {
  return (
    <main className="page-shell game-page">
      <header className="game-header">
        <Link className="back-link" href="/">
          ミニゲームへ戻る
        </Link>
        <h1>ふとんもりもり</h1>
      </header>

      <FutonStackPrototype />
    </main>
  );
}
