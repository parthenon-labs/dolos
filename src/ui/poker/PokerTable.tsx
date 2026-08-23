import { useEffect, useMemo, useRef, useState } from 'react'
import { useLobby, useMyRoom } from '../../lobby/useLobby'
import { useRoster } from '../../games/seats'
import { startSession } from '../../poker/session'
import { useTable } from '../../poker/useTable'
import { describe, evaluate } from '../../poker/evaluate'
import type { Seat } from '../../poker/types'
import { Avatar } from '../match/Avatar'
import { SoundToggle } from '../lobby/SoundToggle'
import { Chips } from './Chips'
import { HandRankings, HowToPlay } from './HandRankings'
import { PlayingCard } from './PlayingCard'
import { PokerActionBar } from './PokerActionBar'

/**
 * 全屏德州扑克桌。
 *
 * 这一版重做的核心不是"配色好看点"，而是**接回大厅的视觉语言**：
 * 玩家刚从一个昏暗、暖光、有氛围的 3D 酒馆走进来，
 * 落地却是一块扁平的绿椭圆加系统字体 —— 这个断裂比任何单项审美问题都伤。
 *
 * 所以：暖琥珀 + 暗木 + 头顶一盏吊灯的光锥 + 暗角，和大厅同一套；
 * 3D 场景继续在背后渲染并透出来，桌子像是"摆在那个酒馆里"而不是另一个页面。
 *
 * 布局仍然是你在下方正中、其余人沿上方的弧铺开 —— 扑克游戏几十年的惯例，
 * 玩家不需要学，也顺手绕开了第一人称的视野问题。
 */
