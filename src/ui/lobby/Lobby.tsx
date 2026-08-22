import { useMemo, useState } from 'react'
import { GAMES, gameById, type GameId } from '../../games/registry'
import { PAGE_SIZE, useLobby, visibleRooms, type Room } from '../../lobby/useLobby'
import { CreateRoom } from './CreateRoom'
import { Glyph } from './Glyph'

/**
 * 大厅。
 *
 * **一行一个房间**，这是整个设计的核心决定。棋牌室的大厅是拿来扫的，
 * 不是拿来逛的：玩家在找"哪间正在等人、打的是我要的游戏"，
 * 而这两件事在一行里就能答完。网格卡片好看但一屏放不下几个，
 * 而且每张卡片都要读一遍才知道能不能进。
 *
 * 一行里信息的排布也按"扫"来定：颜色（什么游戏）→ 状态灯（进得去吗）
 * → 人数 → 名字。名字排在最后，因为它其实是最不重要的一项。
 */
export function Lobby() {
  const rooms = useLobby((s) => s.rooms)
  const filter = useLobby((s) => s.filter)
  const query = useLobby((s) => s.query)
  const page = useLobby((s) => s.page)
  const setFilter = useLobby((s) => s.setFilter)
  const setQuery = useLobby((s) => s.setQuery)
  const setPage = useLobby((s) => s.setPage)
  const refresh = useLobby((s) => s.refresh)
  const join = useLobby((s) => s.join)

  const [creating, setCreating] = useState(false)
  const [asking, setAsking] = useState<Room | null>(null)
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const list = useMemo(() => visibleRooms(rooms, filter, query), [rooms, filter, query])
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const clamped = Math.min(page, pages - 1)
  const shown = list.slice(clamped * PAGE_SIZE, clamped * PAGE_SIZE + PAGE_SIZE)

  const tryJoin = (r: Room, password?: string) => {
    const why = join(r.id, password)
    if (why) {
      setErr(why)
      // 密码错了留在弹窗里再试一次，其余的错误直接提示
      if (r.locked && why === '密码不对') return
      setAsking(null)
      return
    }
    setAsking(null)
    setErr(null)
  }

  return (
    <div className="lb">
      <header className="lb-top">
        <div className="lb-logo small">
          <span className="lb-logo-main">DOLOS</span>
          <span className="lb-logo-sub">酒馆棋牌室</span>
        </div>
        <div className="lb-me">
          <span className="lb-me-av" />
          <span className="lb-me-name">你</span>
        </div>
      </header>

      <div className="lb-board">
        <div className="lb-tabs">
          <button
            className={`lb-tab${filter === 'all' ? ' on' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部
          </button>
          {GAMES.map((g) => (
            <button
              key={g.id}
              className={`lb-tab${filter === g.id ? ' on' : ''}`}
              style={{ '--accent': g.accent } as React.CSSProperties}
              onClick={() => setFilter(g.id)}
            >
              <Glyph id={g.id} size={18} />
              {g.name}
            </button>
          ))}
          <div className="lb-tools">
            <input
              className="lb-search"
              placeholder="房号 / 房名"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="lb-btn lb-btn-ghost" onClick={refresh}>
              刷新
            </button>
            <button className="lb-btn lb-btn-go" onClick={() => setCreating(true)}>
              建房间
            </button>
          </div>
        </div>

        <div className="lb-rows">
          {shown.length === 0 && <div className="lb-empty">这里空空的，建一间吧</div>}
          {shown.map((r) => (
            <RoomRow key={r.id} room={r} onJoin={() => (r.locked ? (setPwd(''), setAsking(r)) : tryJoin(r))} />
          ))}
        </div>

        <div className="lb-pager">
          <button className="lb-btn lb-btn-ghost" disabled={clamped === 0} onClick={() => setPage(clamped - 1)}>
            上一页
          </button>
          <span className="lb-pageno">
            {clamped + 1} / {pages}
          </span>
          <button
            className="lb-btn lb-btn-ghost"
            disabled={clamped >= pages - 1}
            onClick={() => setPage(clamped + 1)}
          >
            下一页
          </button>
          <span className="lb-count">共 {list.length} 间</span>
        </div>
      </div>

      {err && !asking && (
        <div className="lb-toast" onAnimationEnd={() => setErr(null)}>
          {err}
        </div>
      )}

      {creating && <CreateRoom onClose={() => setCreating(false)} />}

      {asking && (
        <div className="lb-modal-back" onClick={() => setAsking(null)}>
          <div className="lb-modal small" onClick={(e) => e.stopPropagation()}>
            <h3>这间房要密码</h3>
            <input
              className="lb-input"
              autoFocus
              value={pwd}
              placeholder="四位数字"
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && tryJoin(asking, pwd)}
            />
            {err && <div className="lb-err">{err}</div>}
            <div className="lb-modal-foot">
              <button className="lb-btn lb-btn-ghost" onClick={() => setAsking(null)}>
                算了
              </button>
              <button className="lb-btn lb-btn-go" onClick={() => tryJoin(asking, pwd)}>
                进去
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoomRow({ room, onJoin }: { room: Room; onJoin: () => void }) {
  const g = gameById(room.game)
  const full = room.players.length >= room.max
  const playing = room.status === 'playing'
  const openable = !playing && !full

  return (
    <div
      className={`lb-row${openable ? '' : ' closed'}`}
      style={{ '--accent': g.accent } as React.CSSProperties}
      onClick={openable ? onJoin : undefined}
    >
      <div className="lb-no">{room.no}</div>
      <div className="lb-game">
        <span className="lb-game-ic">
          <Glyph id={room.game as GameId} size={20} />
        </span>
        <span className="lb-game-name">{g.name}</span>
      </div>
      <div className="lb-name">
        {room.locked && <span className="lb-lock">🔒</span>}
        {room.name}
      </div>
      {/* 人数用点阵而不是数字：满没满是一眼的事，不该让人做减法 */}
      <div className="lb-seats">
        {Array.from({ length: room.max }, (_, i) => (
          <i key={i} className={i < room.players.length ? 'on' : ''} />
        ))}
        <span className="lb-seats-n">
          {room.players.length}/{room.max}
        </span>
      </div>
      <div className={`lb-status ${playing ? 'playing' : full ? 'full' : 'waiting'}`}>
        {playing ? '游戏中' : full ? '满员' : '等待中'}
      </div>
      <div className="lb-enter">{openable ? <span className="lb-btn lb-btn-go tiny">进入</span> : null}</div>
    </div>
  )
}
