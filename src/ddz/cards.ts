/**
 * 斗地主的牌。
 *
 * 和德州那边一样用整数：0-51 是 `rank * 4 + suit`，52 是小王，53 是大王。
 * **rank 直接按斗地主的大小排**（3 最小 = 0，2 = 12，小王 13，大王 14），
 * 而不是按牌面数字 —— 大小比较是这个游戏里做得最频繁的事，
 * 每次都要把 2 特判成比 A 大，迟早会漏一处。
 */

export type Card = number
/** 0..14：3 4 5 6 7 8 9 10 J Q K A 2 小王 大王 */
export type Rank = number

/**
 * 牌面。索引就是 rank，所以这个数组的顺序**就是斗地主的大小顺序** ——
 * 想知道谁大，比下标即可，不用记"2 比 A 大"这种特例。
 */
export const RANK_LABELS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王']

/** 2 的 rank。它不能进顺子，是一堆规则的边界 */
export const RANK_TWO = 12
export const RANK_JOKER_SMALL = 13
export const RANK_JOKER_BIG = 14
/** 顺子/连对/飞机能用到的最大 rank（A）。2 和王都不算 */
export const RANK_MAX_CHAIN = 11

export const SUIT_CHARS = '♠♥♦♣'

export const rankOf = (c: Card): Rank =>
  c >= 52 ? (c === 52 ? RANK_JOKER_SMALL : RANK_JOKER_BIG) : c >> 2

export const suitOf = (c: Card): number => (c >= 52 ? -1 : c & 3)

export const isJoker = (c: Card) => c >= 52
export const isRed = (c: Card) => (c === 53 ? true : suitOf(c) === 1 || suitOf(c) === 2)

export const makeCard = (rank: Rank, suit: number): Card =>
  rank >= RANK_JOKER_SMALL ? (rank === RANK_JOKER_SMALL ? 52 : 53) : (rank << 2) | suit

export function formatCard(c: Card): string {
  if (c === 52) return '小王'
  if (c === 53) return '大王'
  return SUIT_CHARS[suitOf(c)] + RANK_LABELS[rankOf(c)]
}

export const formatCards = (cs: Card[]) => cs.map(formatCard).join(' ')
/** 只报牌面不报花色。日志里念出来的是这个 —— 斗地主的花色不参与任何判定 */
export const formatRanks = (cs: Card[]) =>
  sortCards(cs).map((c) => RANK_LABELS[rankOf(c)]).join(' ')

/** 一副完整的牌：52 张 + 双王 */
export const freshDeck = (): Card[] => Array.from({ length: 54 }, (_, i) => i)

/** 从大到小。手牌一直保持这个序，界面和 bot 都依赖它 */
export const sortCards = (cs: Card[]): Card[] =>
  cs.slice().sort((a, b) => rankOf(b) - rankOf(a) || b - a)

/** rank -> 张数。牌型识别的唯一入口，别的地方不要自己数 */
export function countByRank(cs: Card[]): Map<Rank, number> {
  const m = new Map<Rank, number>()
  for (const c of cs) m.set(rankOf(c), (m.get(rankOf(c)) ?? 0) + 1)
  return m
}

/**
 * 洗牌。和德州那边同样的理由：**必须吃外部 rng**。
 * 种子进事件流，一整局就能重放 —— 出牌纠纷和 bot 的迷之操作都靠这个复现。
 */
export function shuffle(deck: Card[], rng: () => number): Card[] {
  const d = deck.slice()
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

/**
 * 从手牌里挑出指定 rank 的若干张。
 *
 * bot 想出的是"一对 7"这种抽象的东西，最后总得落到具体的牌上。
 * 挑的时候**优先挑没花色搭配价值的**：这里就是按牌 id 顺序挑，
 * 斗地主没有同花，所以挑哪张都一样 —— 但要挑得稳定，否则同一个种子跑两次结果不同。
 */
export function takeRank(hand: Card[], rank: Rank, n: number): Card[] {
  const got = hand.filter((c) => rankOf(c) === rank).sort((a, b) => a - b).slice(0, n)
  if (got.length < n) throw new Error(`手里没有 ${n} 张 ${RANK_LABELS[rank]}`)
  return got
}

/** 从手牌里移除这些牌。移不掉就是 bug，直接抛 */
export function removeCards(hand: Card[], cards: Card[]): Card[] {
  const out = hand.slice()
  for (const c of cards) {
    const i = out.indexOf(c)
    if (i < 0) throw new Error(`手里没有这张牌：${formatCard(c)}`)
    out.splice(i, 1)
  }
  return out
}