export function PokerTable() {
  const room = useMyRoom()
  // 「回房间」是这一局打完了回等待室，「离开」是走人回大厅
  const back = useLobby((s) => s.endGame)
  const stand = useLobby((s) => s.leave)
  // 德州的人数吃满房间容量，其余两个游戏各有自己的定数
  const roster = useRoster(room?.max ?? 0)

  const view = useTable((s) => s.view)
  const pending = useTable((s) => s.pending)
  const log = useTable((s) => s.log)
  const lastActor = useTable((s) => s.lastActor)
  const showdown = useTable((s) => s.showdown)
  const awarded = useTable((s) => s.awarded)
  const handNo = useTable((s) => s.handNo)

  const [sheet, setSheet] = useState<null | 'ranks' | 'how'>(null)

  const seats = useMemo(
    () => roster.map((r) => ({ ...r, stack: 200 })),
    [roster],
  )

  useEffect(() => {
    if (seats.length < 2) return
    return startSession({ seats, mySeat: 0, hands: 500 })
  }, [seats])

  const logBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight
  }, [log])

  if (!room || seats.length < 2) return null

  const n = seats.length
  const mySeat = 0
  const pot =
    (view?.pots.reduce((a, p) => a + p.amount, 0) ?? 0) +
    (view?.players.reduce((a, p) => a + p.committed, 0) ?? 0)

  // 其他人沿上方的弧铺开，自己固定在正下方。
  // 不用整圈均分：正下方要留给自己的大牌和筹码，别人塞进去会互相压
  const spot = (seat: Seat) => {
    const rel = (seat - mySeat + n) % n
    if (rel === 0) return null
    const t = n <= 2 ? 0.5 : (rel - 1) / (n - 2)
    const angle = Math.PI * (1.04 - t * 1.08)
    return {
      left: `${50 + Math.cos(angle) * 40}%`,
      top: `${46 - Math.sin(angle) * 31}%`,
    }
  }

  // 摊牌时高亮"是哪五张牌赢的"。
  // 对新手这是最强的一次「啊原来如此」—— 只报牌型名字，他对不上是哪几张
  const bestSet = new Set<number>(showdown.flatMap((s) => s.best))

  // 你现在成了什么牌。翻牌之后就一直显示，不用等摊牌 ——
  // 让人时刻知道自己手里是什么，是这个游戏最基本的可用性
  const myHand =
    view && view.myCards.length === 2 && view.board.length >= 3
      ? describe(evaluate([...view.myCards, ...view.board]))
      : null

  return (
    <div className="poker">
      <header className="poker-top">
        <div className="brand">DOLOS</div>
        <div className="meta">
          <span>第 {handNo} 手</span>
          <span className="dim">
            盲注 {view?.config.smallBlind ?? 1}/{view?.config.bigBlind ?? 2}
          </span>
        </div>
        <div className="tools">
          <button className="ghost-btn" onClick={() => setSheet('ranks')}>
            牌型大小
          </button>
          <button className="ghost-btn" onClick={() => setSheet('how')}>
            怎么玩
          </button>
        </div>
        <div className="playmoney">虚拟筹码 · 不可充值提现</div>
        <SoundToggle variant="dark" />
        <button className="ghost-btn" onClick={back}>
          回房间
        </button>
        <button className="ghost-btn leave" onClick={stand}>
          离开
        </button>
      </header>

      <div className="felt-wrap">
        <div className="felt">
          <div className="spotlight" />

          <div className="center">
            <div className="board">
              {Array.from({ length: 5 }, (_, i) => {
                const c = view?.board[i]
                return c === undefined ? (
                  <div key={i} className="pcard slot lg" />
                ) : (
                  <PlayingCard
                    key={i}
                    card={c}
                    size="lg"
                    highlight={bestSet.has(c)}
                    tilt={((i * 37) % 5) - 2}
                  />
                )
              })}
            </div>

            <div className="potbox">
              <Chips amount={pot} size={19} showAmount={false} />
              <div className="pot-num">
                底池 <b>{pot}</b>
              </div>
              {view && view.pots.length > 1 && (
                <div className="sidepots">
                  {view.pots.map((p, i) => (
                    <span key={i}>
                      {i === 0 ? '主池' : `边池 ${i}`} {p.amount}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {seats.map((s) => {
            const pos = spot(s.seat)
            if (!pos) return null
            const p = view?.players.find((x) => x.seat === s.seat)
            const isTurn = view?.turn === s.seat
            const won = awarded.find((a) => a.seat === s.seat)
            const label = showdown.find((x) => x.seat === s.seat)?.label
            return (
              <div
                key={s.seat}
                className={
                  'pseat' +
                  (p?.folded ? ' folded' : '') +
                  (isTurn ? ' turn' : '') +
                  (lastActor === s.seat ? ' acted' : '') +
                  (won ? ' winner' : '')
                }
                style={pos}
              >
                <div className="hole">
                  {p?.revealed ? (
                    p.revealed.map((c, i) => (
                      <PlayingCard key={i} card={c} size="sm" highlight={bestSet.has(c)} />
                    ))
                  ) : p && !p.folded && !p.sittingOut ? (
                    <>
                      <PlayingCard faceDown size="sm" tilt={-4} />
                      <PlayingCard faceDown size="sm" tilt={4} />
                    </>
                  ) : null}
                </div>

                <div className="plate">
                  {view?.button === s.seat && <span className="dealer">D</span>}
                  <Avatar color={s.color} size={36} dim={p?.folded} />
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
                {p && p.committed > 0 && (
                  <div className="bet">
                    <Chips amount={p.committed} size={14} />
                  </div>
                )}
                {p?.allIn && !p.folded && <div className="allin">全下</div>}
              </div>
            )
          })}

          {(() => {
            const s = seats[mySeat]
            if (!s) return null
            const p = view?.players.find((x) => x.seat === mySeat)
            const isTurn = view?.turn === mySeat
            const won = awarded.find((a) => a.seat === mySeat)
            const label = showdown.find((x) => x.seat === mySeat)?.label
            return (
              <div className={'pseat me' + (isTurn ? ' turn' : '') + (won ? ' winner' : '')}>
                {p && p.committed > 0 && (
                  <div className="bet">
                    <Chips amount={p.committed} size={15} />
                  </div>
                )}
                <div className="hole">
                  {(view?.myCards ?? []).map((c, i) => (
                    <PlayingCard
                      key={i}
                      card={c}
                      size="xl"
                      dim={p?.folded}
                      highlight={bestSet.has(c)}
                      tilt={i === 0 ? -5 : 5}
                    />
                  ))}
                </div>
                {(label || myHand) && <div className="myhand">{label ?? myHand}</div>}
                <div className="plate">
                  {view?.button === mySeat && <span className="dealer">D</span>}
                  <Avatar color={s.color} size={38} />
                  <div className="info">
                    <span className="nm">你</span>
                    <span className="stk">{p?.stack ?? s.stack}</span>
                  </div>
                </div>
                {won && <div className="won big">+{won.won}</div>}
              </div>
            )
          })()}
        </div>

        <aside className="poker-log" ref={logBox}>
          {log.map((r) => (
            <div key={r.id} className={'lrow ' + r.kind}>
              {r.text}
            </div>
          ))}
        </aside>
      </div>

      <footer>
        <PokerActionBar pending={pending} onAct={(a) => pending?.resolve(a)} />
      </footer>

      {sheet === 'ranks' && <HandRankings onClose={() => setSheet(null)} />}
      {sheet === 'how' && <HowToPlay onClose={() => setSheet(null)} />}
    </div>
  )
}
