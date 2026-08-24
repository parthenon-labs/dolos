import { useEffect, useMemo, useRef } from 'react'
import { useLobby } from '../../lobby/useLobby'
import { useRoster } from '../../games/seats'
import { formatRanks, sortCards, type Card } from '../../ddz/cards'
import { beats, candidates, describeCombo, parse } from '../../ddz/combo'
import { startDdzSession } from '../../ddz/session'
import { useDdz } from '../../ddz/useDdz'
import type { Seat } from '../../ddz/types'
import { Avatar } from '../Avatar'
import { SoundToggle } from '../lobby/SoundToggle'
import { useKeys } from '../lobby/useKeys'
import { CardRow, DdzCard } from './DdzCard'

/**
 * 全屏斗地主。
 *
 * 布局和德州同源：**你固定在正下方，别人沿上方铺开**。
 * 换个游戏就换套布局，玩家每次都要重新找自己在哪 —— 这个代价比省下来的设计工夫大。
 *
 * 斗地主自己的两个要求：
 * - **手牌必须一眼看得出结构**。十七到二十张排成一排，
 *   相同点数的挤在一起、不同点数之间留一道缝，顺子和对子才看得出来。
 *   这是这个界面里最要紧的一件事，比任何配色都重要
 * - **别人剩几张牌必须一直在**。斗地主全部的紧张感来自"他还剩两张"，
 *   藏进小字里等于把游戏的心跳关掉了
 */
