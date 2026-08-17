/**
 * 牌的表示。
 *
 * 一张牌就是一个 0-51 的整数：`rank * 4 + suit`。
 * 不用对象是因为**这玩意儿在评估里要被拿来算几十万次**，
 * 而且整数天然可比较、可进 Set、可当数组下标。
 * 需要人读的时候再 format。
 */

export type Card = number

/** 2..14，14 = A */
export type Rank = number
/** 0=♠ 1=♥ 2=♦ 3=♣ */
export type Suit = number

export const rankOf = (c: Card): Rank => (c >> 2) + 2
export const suitOf = (c: Card): Suit => c & 3

export const makeCard = (rank: Rank, suit: Suit): Card => ((rank - 2) << 2) | suit

export const RANK_CHARS = '23456789TJQKA'
export const SUIT_CHARS = '♠♥♦♣'
/** 红桃方块是红的，界面要按这个上色 */
export const isRed = (c: Card) => suitOf(c) === 1 || suitOf(c) === 2

export const formatCard = (c: Card) =>
  RANK_CHARS[rankOf(c) - 2] + SUIT_CHARS[suitOf(c)]

export const formatCards = (cs: Card[]) => cs.map(formatCard).join(' ')

/** 从 "As" "Td" "7h" 这样的写法解析。只在测试和调试里用 */
export function parseCard(s: string): Card {
  const r = RANK_CHARS.indexOf(s[0].toUpperCase())
  const suit = 'shdc'.indexOf(s[1].toLowerCase())
  if (r < 0 || suit < 0) throw new Error(`看不懂的牌：${s}`)
  // 'shdc' 的顺序要和 SUIT_CHARS 对上：s=♠0 h=♥1 d=♦2 c=♣3
  return makeCard(r + 2, suit)
}

export const parseCards = (s: string): Card[] => s.trim().split(/\s+/).map(parseCard)

/** 一副新牌 */
export const freshDeck = (): Card[] => Array.from({ length: 52 }, (_, i) => i)

/**
 * 用给定的随机源洗牌（Fisher-Yates）。
 *
 * **必须吃外部 rng 而不是 Math.random** —— 一手牌能不能复现，
 * 决定了纠纷复盘和 bug 重现能不能做。种子存进事件流里，整手牌就能重放。
 */
export function shuffle(deck: Card[], rng: () => number): Card[] {
  const d = deck.slice()
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}
