import { useEffect, useMemo, useRef } from 'react'
import { useGameStore } from '../../state/useGameStore'
import { usePlayerStore } from '../../state/usePlayerStore'
import { tableById } from '../../scene/hallLayout'
import { startSession } from '../../poker/session'
import { useTable } from '../../poker/useTable'
import type { Seat } from '../../poker/types'
import { Avatar } from '../match/Avatar'
import { PlayingCard } from './PlayingCard'
import { PokerActionBar } from './PokerActionBar'

/**
 * 全屏德州扑克桌。坐下之后盖住 3D 场景。
 *
 * 布局是**你在下方正中，其余人沿椭圆铺开** —— 扑克游戏几十年的惯例，
 * 玩家不需要学。这也顺手绕开了第一人称的视野问题：
 * 2D 里"所有人都看得见"是免费的。
 *
 * 3D 大厅没有废掉：它是进门那一下的氛围和落座，
 * 以及将来摊牌时切回桌上的那一下。
 */
/** 空位的补位 AI。名字和颜色和大厅里那批同一个风格，看起来是同一个世界的人 */
const FILLERS = [
  { name: 'Pell', color: '#9a6b3f' },
  { name: 'Corvo', color: '#4a6a7a' },
  { name: 'Juno', color: '#7a4a5f' },
  { name: 'Bask', color: '#5f7a4a' },
  { name: 'Mott', color: '#8c5a5a' },
  { name: 'Rilla', color: '#6d6a94' },
]

export function PokerTable() {
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const mode = usePlayerStore((s) => s.mode)
  const stand = usePlayerStore((s) => s.beginStand)
  const occupancy = useGameStore((s) => s.occupancy)

  const view = useTable((s) => s.view)
  const pending = useTable((s) => s.pending)
  const log = useTable((s) => s.log)
  const lastActor = useTable((s) => s.lastActor)
  const showdown = useTable((s) => s.showdown)
  const awarded = useTable((s) => s.awarded)
  const handNo = useTable((s) => s.handNo)

  const table = seatedAt ? tableById(seatedAt.tableId) : undefined

  const seats = useMemo(() => {
    if (!seatedAt || !table) return []
    const occ = occupancy[table.id] ?? []
    return Array.from({ length: table.seats }, (_, i) => {
      if (i === seatedAt.seat) {
        return { seat: i, name: '你', color: occ[i]?.color ?? '#c9a227', isAI: false, stack: 200 }
      }
      // 空位由 AI 补上 —— 这本来就是这个产品的核心，
      // 所以它必须有名字和颜色。露出"座位 3"这种占位符
      // 等于告诉玩家"这里还没做完"
      const filler = FILLERS[i % FILLERS.length]
      return {
        seat: i,
        name: occ[i]?.name ?? filler.name,
        color: occ[i]?.color ?? filler.color,
        isAI: occ[i]?.isAI ?? true,
        stack: 200,
      }
    })
  }, [seatedAt, table, occupancy])

  useEffect(() => {
    if (mode !== 'seated' || !seatedAt || seats.length < 2) return
    return startSession({ seats, mySeat: seatedAt.seat, hands: 500 })
  }, [mode, seatedAt, seats])

  const logBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight
  }, [log])

  if (mode !== 'seated' || !seatedAt) return null

  const n = seats.length
  const mySeat = seatedAt.seat
  const pot =
    (view?.pots.reduce((a, p) => a + p.amount, 0) ?? 0) +
    (view?.players.reduce((a, p) => a + p.committed, 0) ?? 0)

  // 座位在椭圆上的位置。自己永远在正下方（角度 90°），其余顺时针铺开
  const spot = (seat: Seat) => {
    const rel = (seat - mySeat + n) % n
    const angle = Math.PI / 2 + (rel / n) * Math.PI * 2
    return {
      left: `${50 + Math.cos(angle) * 39}%`,
      top: `${52 + Math.sin(angle) * 37}%`,
    }
  }

  const best = new Set(
    showdown.length > 0 && view
      ? view.players.flatMap((p) => (p.revealed ? p.revealed : []))
      : [],
  )
  void best

  return (
    <div className="poker">
      <header className="poker-top">
        <div className="brand">DOLOS</div>
        <div className="hand-no">第 {handNo} 手</div>
        <div className="blinds">
          盲注 {view?.config.smallBlind ?? 1}/{view?.config.bigBlind ?? 2}
        </div>
        {/* 虚拟筹码。这句话必须一直在，不是免责声明而是产品定义 */}
        <div className="playmoney">虚拟筹码 · 不可充值提现</div>
        <button className="ghost-btn" onClick={stand}>
          离席
        </button>
      </header>

      <div className="felt">
        <div className="center">
          <div className="board">
            {Array.from({ length: 5 }, (_, i) => {
              const c = view?.board[i]
              return c === undefined ? (
                <div key={i} className="pcard slot lg" />
              ) : (
                <PlayingCard key={i} card={c} size="lg" />
              )
            })}
          </div>
          <div className="pot">
            底池 <b>{pot}</b>
            {view && view.pots.length > 1 && (
              <span className="sidepots">
                {view.pots.map((p, i) => (
                  <em key={i}>
                    {i === 0 ? '主池' : `边池${i}`} {p.amount}
                  </em>
                ))}
              </span>
            )}
          </div>
        </div>

        {seats.map((s) => {
          const p = view?.players.find((x) => x.seat === s.seat)
          const isTurn = view?.turn === s.seat
          const won = awarded.find((a) => a.seat === s.seat)
          const label = showdown.find((x) => x.seat === s.seat)?.label
          return (
            <div
              key={s.seat}
              className={
                'pseat' +
                (s.seat === mySeat ? ' me' : '') +
                (p?.folded ? ' folded' : '') +
                (isTurn ? ' turn' : '') +
                (lastActor === s.seat ? ' acted' : '')
              }
              style={spot(s.seat)}
            >
              {view?.button === s.seat && <span className="dealer">D</span>}

              <div className="hole">
                {s.seat === mySeat ? (
                  (view?.myCards ?? []).map((c, i) => (
                    <PlayingCard key={i} card={c} size="md" dim={p?.folded} />
                  ))
                ) : p?.revealed ? (
                  p.revealed.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
                ) : p && !p.folded && !p.sittingOut ? (
                  <>
                    <PlayingCard faceDown size="sm" />
                    <PlayingCard faceDown size="sm" />
                  </>
                ) : null}
              </div>

              <div className="who">
                <Avatar color={s.color} size={34} dim={p?.folded} />
                <div className="info">
                  <span className="nm">
                    {s.name}
                    {s.isAI && <em className="ai">AI</em>}
                  </span>
                  <span className="stk">{p?.stack ?? s.stack}</span>
                </div>
              </div>

              {label && <div className="handlabel">{label}</div>}
              {won && <div className="won">+{won.won}</div>}
              {p && p.committed > 0 && <div className="bet">{p.committed}</div>}
              {p?.allIn && !p.folded && <div className="allin">全下</div>}
            </div>
          )
        })}
      </div>

      <aside className="poker-log" ref={logBox}>
        {log.map((r) => (
          <div key={r.id} className={'lrow ' + r.kind}>
            {r.text}
          </div>
        ))}
      </aside>

      <footer>
        <PokerActionBar pending={pending} onAct={(a) => pending?.resolve(a)} />
      </footer>
    </div>
  )
}
