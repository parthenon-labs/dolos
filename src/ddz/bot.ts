import {
  RANK_JOKER_BIG,
  RANK_JOKER_SMALL,
  RANK_MAX_CHAIN,
  RANK_TWO,
  countByRank,
  rankOf,
  type Card,
  type Rank,
} from './cards'
import { candidates, countBombs, isBomb, type Combo } from './combo'
import type { DdzAgent } from './engine'
import type { PlayAction, PlayerView, Seat } from './types'

/**
 * 启发式 bot。
 *
 * 目标不是打得好，是**打得像个人**：会攒炸弹、会看队友脸色、
 * 会在地主快走完的时候拼命。一个只会"出得起就出最小的"的 bot
 * 在斗地主里特别明显 —— 它永远不留牌，三局就能被看穿。
 *
 * 想再强就往搜索走（残局枚举、对手手牌的概率模型），**不是往语言模型走** ——
 * 斗地主是牌型比大小加概率，这些本地代码算得比模型准，而且快几万倍。
 */

/**
 * 把手牌拆成大概几手能走完。
 *
 * **这是整个 bot 唯一重要的量**：斗地主赢在"手数少"，不在"牌大"。
 * 一副 3-4-5-6-7 顺子是一手，拆成五张单张就是五手，
 * 所以任何会打散顺子的出牌都要付出代价 —— 代价就体现在这个数字上。
 *
 * 是贪心不是最优（最优要搜索，太贵）。系统性偏大一点点，
 * 但对比较两种出牌哪个更亏来说够用了。
 */
export function estimatePlays(cards: Card[]): number {
  const counts = countByRank(cards)
  let plays = 0

  const take = (r: Rank, n: number) => {
    const left = (counts.get(r) ?? 0) - n
    if (left > 0) counts.set(r, left)
    else counts.delete(r)
  }
  const has = (r: Rank, n: number) => (counts.get(r) ?? 0) >= n

  // 王炸和炸弹整块留着，各算一手
  if (has(RANK_JOKER_SMALL, 1) && has(RANK_JOKER_BIG, 1)) {
    take(RANK_JOKER_SMALL, 1)
    take(RANK_JOKER_BIG, 1)
    plays++
  }
  for (const r of [...counts.keys()]) {
    if (counts.get(r) === 4) {
      take(r, 4)
      plays++
    }
  }

  // 顺子：从长到短抠，长的先抠掉才划算
  for (let len = 12; len >= 5; len--) {
    for (;;) {
      const start = findChain(counts, 1, len)
      if (start === null) break
      for (let i = 0; i < len; i++) take(start + i, 1)
      plays++
    }
  }
  // 连对
  for (let len = 10; len >= 3; len--) {
    for (;;) {
      const start = findChain(counts, 2, len)
      if (start === null) break
      for (let i = 0; i < len; i++) take(start + i, 2)
      plays++
    }
  }

  // 剩下的三张、对子、单张各算一手。三张可以顺手带走一张单或一对，所以先处理三张
  const trios = [...counts.keys()].filter((r) => (counts.get(r) ?? 0) >= 3)
  for (const r of trios) {
    take(r, 3)
    plays++
    const single = [...counts.keys()].find((x) => counts.get(x) === 1)
    if (single !== undefined) take(single, 1)
    else {
      const pair = [...counts.keys()].find((x) => counts.get(x) === 2)
      if (pair !== undefined) take(pair, 2)
    }
  }
  for (const [, c] of counts) plays += c === 2 ? 1 : c
  return plays
}

/** 从 counts 里找一段长 len、每档至少 need 张的连续 rank，返回起点 */
function findChain(counts: Map<Rank, number>, need: number, len: number): Rank | null {
  for (let start = 0; start + len - 1 <= RANK_MAX_CHAIN; start++) {
    let ok = true
    for (let i = 0; i < len; i++)
      if ((counts.get(start + i) ?? 0) < need) {
        ok = false
        break
      }
    if (ok) return start
  }
  return null
}

