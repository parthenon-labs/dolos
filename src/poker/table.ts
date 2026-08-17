import { applyAction, project, seatOf, startHand } from './engine'
import type { PokerAgent } from './agent'
import type { HandState, PokerEvent, Seat, TableConfig } from './types'

/**
 * 连续开一手又一手，管钮位轮转和破产。
 *
 * 一手牌的规则在 engine 里，这里只管"牌桌"这一层：
 * 谁还在、钮位转到哪、什么时候该结束这一桌。
 */

export type TableSeat = {
  seat: Seat
  name: string
  color: string
  isAI: boolean
  stack: number
}

export type RunHandResult = {
  state: HandState
  events: PokerEvent[]
  /** agent 给了非法动作、被引擎纠正的次数。这本身是个能力指标 */
  corrections: number
}

export async function runHand(
  config: TableConfig,
  seats: TableSeat[],
  button: Seat,
  handNo: number,
  agents: Map<Seat, PokerAgent>,
  rng: () => number,
  onEvent?: (e: PokerEvent) => void,
): Promise<RunHandResult> {
  const events: PokerEvent[] = []
  let corrections = 0
  const emit = (e: PokerEvent) => {
    events.push(e)
    // 回调里抛错不该中断牌局 —— 它是观察者，不是参与者
    try {
      onEvent?.(e)
    } catch (err) {
      console.error('[poker] 事件回调抛错', err)
    }
  }

  const seedForHand = Math.floor(rng() * 1e9)
  let x = seedForHand
  const handRng = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

  const s = startHand(config, seats, button, handNo, handRng)
  emit({ t: 'hand_started', handNo, button, seed: seedForHand })

  const live = s.players.filter((p) => !p.sittingOut)
  const heads = live.length === 2
  const sb = heads ? button : nextLive(s, button)
  const bb = nextLive(s, sb)
  emit({
    t: 'blinds',
    small: sb,
    big: bb,
    smallAmount: Math.min(config.smallBlind, seatOf(s, sb).totalCommitted),
    bigAmount: seatOf(s, bb).totalCommitted,
  })
  for (const p of live) emit({ t: 'hole_dealt', seat: p.seat })

  let street = s.street
  let guard = 0
  while (!s.finished && guard++ < 400) {
    const seat = s.turn
    if (seat === null) break

    const agent = agents.get(seat)
    let action = { kind: 'fold' as const }
    if (agent) {
      try {
        action = (await agent.act(project(s, seat))) as typeof action
      } catch (err) {
        // agent 抛错就当弃牌，但要记一笔 —— 静默弃牌会让人以为是策略
        console.error(`[poker] 座位 ${seat} 的 agent 抛错，按弃牌处理`, err)
        corrections++
      }
    }

    const before = JSON.stringify(action)
    const { applied } = applyAction(s, seat, action)
    if (JSON.stringify(applied) !== before && applied.kind !== action.kind) corrections++

    emit({
      t: 'acted',
      seat,
      action: applied,
      committed: seatOf(s, seat).committed,
      stack: seatOf(s, seat).stack,
    })

    if (s.street !== street) {
      street = s.street
      if (street !== 'showdown') {
        emit({ t: 'street', street, board: s.board.slice() })
      }
      emit({ t: 'pots', pots: s.pots.map((p) => ({ ...p, eligible: [...p.eligible] })) })
    }
  }

  const revealed = s.results
    .filter((r) => r.hand)
    .map((r) => ({
      seat: r.seat,
      cards: seatOf(s, r.seat).cards.slice(),
      label: r.hand!.label,
    }))
  if (revealed.length > 0) emit({ t: 'showdown', revealed })
  emit({ t: 'awarded', rows: s.results })
  emit({ t: 'hand_ended', handNo })

  return { state: s, events, corrections }
}

function nextLive(s: HandState, from: Seat): Seat {
  const n = s.players.length
  const i = s.players.findIndex((p) => p.seat === from)
  for (let k = 1; k <= n; k++) {
    const p = s.players[(i + k) % n]
    if (!p.sittingOut) return p.seat
  }
  return from
}

/**
 * 钮位轮转到下一个还有筹码的座位。
 *
 * 破产的人被跳过。真实牌桌上钮位是"死钮"规则更复杂，
 * 这里先用简化版 —— 只有一桌人都在的休闲局，差别看不出来。
 */
export function nextButton(seats: TableSeat[], button: Seat): Seat {
  const n = seats.length
  const i = seats.findIndex((p) => p.seat === button)
  for (let k = 1; k <= n; k++) {
    const p = seats[(i + k) % n]
    if (p.stack > 0) return p.seat
  }
  return button
}
