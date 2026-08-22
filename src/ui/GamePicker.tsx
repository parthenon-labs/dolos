import { GAMES, playersFor, type GameId } from '../games/registry'
import { usePlayerStore } from '../state/usePlayerStore'
import { tableById } from '../scene/hallLayout'

/**
 * 落座之后的第一屏：这张桌子今天打什么。
 *
 * 刻意做得薄 —— 背后的 3D 酒馆继续渲染并透过来，
 * 这一层只是"桌上摆着的几个盒子"，不是另一个页面。
 * 起身的出口一直在，选错了不用重开。
 */
export function GamePicker() {
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const mode = usePlayerStore((s) => s.mode)
  const choose = usePlayerStore((s) => s.chooseGame)
  const stand = usePlayerStore((s) => s.beginStand)

  if (mode !== 'seated' || !seatedAt) return null
  const table = tableById(seatedAt.tableId)
  const chairs = table?.seats ?? 0

  return (
    <div className="picker">
      <div className="picker-inner">
        <div className="picker-head">
          <div className="brand">DOLOS</div>
          <h1>打点什么？</h1>
          <p className="dim">
            {chairs} 把椅子的桌子 · 空位由 AI 补上 · 虚拟筹码，不可充值提现
          </p>
        </div>

        <div className="picker-grid">
          {GAMES.map((g) => {
            const n = playersFor(g, chairs)
            const ok = n > 0
            return (
              <button
                key={g.id}
                className="game-card"
                disabled={!ok}
                onClick={() => ok && choose(g.id as GameId)}
              >
                <div className="game-card-art" data-game={g.id}>
                  <GameGlyph id={g.id} />
                </div>
                <div className="game-card-name">{g.name}</div>
                <div className="game-card-players">
                  {ok ? `${n} 人局` : `至少 ${g.players.min} 人，这张桌子坐不下`}
                </div>
                <div className="game-card-tag">{g.tagline}</div>
              </button>
            )
          })}
        </div>

        <button className="ghost-btn picker-leave" onClick={stand}>
          起身离席
        </button>
      </div>
    </div>
  )
}

/**
 * 每个游戏一个手画的标记。
 *
 * 用 SVG 而不是 emoji 或图片：三个标记必须是同一套线宽和同一种画法，
 * 否则三张卡片摆在一起会像从三个地方抄来的。
 */
function GameGlyph({ id }: { id: GameId }) {
  if (id === 'poker') {
    return (
      <svg viewBox="0 0 48 48" fill="none">
        <rect x="9" y="12" width="18" height="26" rx="3" transform="rotate(-9 18 25)" />
        <rect x="21" y="10" width="18" height="26" rx="3" transform="rotate(9 30 23)" />
        <path d="M30 18l4 5-4 5-4-5z" className="fill" />
      </svg>
    )
  }
  if (id === 'ddz') {
    return (
      <svg viewBox="0 0 48 48" fill="none">
        <rect x="6" y="14" width="14" height="22" rx="2.5" transform="rotate(-14 13 25)" />
        <rect x="17" y="11" width="14" height="22" rx="2.5" />
        <rect x="28" y="14" width="14" height="22" rx="2.5" transform="rotate(14 35 25)" />
        <circle cx="24" cy="20" r="2.6" className="fill" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <path d="M24 7l11 6.5v13L24 33l-11-6.5v-13z" />
      <path d="M13 26.5L13 33 24 39.5 35 33v-6.5" />
      <path d="M24 20v13" />
    </svg>
  )
}