/** 叫地主用的手牌强度。大牌、炸弹、以及"手数少" */
export function bidStrength(cards: Card[]): number {
  const counts = countByRank(cards)
  let v = 0
  if (counts.get(RANK_JOKER_BIG)) v += 6
  if (counts.get(RANK_JOKER_SMALL)) v += 4
  if (counts.get(RANK_JOKER_BIG) && counts.get(RANK_JOKER_SMALL)) v += 6
  v += (counts.get(RANK_TWO) ?? 0) * 3
  for (const [, c] of counts) if (c === 4) v += 8
  // 手数每少一手，值 1.5 分。17 张牌拆成 8 手左右算正常
  v += Math.max(0, 9 - estimatePlays(cards)) * 1.5
  return v
}

const remove = (hand: Card[], cards: Card[]): Card[] => {
  const out = hand.slice()
  for (const c of cards) out.splice(out.indexOf(c), 1)
  return out
}

/**
 * 出这手牌的代价。**bot 全部的判断力就在这个函数里。**
 *
 * 主项是手数 —— 斗地主赢在手数少，不在牌大。
 * 但只看手数会得出一个荒唐的结论：拆炸弹是免费的。
 * 3333 拆一张去凑 34567 顺子，手数立刻从 5 掉到 2，
 * 模型看着是天大的好事，于是 bot 把 84.7% 的炸弹都拆掉了 ——
 * 四千局里炸弹只打出 167 次，而到手率和王炸完全一样（都是 32.6%）。
 *
 * 炸弹的价值根本不在手数里：它压得住一切，还翻一倍。
 * 所以拆掉一个炸弹要单独记一笔重帐，重到抵得过两三手的便宜。
 */
function playCost(hand: Card[], c: Combo): number {
  const after = remove(hand, c.cards)
  const broke = countBombs(hand) - countBombs(after) - (isBomb(c) ? 1 : 0)
  return estimatePlays(after) * 10 + c.rank * 0.3 + Math.max(0, broke) * 26
}

export class RuleBot implements DdzAgent {
  private rng: () => number

