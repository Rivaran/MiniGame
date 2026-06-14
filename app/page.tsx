import Link from "next/link";

const games = [
  {
    href: "/food-drop-battle",
    title: "おかし落とし",
    tag: "Battle",
    description: "落ちてくるおかしをかごでキャッチ！1人でCPU対戦、2人で対戦もできる。"
  },
  {
    href: "/guragura-otsukai-tower",
    title: "グラグラおつかいタワー",
    tag: "Physics",
    description: "丸い荷物も混ざる、慎重さ重視のぐらぐら積みゲーム。"
  },
  {
    href: "/frog-hop",
    title: "ぴょんぴょんカエル",
    tag: "Runner",
    description: "タップでカエルをジャンプさせて、障害物をよける横スクロールゲーム。"
  },
  {
    href: "/shopping-basket",
    title: "おつかいバスケット",
    tag: "Collect",
    description: "かごに必要な食材を集めて、カレーの材料をそろえるゲーム。"
  },
  {
    href: "/kage-fumi",
    title: "影ふみリズム",
    tag: "Rhythm",
    description: "タイミングよくタップして、通り過ぎる人の影を踏もう！コンボで高得点をねらえ。"
  },
  {
    href: "/faucet-game",
    title: "じゃぐちゲーム",
    tag: "Catch",
    description: "ランダムで変わる蛇口の下に瓶をスライド！20秒で何滴集められるかな？"
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
            <span className="game-tag" data-tag={game.tag}>{game.tag}</span>
            <h2>{game.title}</h2>
            <p>{game.description}</p>
            <span className="game-link">あそぶ</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
