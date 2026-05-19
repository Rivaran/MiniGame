import Link from "next/link";
import { FoodDropBattle } from "../../components/food-drop-battle";

export default function FoodDropBattlePage() {
  return (
    <main className="page-shell game-page">
      <header className="game-header">
        <Link className="back-link" href="/">
          ミニゲームへ戻る
        </Link>
        <h1>おかし落とし</h1>
      </header>
      <FoodDropBattle />
    </main>
  );
}