  /**
   * `nerve` 是这个 bot 的胆子：影响叫地主的门槛和拆炸弹的意愿。
   * 一桌三个 bot 用不同的值，不然三家像同一个人在打。
   */
  constructor(
    readonly name: string,
    seed: number,
    readonly nerve = 0.5,
  ) {
    let st = (seed | 0) || 1
    this.rng = () => ((st = (st * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  }

  bid(view: PlayerView, min: number): number {
    const v = bidStrength(view.myCards) + (this.rng() - 0.5) * 4
    // 门槛：胆子大的低一点。
    // 定得太高的代价不是"bot 保守"，是**大量牌局要重发** ——
    // 第一版三家平均分 8.3 分而门槛 11 分，五局里有一局没人叫，玩起来很烦
    const base = 9 - this.nerve * 3
    const want = v >= base + 8 ? 3 : v >= base + 4 ? 2 : v >= base ? 1 : 0
    return want > min ? want : 0
  }

  play(view: PlayerView): PlayAction {
    const hand = view.myCards
    const req = view.required
    const all = candidates(hand, req?.combo ?? null)
    if (all.length === 0) return { kind: 'pass' }

    // 一把走完就直接走，别的都不用想
    const finisher = all.find((c) => c.cards.length === hand.length)
    if (finisher) return { kind: 'play', cards: finisher.cards }

    const iAmLandlord = view.landlord === view.me
    const others = view.players.filter((p) => p.seat !== view.me)
    const landlordSeat = view.landlord
    // "危险"= 该盯的那个人快走完了。农民只盯地主 —— 队友走完是好事，不是危险
    const danger = others.some(
      (p) => p.count <= 3 && (iAmLandlord ? true : p.seat === landlordSeat),
    )

    if (!req) return this.lead(all, hand, danger)
    return this.follow(view, all, hand, req.seat, danger)
  }

  /**
   * 自己出第一手。
   *
   * 判据是"出完之后剩下的牌还要几手"，而不是"这手牌大不大"。
   * 所以 bot 会主动去打顺子和连对 —— 那是真正减手数的东西 ——
   * 而不是一张一张往外扔小牌。
   */
  private lead(all: Combo[], hand: Card[], danger: boolean): PlayAction {
    const usable = all.filter((c) => !isBomb(c))
    const bombs = all.filter((c) => isBomb(c))

    const closing = bombs.find((b) => estimatePlays(remove(hand, b.cards)) <= 2)
    if (closing) return { kind: 'play', cards: closing.cards }

    const pool = usable.length > 0 ? usable : all

    let best = pool[0]
    let bestCost = Infinity
    for (const c of pool) {
      let cost = playCost(hand, c)
      // 下家只剩一两张时，别喂单张给他
      if (danger && c.cards.length === 1 && c.rank < RANK_TWO) cost += 25
      if (cost < bestCost) {
        bestCost = cost
        best = c
      }
    }
    return { kind: 'play', cards: best.cards }
  }

  /**
   * 压上家。
   *
   * 两条人味儿的规则：**不压队友**，以及**地主快走完了就拼**。
   * 少了第一条，两个农民会互相打死；少了第二条，bot 会攥着炸弹眼看地主赢。
   */
  private follow(
    view: PlayerView,
    all: Combo[],
    hand: Card[],
    fromSeat: Seat,
    danger: boolean,
  ): PlayAction {
    const iAmFarmer = view.landlord !== null && view.me !== view.landlord
    const fromTeammate = iAmFarmer && fromSeat !== view.landlord

    if (fromTeammate && !danger) {
      // 队友出的牌，除非自己也快走完了想接管，否则让他走
      const myLeft = hand.length
      if (myLeft > 4 || this.rng() > 0.25) return { kind: 'pass' }
    }

    const plain = all.filter((c) => !isBomb(c))
    const bombs = all.filter((c) => isBomb(c))

    /**
     * 什么时候该炸。
     *
     * 这条规则是量出来的，不是拍的。第一版只在"实在压不住了"才炸，
     * 结果四千局里炸弹只打出 140 次，而两张的王炸打了 911 次 ——
     * 两者的**到手率是一样的（都是 32.6%）**，差的全是打法：
     * 王炸只有两张，天然会变成最后一手；炸弹四张，于是被攥到死。
     * 那不是保守，是不会打。
     *
     * 改成：炸弹只在**能改变结果**的时候用 —— 要么对手快走完了、
     * 拿住出牌权比什么都重要；要么炸完自己两手内能收，炸出去就是锁胜。
     * 平时照旧留着。
     */
    const bomb = bombs[0]
    if (bomb) {
      if (danger) return { kind: 'play', cards: bomb.cards }
      const closing = bombs.find((b) => estimatePlays(remove(hand, b.cards)) <= 2)
      if (closing) return { kind: 'play', cards: closing.cards }
    }

    if (plain.length > 0) {
      let best = plain[0]
      let bestCost = Infinity
      for (const c of plain) {
        let cost = playCost(hand, c)
        // 拆 2 和王去压小牌不值。除非情况紧急
        if (!danger && c.rank >= RANK_TWO && c.cards.length <= 2) cost += 12
        if (cost < bestCost) {
          bestCost = cost
          best = c
        }
      }
      const now = estimatePlays(hand)
      const after = estimatePlays(remove(hand, best.cards))

      // 压这一手会让手数变多（等于拆了结构），而且局势不紧张 —— 那就不压
      if (!danger && after >= now && this.rng() > 0.3 + this.nerve * 0.3)
        return { kind: 'pass' }
      return { kind: 'play', cards: best.cards }
    }

    // 只剩炸弹能压了。地主要赢了就必须炸，否则看胆子
    if (bombs.length > 0 && (danger || this.rng() < this.nerve * 0.25))
      return { kind: 'play', cards: bombs[0].cards }
    return { kind: 'pass' }
  }
}

export { rankOf }
