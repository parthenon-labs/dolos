import { RuleBot, type PokerAgent } from './agent'
import { project } from './engine'
import { nextButton, runHand, type TableSeat } from './table'
import type { Action, PlayerView, PokerEvent, Seat, TableConfig } from './types'
import { sfx } from '../audio/sfx'
import { useLobby } from '../lobby/useLobby'
import { describeEvent, useTable } from './useTable'

/**
 * 在浏览器里连开若干手牌，你坐一个位置，其余座位由 bot 填。
 *
 * **这是原型形态**：真正上线时牌局跑在服务端，这里换成 WebSocket 收事件。
 * `describeEvent` 和整个界面只认 PokerEvent，所以那一步不用改渲染。
 */

/** 人类玩家：动作挂成 Promise，等界面点了才 resolve */
class HumanAgent implements PokerAgent {
  constructor(readonly name: string) {}
  act(view: PlayerView): Promise<Action> {
    useTable.getState().setView(view)
    return new Promise<Action>((resolve) => {
      useTable.getState().setPending({
        view,
        resolve: (a) => {
          useTable.getState().setPending(null)
          resolve(a)
        },
      })
    })
  }
}

/**
 * 每类事件之后停多久。
 *
 * 引擎算完一手牌只要几毫秒 —— 不刻意放慢的话，玩家点完"跟注"
 * 会直接看到结算画面，中间发生了什么完全不知道。
 * 这些数字是**体验参数**，不是技术限制，将来要按真人节奏调。
 */
const PACE: Partial<Record<PokerEvent['t'], number>> = {
  blinds: 400,
  hole_dealt: 90,
  acted: 620,
  street: 900,
  showdown: 1600,
  awarded: 2000,
  hand_ended: 900,
}

export type SessionOptions = {
  seats: TableSeat[]
  mySeat: Seat
  config?: TableConfig
  hands?: number
}

/**
 * 德州的"一局"是一整个牌桌 session，不是一手牌。
 *
 * 所以战绩在**这张桌子结束的时候**记一次，记的是净输赢筹码。
 * 按手记的话，连打两百手会把房间战绩刷成一面墙，
 * 而那面墙说明不了任何事 —— 玩家想知道的是"这一坐下来赚了还是亏了"。
 */
function reportTable(seats: TableSeat[], startingStack: number) {
  useLobby.getState().recordResult(
    seats.map((s) => ({
      name: s.name,
      delta: s.stack - startingStack,
      won: s.stack > startingStack,
    })),
  )
}

export function startSession(opts: SessionOptions): () => void {
  const config = opts.config ?? { smallBlind: 1, bigBlind: 2, startingStack: 200 }
  const maxHands = opts.hands ?? 200

  const t = useTable.getState()
  t.reset()

  let stopped = false
  let reported = false
  const seats = opts.seats.map((s) => ({ ...s }))

  /**
   * 记一次战绩，只记一次。
   *
   * 触发点有两个：牌桌自然结束（输光 / 打满 / 筹码归一），
   * 以及**玩家中途回房间** —— 后者才是常见情况。
   * 只在自然结束时记的话，打了三十手觉得够了就走的人，战绩永远是空的。
   */
  const report = () => {
    if (reported) return
    reported = true
    reportTable(seats, config.startingStack)
  }
  const nameOf = (s: Seat) => seats.find((x) => x.seat === s)?.name ?? `${s + 1} 号`

  const agents = new Map<Seat, PokerAgent>()
  for (const s of seats) {
    agents.set(
      s.seat,
      s.seat === opts.mySeat
        ? new HumanAgent(s.name)
        // 每个 bot 给不同的松紧度，一桌人才不像同一个人在打
        : new RuleBot(s.name, s.seat * 7919 + 13, 0.25 + ((s.seat * 37) % 10) / 14),
    )
  }

  let rngState = Date.now() % 2147483647
  const rng = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

  const sleep = (ms: number) =>
    new Promise<void>((r) => setTimeout(r, ms))

  ;(async () => {
    let button = opts.mySeat
    for (let hand = 1; hand <= maxHands && !stopped; hand++) {
      const withChips = seats.filter((s) => s.stack > 0)
      if (withChips.length < 2) {
        useTable.getState().push('筹码只剩一个人有，本桌结束', 'system')
        useTable.getState().setOver({
          title: '本桌结束',
          detail: '筹码全到一个人手里了',
        })
        report()
        break
      }
      if (!withChips.some((s) => s.seat === opts.mySeat)) {
        useTable.getState().push('你已经输光了', 'system')
        useTable.getState().setOver({
          title: '你输光了',
          detail: `撑了 ${hand - 1} 手`,
        })
        report()
        break
      }

      button = nextButton(seats, button)
      useTable.getState().newHand(hand)

      // 事件按节奏排队播出，而不是瞬间刷屏
      const queue: PokerEvent[] = []
      let draining = false
      const drain = async () => {
        if (draining) return
        draining = true
        while (queue.length > 0 && !stopped) {
          const e = queue.shift()!
          apply(e)
          await sleep(PACE[e.t] ?? 120)
        }
        draining = false
      }

      const apply = (e: PokerEvent) => {
        const st = useTable.getState()
        // 声音只跟这几件事：发牌、下注、开街、结算。
        // 每个事件都响会糊成一片，反而听不出发生了什么
        if (e.t === 'hole_dealt') sfx('deal')
        else if (e.t === 'acted') sfx(e.action.kind === 'fold' ? 'back' : 'chip')
        else if (e.t === 'street') sfx('card')
        else if (e.t === 'awarded') sfx(e.rows.some((r) => r.seat === 0 && r.won > 0) ? 'win' : 'lose')
        const d = describeEvent(e, nameOf)
        if (d) st.push(d.text, d.kind)
        if (e.t === 'acted') st.setLastActor(e.seat)
        if (e.t === 'showdown') {
          st.setShowdown(
            e.revealed.map((r) => ({ seat: r.seat, label: r.label, best: r.best })),
          )
        }
        if (e.t === 'awarded') {
          st.setAwarded(e.rows.filter((r) => r.won > 0).map((r) => ({ seat: r.seat, won: r.won })))
        }
      }

      const r = await runHand(
        config,
        seats,
        button,
        hand,
        agents,
        rng,
        (e) => {
          queue.push(e)
          void drain()
        },
      )

      // 引擎跑完了，但事件可能还没播完 —— 等它播完再结算下一手
      while (queue.length > 0 && !stopped) await sleep(120)

      // 把筹码写回牌桌
      for (const s of seats) {
        const p = r.state.players.find((x) => x.seat === s.seat)
        if (p) s.stack = p.stack
      }
      // 最终视图（含摊牌信息）给界面
      if (!stopped) useTable.getState().setView(project(r.state, opts.mySeat))
      await sleep(1400)
      if (hand === maxHands) {
        useTable.getState().setOver({ title: '打满了', detail: `${maxHands} 手，到此为止` })
        report()
      }
    }
  })().catch((err) => {
    // 引擎抛错说明是 bug（多半是筹码不守恒的断言），必须显式暴露
    console.error('[poker] 牌局异常中断', err)
    useTable.getState().push(`牌局异常中断：${(err as Error).message}`, 'system')
  })

  return () => {
    stopped = true
    useTable.getState().setPending(null)
    // 离开房间时 myRoomId 已经清了，recordResult 会自己 no-op ——
    // 走人不该往一个已经离开的房间里记账
    report()
  }
}
