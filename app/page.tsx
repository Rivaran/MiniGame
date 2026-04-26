import Link from "next/link";

const games = [
  {
    href: "/guragura-otsukai-tower",
    title: "グラグラおつかいタワー",
    tag: "Physics",
    description: "荷物を落として積み上げる、ぐらぐら系のハイスコアゲーム。"
  }
];

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-hero card">
        <p className="home-kicker">Mini Games</p>
        <h1>ミニゲーム</h1>
        <p className="home-lead">気軽に遊べる小さなゲームを少しずつ増やしていく場所です。</p>
      </section>

      <section className="game-grid">
        {games.map((game) => (
          <Link className="game-card card" href={game.href} key={game.href}>
            <span className="game-tag">{game.tag}</span>
            <h2>{game.title}</h2>
            <p>{game.description}</p>
            <span className="game-link">あそぶ</span>
          </Link>
        ))}

        <article className="coming-card card">
          <span className="game-tag muted">Coming Soon</span>
          <h2>次のゲームを追加予定</h2>
          <p>短時間で遊べるミニゲームをここから増やしていきます。</p>
        </article>
      </section>
    </main>
  );
}
