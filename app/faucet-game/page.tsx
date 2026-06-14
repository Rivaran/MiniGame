import Link from "next/link";
import { FaucetGame } from "./FaucetGame";

export default function FaucetGamePage() {
  return (
    <main className="page-shell game-page">
      <header className="game-header">
        <Link className="back-link" href="/">
          ミニゲームへ戻る
        </Link>
        <h1>じゃぐちゲーム</h1>
      </header>
      <FaucetGame />
    </main>
  );
}
