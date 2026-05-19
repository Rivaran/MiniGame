import Link from "next/link";

import { ShoppingBasketPrototype } from "../../components/shopping-basket-prototype";

export default function ShoppingBasketPage() {
  return (
    <main className="page-shell game-page">
      <header className="game-header">
        <Link className="back-link" href="/">
          ミニゲームへ戻る
        </Link>
        <h1>おつかいバスケット</h1>
      </header>

      <ShoppingBasketPrototype />
    </main>
  );
}
