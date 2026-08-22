import { useEffect, useMemo, useRef, useState } from 'react'
import { useLobby } from '../../lobby/useLobby'
import { useRoster } from '../../games/seats'
import { RESOURCES, RESOURCE_NAMES, type Resource } from '../../catan/board'
import { startCatanSession } from '../../catan/session'
import { optionsOf, useCatan } from '../../catan/useCatan'
import { COSTS, VP_TO_WIN } from '../../catan/engine'
import { DEV_NAMES, emptyHand, handSize, type CatanAction, type DevKind, type Hand, type Seat } from '../../catan/types'
import { Avatar } from '../match/Avatar'
import { CatanBoard } from './CatanBoard'

/**
 * 全屏卡坦岛。
 *
 * 这个界面唯一的设计原则：**能点的地方自己会亮**。
 * 卡坦的规则面比牌类游戏宽得多（距离规则、路要连着、港口汇率、
 * 发展卡这回合能不能用……），指望玩家读懂规则再去点是不现实的。
 * 所以合法性完全交给引擎的 `legal()`，界面只把它翻译成高亮 ——
 * 界面自己不判断任何一条规则，也就不可能和引擎判得不一样。
 */
export function CatanTable() {
  const back = useLobby((s) => s.endGame)
  const stand = useLobby((s) => s.leave)
  const roster = useRoster(4)

  const view = useCatan((s) => s.view)
  const pending = useCatan((s) => s.pending)
  const log = useCatan((s) => s.log)
  const thinking = useCatan((s) => s.thinking)
  const lastRoll = useCatan((s) => s.lastRoll)
  const result = useCatan((s) => s.result)

  /** 界面自己的一个小状态：现在正在"选一条路"还是"选一个路口" */
  const [mode, setMode] = useState<null | 'road' | 'settlement' | 'city'>(null)
  const [sheet, setSheet] = useState<null | 'trade' | 'dev'>(null)
  const [discard, setDiscard] = useState<Hand>(emptyHand())
  const [victims, setVictims] = useState<null | { hex: number; options: Seat[] }>(null)

  useEffect(() => {
    if (roster.length !== 4) return
    return startCatanSession({ seats: roster })
  }, [roster])

  const logBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight
  }, [log])

  const opts = pending?.options
  const phase = view?.phase
  const myTurn = !!pending

  // 待决动作一换，选牌模式就清掉，否则上一轮的高亮会留在屏幕上
  useEffect(() => {
    setMode(null)
    setVictims(null)
    setDiscard(emptyHand())
  }, [pending])

  /** 高亮：全部从合法选项推出来，界面不判断规则 */
  const highlight = useMemo(() => {
    const vs = new Set<number>()
    const es = new Set<number>()
    const hs = new Set<number>()
    if (!opts) return { vs, es, hs }
    if (phase === 'setup') {
      for (const o of optionsOf(opts, 'place_settlement')) vs.add(o.vertex)
      for (const o of optionsOf(opts, 'place_road')) es.add(o.edge)
    }
    if (phase === 'move_robber') for (const o of optionsOf(opts, 'move_robber')) hs.add(o.hex)
    if (phase === 'build') {
      if (mode === 'road') for (const o of optionsOf(opts, 'build_road')) es.add(o.edge)
      if (mode === 'settlement') for (const o of optionsOf(opts, 'build_settlement')) vs.add(o.vertex)
      if (mode === 'city') for (const o of optionsOf(opts, 'build_city')) vs.add(o.vertex)
      // 修路卡的免费路：没得选，直接进选边模式
      if ((view?.freeRoads ?? 0) > 0) for (const o of optionsOf(opts, 'build_road')) es.add(o.edge)
    }
    return { vs, es, hs }
  }, [opts, phase, mode, view?.freeRoads])

  const send = (a: CatanAction) => {
    pending?.resolve(a)
    setMode(null)
    setSheet(null)
  }

  if (!view) {
    return (
      <div className="catan">
        <Top turnNo={0} onBack={back} onStand={stand} />
        <div className="catan-loading">正在铺棋盘…</div>
      </div>
    )
  }

  const me = view.players.find((p) => p.seat === view.me)!
  const colors: Record<Seat, string> = Object.fromEntries(
    view.players.map((p) => [p.seat, roster[p.seat]?.color ?? p.color]),
  )
  const need = phase === 'discard' ? Math.floor(handSize(view.myHand) / 2) : 0

  return (
    <div className="catan">
      <Top turnNo={view.turnNo} onBack={back} onStand={stand} />

      <div className="catan-body">
        <div className="catan-stage">
          <CatanBoard
            board={view.board}
            buildings={view.buildings}
            roads={view.roads}
            colors={colors}
            legalVertices={highlight.vs}
            legalEdges={highlight.es}
            legalHexes={highlight.hs}
            onVertex={(v) => {
              if (phase === 'setup') return send({ kind: 'place_settlement', vertex: v })
              if (mode === 'settlement') return send({ kind: 'build_settlement', vertex: v })
              if (mode === 'city') return send({ kind: 'build_city', vertex: v })
            }}
            onEdge={(e) => {
              if (phase === 'setup') return send({ kind: 'place_road', edge: e })
              return send({ kind: 'build_road', edge: e })
            }}
            onHex={(h) => {
              const targets = optionsOf(opts, 'move_robber')
                .filter((o) => o.hex === h && o.steal !== null)
                .map((o) => o.steal as Seat)
              // 一块地上可能挨着好几家，抢谁得让玩家自己挑
              if (targets.length > 1) return setVictims({ hex: h, options: targets })
              send({ kind: 'move_robber', hex: h, steal: targets[0] ?? null })
            }}
          />
          {lastRoll && <Dice dice={lastRoll.dice} key={lastRoll.at} />}
          {victims && (
            <div className="catan-victims">
              <span>抢谁？</span>
              {victims.options.map((s) => (
                <button
                  key={s}
                  className="ghost-btn"
                  onClick={() => send({ kind: 'move_robber', hex: victims.hex, steal: s })}
                >
                  {view.players.find((p) => p.seat === s)?.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="catan-side">
          <div className="catan-players">
            {view.players.map((p) => (
              <div
                key={p.seat}
                className={`crow${view.turn === p.seat ? ' turn' : ''}${thinking === p.seat ? ' thinking' : ''}`}
              >
                <Avatar color={colors[p.seat]} size={26} />
                <div className="cinfo">
                  <div className="cname">
                    {p.seat === view.me ? '你' : p.name}
                    {p.hasLongestRoad && <span className="badge road">最长路</span>}
                    {p.hasLargestArmy && <span className="badge army">最大军</span>}
                  </div>
                  <div className="cstats">
                    手牌 {p.handCount} · 发展卡 {p.devCount} · 骑士 {p.playedKnights}
                  </div>
                </div>
                <div className="cvp" title="公开分，不含对手扣着的胜利点卡">
                  {p.publicVp}
                </div>
              </div>
            ))}
          </div>
          <div className="catan-log" ref={logBox}>
            {log.map((r) => (
              <div key={r.id} className={`row ${r.kind}`}>
                {r.text}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <footer className="catan-foot">
        <div className="catan-hand">
          {RESOURCES.map((r) => (
            <div key={r} className={`res ${r}${view.myHand[r] === 0 ? ' zero' : ''}`}>
              <b>{RESOURCE_NAMES[r]}</b>
              <span>{view.myHand[r]}</span>
            </div>
          ))}
          <div className="res dev">
            <b>发展卡</b>
            <span>{view.myDev.length}</span>
          </div>
          <div className="res vp">
            <b>胜利点</b>
            <span>
              {me.publicVp + view.myDev.filter((d) => d === 'victory_point').length}/{VP_TO_WIN}
            </span>
          </div>
        </div>

        <div className="catan-actions">
          {!myTurn ? (
            <span className="prompt dim">
              {thinking !== null ? `${view.players.find((p) => p.seat === thinking)?.name} 在想…` : '等别人行动…'}
            </span>
          ) : phase === 'setup' ? (
            <span className="prompt">
              {view.setupNeedsRoad ? '点一条高亮的边，摆下第一条路' : '点一个高亮的路口，摆下村庄'}
            </span>
          ) : phase === 'discard' ? (
            <DiscardBar
              hand={view.myHand}
              need={need}
              picked={discard}
              onPick={setDiscard}
              onSend={() => send({ kind: 'discard', give: discard })}
            />
          ) : phase === 'move_robber' ? (
            <span className="prompt">点一块地，把强盗放上去</span>
          ) : phase === 'roll' ? (
            <>
              <button className="primary-btn" onClick={() => send({ kind: 'roll' })}>
                掷骰
              </button>
              {optionsOf(opts, 'play_knight').length > 0 && (
                <button className="ghost-btn" onClick={() => send({ kind: 'play_knight' })}>
                  先打骑士
                </button>
              )}
            </>
          ) : view.freeRoads > 0 ? (
            <span className="prompt">修路卡：还能免费铺 {view.freeRoads} 条，点高亮的边</span>
          ) : (
            <BuildBar
              opts={opts ?? []}
              mode={mode}
              setMode={setMode}
              sheet={sheet}
              setSheet={setSheet}
              hand={view.myHand}
              dev={view.myDev}
              devFresh={view.myDevFresh}
              send={send}
            />
          )}
        </div>
      </footer>

      {result && (
        <div className="catan-result">
          <div className="card">
            <h2>{result.seat === view.me ? '你赢了' : `${view.players.find((p) => p.seat === result.seat)?.name} 赢了`}</h2>
            <p className="dim">{result.vp} 分</p>
            <button className="primary-btn" onClick={back}>
              回房间
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Top({ turnNo, onBack, onStand }: { turnNo: number; onBack: () => void; onStand: () => void }) {
  return (
    <header className="catan-top">
      <div className="brand">DOLOS</div>
      <div className="meta">
        <span>{turnNo === 0 ? '开局摆放' : `第 ${turnNo} 回合`}</span>
        <span className="dim">先到 {VP_TO_WIN} 分</span>
      </div>
      <div className="tools">
        <button className="ghost-btn" onClick={onBack}>
          回房间
        </button>
        <button className="ghost-btn" onClick={onStand}>
          离开
        </button>
      </div>
    </header>
  )
}

/** 骰子。掷完弹一下就淡出 —— 数字在日志里，这里只是给个手感 */
function Dice({ dice }: { dice: [number, number] }) {
  return (
    <div className="catan-dice">
      <span>{dice[0]}</span>
      <span>{dice[1]}</span>
    </div>
  )
}

function DiscardBar({
  hand,
  need,
  picked,
  onPick,
  onSend,
}: {
  hand: Hand
  need: number
  picked: Hand
  onPick: (h: Hand) => void
  onSend: () => void
}) {
  const total = handSize(picked)
  return (
    <>
      <span className="prompt">
        掷出了 7，你要弃 <b>{need}</b> 张（已选 {total}）
      </span>
      {RESOURCES.map((r) => (
        <div key={r} className="discard-pick">
          <button
            className="ghost-btn tiny"
            disabled={picked[r] === 0}
            onClick={() => onPick({ ...picked, [r]: picked[r] - 1 })}
          >
            −
          </button>
          <span className="dl">
            {RESOURCE_NAMES[r]} {picked[r]}/{hand[r]}
          </span>
          <button
            className="ghost-btn tiny"
            disabled={picked[r] >= hand[r] || total >= need}
            onClick={() => onPick({ ...picked, [r]: picked[r] + 1 })}
          >
            +
          </button>
        </div>
      ))}
      <button className="primary-btn" disabled={total !== need} onClick={onSend}>
        弃牌
      </button>
    </>
  )
}

const costText = (c: Partial<Hand>) =>
  RESOURCES.filter((r) => c[r]).map((r) => `${RESOURCE_NAMES[r]}×${c[r]}`).join(' ')

function BuildBar({
  opts,
  mode,
  setMode,
  sheet,
  setSheet,
  hand,
  dev,
  devFresh,
  send,
}: {
  opts: CatanAction[]
  mode: null | 'road' | 'settlement' | 'city'
  setMode: (m: null | 'road' | 'settlement' | 'city') => void
  sheet: null | 'trade' | 'dev'
  setSheet: (s: null | 'trade' | 'dev') => void
  hand: Hand
  dev: DevKind[]
  devFresh: number
  send: (a: CatanAction) => void
}) {
  const canRoad = optionsOf(opts, 'build_road').length > 0
  const canSett = optionsOf(opts, 'build_settlement').length > 0
  const canCity = optionsOf(opts, 'build_city').length > 0
  const canBuy = opts.some((o) => o.kind === 'buy_dev')
  const trades = optionsOf(opts, 'bank_trade')
  const playable = opts.filter(
    (o) =>
      o.kind === 'play_knight' ||
      o.kind === 'play_road_building' ||
      o.kind === 'play_monopoly' ||
      o.kind === 'play_year_of_plenty',
  )

  return (
    <>
      <button
        className={`ghost-btn${mode === 'road' ? ' on' : ''}`}
        disabled={!canRoad}
        title={`路：${costText(COSTS.road)}`}
        onClick={() => setMode(mode === 'road' ? null : 'road')}
      >
        建路
      </button>
      <button
        className={`ghost-btn${mode === 'settlement' ? ' on' : ''}`}
        disabled={!canSett}
        title={`村庄：${costText(COSTS.settlement)}`}
        onClick={() => setMode(mode === 'settlement' ? null : 'settlement')}
      >
        建村庄
      </button>
      <button
        className={`ghost-btn${mode === 'city' ? ' on' : ''}`}
        disabled={!canCity}
        title={`城市：${costText(COSTS.city)}`}
        onClick={() => setMode(mode === 'city' ? null : 'city')}
      >
        升城市
      </button>
      <button
        className="ghost-btn"
        disabled={!canBuy}
        title={`发展卡：${costText(COSTS.dev)}`}
        onClick={() => send({ kind: 'buy_dev' })}
      >
        买发展卡
      </button>
      <button
        className={`ghost-btn${sheet === 'trade' ? ' on' : ''}`}
        disabled={trades.length === 0}
        onClick={() => setSheet(sheet === 'trade' ? null : 'trade')}
      >
        换银行
      </button>
      <button
        className={`ghost-btn${sheet === 'dev' ? ' on' : ''}`}
        disabled={dev.length === 0}
        onClick={() => setSheet(sheet === 'dev' ? null : 'dev')}
      >
        发展卡 {dev.length}
      </button>
      <button className="primary-btn" onClick={() => send({ kind: 'end_turn' })}>
        结束回合
      </button>

      {mode && <span className="prompt hintline">点棋盘上高亮的位置</span>}

      {sheet === 'trade' && (
        <div className="catan-sheet">
          <div className="sheet-title">和银行换牌</div>
          {RESOURCES.map((give) => {
            const rows = trades.filter((t) => t.give === give)
            if (rows.length === 0) return null
            return (
              <div key={give} className="traderow">
                <span className="tl">
                  {rows[0].rate} 张{RESOURCE_NAMES[give]}（有 {hand[give]}）换
                </span>
                {rows.map((t) => (
                  <button key={t.want} className="ghost-btn tiny" onClick={() => send(t)}>
                    {RESOURCE_NAMES[t.want]}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {sheet === 'dev' && (
        <div className="catan-sheet">
          <div className="sheet-title">
            发展卡
            {devFresh > 0 && <em>　本回合买的 {devFresh} 张要下回合才能用</em>}
          </div>
          {dev.length === 0 && <div className="dim">没有发展卡</div>}
          {[...new Set(dev)].map((k) => {
            const n = dev.filter((d) => d === k).length
            const play = playable.find((o) => o.kind === `play_${k}`)
            return (
              <div key={k} className="devrow">
                <span className="dl">
                  {DEV_NAMES[k]} ×{n}
                </span>
                {k === 'victory_point' ? (
                  <span className="dim">直接算分，不用打</span>
                ) : k === 'monopoly' ? (
                  RESOURCES.map((r) => (
                    <button
                      key={r}
                      className="ghost-btn tiny"
                      disabled={!playable.some((o) => o.kind === 'play_monopoly')}
                      onClick={() => send({ kind: 'play_monopoly', res: r })}
                    >
                      {RESOURCE_NAMES[r]}
                    </button>
                  ))
                ) : k === 'year_of_plenty' ? (
                  <YearOfPlenty
                    enabled={playable.some((o) => o.kind === 'play_year_of_plenty')}
                    send={send}
                  />
                ) : (
                  <button className="ghost-btn tiny" disabled={!play} onClick={() => play && send(play)}>
                    打出
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function YearOfPlenty({ enabled, send }: { enabled: boolean; send: (a: CatanAction) => void }) {
  const [a, setA] = useState<Resource>('brick')
  return (
    <>
      <select className="mini-select" value={a} onChange={(e) => setA(e.target.value as Resource)}>
        {RESOURCES.map((r) => (
          <option key={r} value={r}>
            {RESOURCE_NAMES[r]}
          </option>
        ))}
      </select>
      {RESOURCES.map((b) => (
        <button
          key={b}
          className="ghost-btn tiny"
          disabled={!enabled}
          onClick={() => send({ kind: 'play_year_of_plenty', a, b })}
        >
          +{RESOURCE_NAMES[b]}
        </button>
      ))}
    </>
  )
}
