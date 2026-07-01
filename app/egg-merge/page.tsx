import Link from "next/link";
import { EggMerge } from "./EggMerge";

export default function EggMergePage() {
  return (
    <main className="page-shell game-page">
      <header className="game-header">
        <Link className="back-link" href="/">
          ミニゲームへ戻る
        </Link>
        <h1>たまごマージ</h1>
      </header>
      <EggMerge />
    </main>
  );
}
