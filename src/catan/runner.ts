import {
  applyTrade,
  apply,
  canTrade,
  legal,
  makeGame,
  project,
  totalVp,
  whoActs,
  type EngineState,
  type Seats,
} from './engine'
import type { CatanAgent } from './bot'
import type { CatanAction, CatanEvent, Seat } from './types'

/**
 * 驱动一整局。
 *
 * 和牌类游戏的 runner 不一样：这里没有"一手牌"的固定流程，
 * 只有 **"问谁该动 → 列出他能做什么 → 让他挑 → 执行"** 的循环。
 * 回合的结构完全由引擎的相位决定，runner 一行规则都不知道。
 */

export type CatanResult = {
  state: EngineState
  winner: Seat | null
  /** 到底打了多少步。跑飞了要看这个 */
  steps: number
  vps: { seat: Seat; vp: number }[]
}

export async function runGame(
  seats: Seats,
  agents: Map<Seat, CatanAgent>,
  rng: () => number,
  emit: (e: CatanEvent) => void,
  /**
   * 步数上限。**不是保险丝，是断言的一部分** ——
   * 正常一局大概两三千步就结束了，撞到上限说明有人卡住了，
   * 那是 bug，不该悄悄当成平局
   */
  maxSteps = 20000,
): Promise<CatanResult> {
  const s = makeGame(seats, rng)
  let steps = 0

  while (s.winner === null && steps < maxSteps) {
    const seat = whoActs(s)
    const opts = legal(s, seat)
    if (opts.length === 0) {
      // 建造阶段无事可做只可能是选项被算漏了 —— end_turn 永远在列表里
      throw new Error(`${seat} 号在 ${s.phase} 阶段没有任何合法动作，这是引擎 bug`)
    }
    const a: CatanAction = await agents.get(seat)!.act(project(s, seat), opts)

    /**
     * 交易要问一圈，所以它不能只是 `apply` 一下。
     *
     * 引擎保持纯的：它只提供"这笔交易成不成立"和"成交"。
     * **谁愿意接是对局流程的事，不是规则的事** —— 放进 apply 里
     * 就等于让引擎去 await 别的 agent，那条线一旦拉出来就收不回去了。
     *
     * 按座位顺序问，先答应的先成交。真人桌上也是这样。
     */
    if (a.kind === 'offer_trade') {
      apply(s, seat, a, rng, emit)
      let done = false
      for (let k = 1; k < s.players.length && !done; k++) {
        const other = s.players[(seat + k) % s.players.length].seat
        if (!canTrade(s, seat, other, a.give, a.want)) continue
        const yes = await agents.get(other)!.respondTrade?.(project(s, other), {
          from: seat,
          give: a.give,
          want: a.want,
        })
        if (yes && canTrade(s, seat, other, a.give, a.want)) {
          applyTrade(s, seat, other, a.give, a.want, emit)
          done = true
        }
      }
      if (!done) emit({ t: 'trade_refused', from: seat })
      steps++
      continue
    }

    apply(s, seat, a, rng, emit)
    steps++
  }

  return {
    state: s,
    winner: s.winner,
    steps,
    vps: s.players.map((p) => ({ seat: p.seat, vp: totalVp(s, p.seat) })),
  }
}
