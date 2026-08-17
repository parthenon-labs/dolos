import { type Card, rankOf, suitOf } from './cards'

/**
 * 七张里挑最好的五张。
 *
 * 实现方式是**穷举 C(7,5)=21 种组合**，每种打一个分，取最大。
 * 没有用查表法：查表快几十倍，但一张 13 万项的表没法用眼睛验证，
 * 而这里算错一次就是玩家的钱分错了。
 * 21 次组合每手牌不到 10 微秒，真实瓶颈根本不在这。
 *
 * 分数是一个可直接比大小的整数：
 *   category * 15^5 + kicker1 * 15^4 + ... + kicker5
 * 用 15 进制是因为牌面最大 14，留一位余量。
 * 同分即平局 —— 德扑里平局要分池，所以"相等"必须是精确的，
 * 不能用浮点，也不能用"差不多"的比较。
 */

export const HAND_NAMES = [
  '高牌',
  '一对',
  '两对',
  '三条',
  '顺子',
  '同花',
  '葫芦',
  '四条',
  '同花顺',
] as const

export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

const BASE = 15

/** 把类别和 5 个已排序的关键牌面打成一个可比较的整数 */
function score(cat: HandCategory, kickers: number[]): number {
  let v = cat
  for (let i = 0; i < 5; i++) v = v * BASE + (kickers[i] ?? 0)
  return v
}

/**
 * 给恰好五张牌打分。
 *
 * 顺子里的 A 可以当 1 用（A-2-3-4-5，"轮子"），
 * 这时**顺子的最大牌是 5 不是 A** —— 漏了这条会把最小的顺子判成最大的。
 */
export function score5(cards: Card[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a)
  const suits = cards.map(suitOf)
  const flush = suits.every((s) => s === suits[0])

  // 按出现次数分组：次数优先，次数相同时按牌面大小
  const count = new Map<number, number>()
  for (const r of ranks) count.set(r, (count.get(r) ?? 0) + 1)
  const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])

  // 顺子判定
  const uniq = [...new Set(ranks)]
  let straightHigh = 0
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0]
    // 轮子：A-5-4-3-2。最大牌算 5
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5
  }

  if (straightHigh && flush) return score(8, [straightHigh])
  if (groups[0][1] === 4) return score(7, [groups[0][0], groups[1][0]])
  if (groups[0][1] === 3 && groups[1][1] === 2) return score(6, [groups[0][0], groups[1][0]])
  if (flush) return score(5, ranks)
  if (straightHigh) return score(4, [straightHigh])
  if (groups[0][1] === 3) {
    return score(3, [groups[0][0], groups[1][0], groups[2][0]])
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    return score(2, [groups[0][0], groups[1][0], groups[2][0]])
  }
  if (groups[0][1] === 2) {
    return score(1, [groups[0][0], groups[1][0], groups[2][0], groups[3][0]])
  }
  return score(0, ranks)
}

/** 21 种五张组合的下标 */
const COMBOS: number[][] = (() => {
  const out: number[][] = []
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++)
          for (let e = d + 1; e < 7; e++) out.push([a, b, c, d, e])
  return out
})()

export type HandResult = {
  score: number
  category: HandCategory
  /** 构成这手牌的五张，用来在摊牌时高亮 */
  best: Card[]
}

/**
 * 从 5-7 张里评出最好的一手。
 *
 * 少于 7 张也支持（翻牌圈只有 5 张），此时组合数更少。
 */
export function evaluate(cards: Card[]): HandResult {
  if (cards.length < 5) throw new Error(`至少要 5 张牌，给了 ${cards.length}`)
  if (cards.length === 5) {
    const s = score5(cards)
    return { score: s, category: catOf(s), best: cards.slice() }
  }

  let bestScore = -1
  let bestCards: Card[] = []
  const combos =
    cards.length === 7 ? COMBOS : combosOf(cards.length)
  for (const idx of combos) {
    const hand = idx.map((i) => cards[i])
    const s = score5(hand)
    if (s > bestScore) {
      bestScore = s
      bestCards = hand
    }
  }
  return { score: bestScore, category: catOf(bestScore), best: bestCards }
}

const catOf = (s: number): HandCategory =>
  Math.floor(s / BASE ** 5) as HandCategory

const comboCache = new Map<number, number[][]>()
function combosOf(n: number): number[][] {
  const hit = comboCache.get(n)
  if (hit) return hit
  const out: number[][] = []
  const pick = (start: number, acc: number[]) => {
    if (acc.length === 5) {
      out.push(acc.slice())
      return
    }
    for (let i = start; i < n; i++) {
      acc.push(i)
      pick(i + 1, acc)
      acc.pop()
    }
  }
  pick(0, [])
  comboCache.set(n, out)
  return out
}

/**
 * 给界面用的中文描述。
 *
 * **必须带踢脚牌。** 两家都是"两对 Q 和 8"、一个赢一个输时，
 * 如果标签一模一样，玩家看到的就是"引擎乱判" —— 摊牌界面的职责
 * 不只是报结果，是让人看出**为什么**。
 */
export function describe(r: HandResult): string {
  const name = HAND_NAMES[r.category]
  const ranks = r.best.map(rankOf).sort((a, b) => b - a)
  const label = (v: number) => '23456789TJQKA'[v - 2]
  const count = new Map<number, number>()
  for (const v of ranks) count.set(v, (count.get(v) ?? 0) + 1)
  const g = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])

  switch (r.category) {
    case 8:
    case 4: {
      const uniq = [...new Set(ranks)]
      const high = uniq[0] === 14 && uniq[1] === 5 ? 5 : uniq[0]
      return `${name} · ${label(high)} 高`
    }
    case 7:
      return `${name} · ${label(g[0][0])}`
    case 6:
      return `${name} · ${label(g[0][0])} 带 ${label(g[1][0])}`
    case 5:
      return `${name} · ${label(ranks[0])} 高`
    case 3:
      return `${name} · ${label(g[0][0])}` + kicker(g.slice(1).map((x) => x[0]))
    case 2:
      return (
        `${name} · ${label(g[0][0])} 和 ${label(g[1][0])}` +
        kicker(g.slice(2).map((x) => x[0]))
      )
    case 1:
      return `${name} · ${label(g[0][0])}` + kicker(g.slice(1).map((x) => x[0]))
    default:
      return `${name} · ${label(ranks[0])}` + kicker(ranks.slice(1))
  }
}

/** 踢脚牌后缀。只列前两张 —— 再往后几乎不会成为胜负手，列全反而看不清 */
function kicker(rest: number[]): string {
  if (rest.length === 0) return ''
  const label = (v: number) => '23456789TJQKA'[v - 2]
  return `，${rest.slice(0, 2).map(label).join(' ')} 踢脚`
}