export function DdzTable() {
  // 「回房间」是这一局打完了回到等待室，「离开」是彻底走人回大厅。
  // 两个出口都要有：连着再来一局是常态，而离席是偶尔
  const back = useLobby((s) => s.endGame)
  const stand = useLobby((s) => s.leave)
  const roster = useRoster(3)

  const view = useDdz((s) => s.view)
  const pending = useDdz((s) => s.pending)
  const log = useDdz((s) => s.log)
  const placed = useDdz((s) => s.placed)
  const selected = useDdz((s) => s.selected)
  const toggle = useDdz((s) => s.toggle)
  const setSelected = useDdz((s) => s.setSelected)
  const gameNo = useDdz((s) => s.gameNo)
  const scores = useDdz((s) => s.scores)
  const result = useDdz((s) => s.result)
  const thinking = useDdz((s) => s.thinking)
  const setResult = useDdz((s) => s.setResult)

  useEffect(() => {
    if (roster.length !== 3) return
    return startDdzSession({ seats: roster })
  }, [roster])

  /**
   * 键盘。
   *
   * 斗地主一局要出十几手，全靠鼠标在牌和按钮之间来回跑很累。
   * 三个键就够：**空格出牌、Esc 不要、Tab 提示** ——
   * 都是手不用离开原位就能按到的。
   */
  useKeys({
    ' ': () => canPlay && pending?.kind === 'play' && pending.resolve({ kind: 'play', cards: selected }),
    Escape: () => myTurn && !mustPlay && pending?.kind === 'play' && pending.resolve({ kind: 'pass' }),
    Tab: () => myTurn && hint(),
  })

  const logBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight
  }, [log])

  const me = view?.me ?? 0
  const hand = view ? sortCards(view.myCards) : []
  // 座位摆位：自己在下，另外两家一左一右。左边是上家（先于我出牌）
  const left = ((me + 2) % 3) as Seat
  const right = ((me + 1) % 3) as Seat

  const req = view?.required ?? null
  const myTurn = pending?.kind === 'play'
  const mustPlay = myTurn && !req

  const picked = useMemo(() => parse(selected), [selected])
  const canPlay = !!picked && beats(picked, req?.combo ?? null)

  /** 提示：从枚举里挑一个能压住的。**和 bot 走的是同一套枚举** */
  const hint = () => {
    if (!view) return
    const all = candidates(hand, req?.combo ?? null)
    if (all.length === 0) return
    // 已经提示过一次就换下一个，让人能翻着看
    const cur = JSON.stringify(sortCards(selected))
    const i = all.findIndex((c) => JSON.stringify(c.cards) === cur)
    setSelected(all[(i + 1) % all.length].cards)
  }

  const playerOf = (s: Seat) => view?.players.find((p) => p.seat === s)

  if (!view) {
    return (
      <div className="ddz">
        <Top gameNo={0} view={null} onBack={back} onStand={stand} />
        <div className="ddz-loading">正在发牌…</div>
      </div>
    )
  }

  return (
    <div className="ddz">
      <Top gameNo={gameNo} view={view} onBack={back} onStand={stand} />

      <div className="ddz-body">
        <div className="ddz-felt">
          {/* 底牌。定地主之前扣着，定完了翻开 —— 这三张是全场唯一的公共信息 */}
          <div className="ddz-bottom-cards">
            <span className="label">底牌</span>
            {view.bottom ? (
              <CardRow cards={view.bottom} size="xs" overlap={0.32} />
            ) : (
              <div className="cardrow" style={{ width: 27 + 2 * 27 * 0.68 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="cardrow-slot" style={{ left: i * 27 * 0.68 }}>
                    <DdzCard faceDown size="xs" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Opponent side="left" p={playerOf(left)} roster={roster[left]} thinking={thinking === left} turn={view.turn === left} />
          <Opponent side="right" p={playerOf(right)} roster={roster[right]} thinking={thinking === right} turn={view.turn === right} />

          {/*
            三家出的牌都往台面中间聚。
            **这是牌桌的样子，也是唯一能一眼看懂"这一轮打成什么样"的排法** ——
            第一版把每个人出的牌摆在他自己那一栏里，
            中间空着一大片，而要比较大小的三手牌散在屏幕三个角上。
          */}
          <Played className="pile left" placed={placed[left]} size="sm" />
          <Played className="pile right" placed={placed[right]} size="sm" />
          <Played className="pile mine" placed={placed[me]} size="md" />

          {/* 现在要压什么 */}
          {req && (
            <div className="ddz-req">
              要压：<b>{describeCombo(req.combo)}</b>
            </div>
          )}
        </div>

        <aside className="ddz-log" ref={logBox}>
          {log.map((r) => (
            <div key={r.id} className={`row ${r.kind}`}>
              {r.text}
            </div>
          ))}
        </aside>
      </div>

      <footer className="ddz-foot">
        <div className="ddz-me">
          <Avatar color={roster[me]?.color ?? '#c9a227'} size={30} />
          <div>
            <div className="name">
              {/* 显示自己的昵称而不是"你" —— 这是别人看到的名字，
                  自己那一栏也该是同一个，靠高亮区分是谁，不靠改称呼 */}
              {roster[me]?.name ?? '你'}
              {view.landlord === me && <span className="lordbadge">地主</span>}
            </div>
            <div className={`left${hand.length <= 3 ? ' hot' : ''}`}>{hand.length} 张</div>
          </div>
        </div>
        <div className="ddz-hand">
          {hand.map((c, i) => (
            <div
              key={c}
              className="hand-slot"
              style={{
                // 同点数的挤在一起，换点数时多留一道缝 —— 结构就是这么看出来的
                // 同点数几乎完全叠上，换点数留一道明显的缝。
                // 两个值差得不够大就白做了 —— 第一版是 -26 / -18，
                // 8 个像素的差在二十张牌里根本看不出来，顺子和对子全糊成一片
                marginLeft: i === 0 ? 0 : sameRank(hand[i - 1], c) ? -32 : -12,
              }}
            >
              <DdzCard
                card={c}
                size="lg"
                selected={selected.includes(c)}
                onClick={myTurn ? () => toggle(c) : undefined}
              />
            </div>
          ))}
        </div>

        <div className="ddz-actions">
          {pending?.kind === 'bid' ? (
            <>
              <span className="prompt">叫地主？</span>
              <button className="ghost-btn" onClick={() => pending.resolve(0)}>
                不叫
              </button>
              {[1, 2, 3]
                .filter((s) => s > pending.min)
                .map((s) => (
                  <button key={s} className="primary-btn" onClick={() => pending.resolve(s)}>
                    {s} 分
                  </button>
                ))}
            </>
          ) : myTurn ? (
            <>
              <button className="ghost-btn" onClick={hint} title="Tab">
                提示
              </button>
              <button
                className="ghost-btn"
                disabled={mustPlay}
                title={mustPlay ? '轮到你自由出牌，不能不要' : 'Esc'}
                onClick={() => pending!.resolve({ kind: 'pass' })}
              >
                不要
              </button>
              <button
                className="primary-btn"
                disabled={!canPlay}
                title="空格"
                onClick={() => pending!.resolve({ kind: 'play', cards: selected })}
              >
                出牌
              </button>
              <span className="picked">
                {selected.length === 0
                  ? '点牌选中'
                  : picked
                    ? canPlay
                      ? describeCombo(picked)
                      : `${describeCombo(picked)} —— 压不住`
                    : '不成牌型'}
              </span>
            </>
          ) : (
            <span className="prompt dim">
              {view.phase === 'bidding' ? '等别人叫地主…' : '等别人出牌…'}
            </span>
          )}

          <div className="ddz-scores">
            {roster.map((r) => (
              <span key={r.seat} className={r.seat === me ? 'me' : ''}>
                {r.name} {fmt(scores[r.seat as Seat] ?? 0)}
              </span>
            ))}
          </div>
        </div>
      </footer>

      {result && (
        <div className="ddz-result" onClick={() => setResult(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2 className={result.landlordWon ? 'lord' : 'farmer'}>
              {result.landlordWon ? '地主赢' : '农民赢'}
            </h2>
            <p className="mult">
              {result.base} 分 × {result.multiplier} 倍
              {result.spring === 'spring' && <em>　春天</em>}
              {result.spring === 'anti' && <em>　反春天</em>}
            </p>
            <div className="reveal">
              {result.revealed.map((r) => (
                <div key={r.seat} className="rrow">
                  <span className="rname">{roster[r.seat]?.name ?? r.seat}</span>
                  <span className={`rdelta ${result.deltas.find((d) => d.seat === r.seat)!.delta >= 0 ? 'up' : 'down'}`}>
                    {fmt(result.deltas.find((d) => d.seat === r.seat)!.delta)}
                  </span>
                  <span className="rcards">
                    {r.cards.length ? formatRanks(r.cards) : '出完'}
                  </span>
                </div>
              ))}
            </div>
            <button className="primary-btn" onClick={() => setResult(null)}>
              下一局
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`)
const sameRank = (a: Card, b: Card) =>
  (a >= 52 ? a : a >> 2) === (b >= 52 ? b : b >> 2)

function Top({
  gameNo,
  view,
  onBack,
  onStand,
}: {
  gameNo: number
  view: { base: number; multiplier: number } | null
  onBack: () => void
  onStand: () => void
}) {
  return (
    <header className="ddz-top">
      <div className="brand">DOLOS</div>
      <div className="meta">
        <span>第 {gameNo} 局</span>
        {view && (
          <span className="dim">
            {view.base} 分 · {view.multiplier} 倍
          </span>
        )}
      </div>
      <div className="tools">
        <SoundToggle variant="dark" />
        <button className="ghost-btn" onClick={onBack}>
          回房间
        </button>
        <button className="ghost-btn" onClick={onStand}>
          离开
        </button>
      </div>
      <div className="playmoney">虚拟积分 · 不可充值提现</div>
    </header>
  )
}

/** 摆在台面上的一手牌。三家共用，只有位置和尺寸不同 */
function Played({
  className,
  placed,
  size,
}: {
  className: string
  placed: { combo: { cards: Card[] } | null } | null
  size: 'xs' | 'sm' | 'md'
}) {
  if (!placed) return null
  return (
    <div className={`ddz-pile ${className}`}>
      {placed.combo ? (
        <CardRow cards={placed.combo.cards} size={size} overlap={0.5} />
      ) : (
        <div className="pass-mark">不要</div>
      )}
    </div>
  )
}

function Opponent({
  side,
  p,
  roster,
  thinking,
  turn,
}: {
  side: 'left' | 'right'
  p?: { name: string; count: number; isLandlord: boolean; color: string }
  roster?: { name: string; color: string }
  thinking: boolean
  turn: boolean
}) {
  if (!p) return null
  return (
    <div className={`ddz-opp ${side}${turn ? ' turn' : ''}`}>
      <div className="who">
        <Avatar color={roster?.color ?? p.color} size={34} />
        <div className="info">
          <div className="name">
            {p.name}
            {p.isLandlord && <span className="lordbadge">地主</span>}
          </div>
          {/* 剩几张牌一直摆在这儿。斗地主全部的紧张感就在这个数字上 */}
          <div className={`left${p.count <= 3 ? ' hot' : ''}`}>{p.count} 张</div>
        </div>
      </div>
      {thinking && <div className="thinking">…</div>}
    </div>
  )
}
