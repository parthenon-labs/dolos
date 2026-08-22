import { apply, legal, makeGame, project, totalVp, whoActs, type EngineState, type Seats } from './engine'
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
