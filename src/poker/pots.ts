import type { HandResultRow, PlayerState, Pot, Seat } from './types'

/**
 * 边池计算和分配。
 *
 * **这是第二个算错就直接把钱分错的地方**（第一个是牌力评估）。
 * 边池的规则本身不难，难在它只在 all-in 时才出现，
 * 而 all-in 在测试里不会自然发生 —— 所以必须专门造用例。
 *
 * 规则：一个玩家最多只能赢走"每个对手中不超过自己投入额的那部分"。
 * 实现方式是按投入额分层：把所有不同的投入额从小到大排，
 * 每一层收所有人在这一层内的投入，形成一个池；
 * 有资格争这个池的是投入达到该层的、且没弃牌的人。
 */

/**
 * 按各人的累计投入分层建池。
 *
 * 弃牌的人**钱要留在池里**，但没资格争 —— 这是最容易写错的一点：
 * 直接把弃牌的人从分层里剔掉，会让底池凭空少一块。
 */
export function buildPots(players: PlayerState[]): Pot[] {
  const contributors = players.filter((p) => p.totalCommitted > 0)
  if (contributors.length === 0) return []

  const levels = [...new Set(contributors.map((p) => p.totalCommitted))].sort(
    (a, b) => a - b,
  )

  const pots: Pot[] = []
  let prev = 0
  for (const level of levels) {
    let amount = 0
    for (const p of contributors) {
      // 每个人在这一层里贡献 min(他的投入, level) - prev
      amount += Math.max(0, Math.min(p.totalCommitted, level) - prev)
    }
    // 有资格的人：投入达到这一层，且还在牌局里
    const eligible = contributors
      .filter((p) => p.totalCommitted >= level && !p.folded)
      .map((p) => p.seat)

    if (amount > 0) {
      // 只有一个人有资格时，和上一个池合并没有意义 —— 保持分层，
      // 界面上"主池/边池"分开显示本身就是信息
      pots.push({ amount, eligible })
    }
    prev = level
  }

  return mergeAdjacent(pots)
}

/** 相邻且资格完全相同的池合并，否则界面上会出现一堆无意义的小池 */
function mergeAdjacent(pots: Pot[]): Pot[] {
  const out: Pot[] = []
  for (const p of pots) {
    const last = out[out.length - 1]
    if (last && sameSeats(last.eligible, p.eligible)) {
      last.amount += p.amount
    } else {
      out.push({ amount: p.amount, eligible: p.eligible.slice() })
    }
  }
  return out
}

const sameSeats = (a: Seat[], b: Seat[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

/**
 * 把每个池分给有资格的人里牌最大的。
 *
 * @param scores 座位 → 牌力分数。弃牌的人不该出现在这里
 * @param firstToLeftOfButton 从钮位左手第一个座位开始的座位顺序，
 *        用来分**除不尽的零头**。德扑规则：零头给钮位左手最近的赢家。
 *        不处理零头的话，两人平分奇数底池会让筹码总量对不上。
 */
export function awardPots(
  pots: Pot[],
  scores: Map<Seat, number>,
  firstToLeftOfButton: Seat[],
): Map<Seat, number> {
  const won = new Map<Seat, number>()
  const add = (s: Seat, n: number) => won.set(s, (won.get(s) ?? 0) + n)

  for (const pot of pots) {
    const contenders = pot.eligible.filter((s) => scores.has(s))
    if (contenders.length === 0) continue

    let best = -1
    for (const s of contenders) best = Math.max(best, scores.get(s)!)
    const winners = contenders.filter((s) => scores.get(s) === best)

    const share = Math.floor(pot.amount / winners.length)
    let remainder = pot.amount - share * winners.length
    for (const s of winners) add(s, share)

    // 零头按座位顺序发，从钮位左手开始
    for (const s of firstToLeftOfButton) {
      if (remainder <= 0) break
      if (winners.includes(s)) {
        add(s, 1)
        remainder--
      }
    }
  }
  return won
}

/** 组装结果行，顺便做一次守恒校验 */
export function settle(
  players: PlayerState[],
  pots: Pot[],
  scores: Map<Seat, number>,
  labels: Map<Seat, { score: number; label: string; best: number[] }>,
  firstToLeftOfButton: Seat[],
): HandResultRow[] {
  const won = awardPots(pots, scores, firstToLeftOfButton)

  const totalPot = pots.reduce((a, p) => a + p.amount, 0)
  const totalWon = [...won.values()].reduce((a, b) => a + b, 0)
  // 筹码不能凭空多出来或消失。这条断言比任何日志都管用 ——
  // 边池写错时它立刻炸，而不是等玩家发现自己少了钱
  if (totalWon !== totalPot) {
    throw new Error(
      `底池分配不守恒：池共 ${totalPot}，分出去 ${totalWon}。这是 bug，不要吞掉`,
    )
  }

  return players
    .filter((p) => p.totalCommitted > 0 || won.has(p.seat))
    .map((p) => ({
      seat: p.seat,
      won: won.get(p.seat) ?? 0,
      hand: labels.get(p.seat) ?? null,
    }))
}
