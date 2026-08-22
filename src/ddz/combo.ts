import {
  countByRank,
  RANK_MAX_CHAIN,
  RANK_JOKER_BIG,
  RANK_JOKER_SMALL,
  RANK_LABELS,
  rankOf,
  sortCards,
  takeRank,
  type Card,
  type Rank,
} from './cards'

/**
 * 牌型。
 *
 * 斗地主真正难的地方全在这个文件里：**一手牌是什么牌型，不是玩家说了算，
 * 是这堆牌自己决定的**。所以入口只有一个 `parse(cards)` ——
 * 界面收到玩家勾了哪几张，扔进来，认得出就是合法出牌，认不出就是不能出。
 * 不存在"玩家选了牌型再选牌"那种交互，那种做法迟早会让界面和引擎对牌型的理解分家。
 *
 * 比大小同理，只有一个 `beats(a, b)`。
 */

export type ComboType =
  | 'single'
  | 'pair'
  | 'trio'
  | 'trio_single'
  | 'trio_pair'
  | 'straight'
  | 'straight_pair'
  | 'plane'
  | 'plane_single'
  | 'plane_pair'
  | 'four_two_singles'
  | 'four_two_pairs'
  | 'bomb'
  | 'rocket'

export type Combo = {
  type: ComboType
  /** 主牌 rank。比大小只看它 —— 带的牌一律不参与比较 */
  rank: Rank
  /** 连的长度：顺子是张数，连对是对数，飞机是三张的组数。不连的牌型恒为 1 */
  len: number
  cards: Card[]
}

export const isBomb = (c: Combo) => c.type === 'bomb' || c.type === 'rocket'

const CHAIN_MIN = { straight: 5, straight_pair: 3, plane: 2 }

/** ranks 升序，是否连续、且没越过 A */
function isChain(ranks: Rank[]): boolean {
  if (ranks.length === 0) return false
  if (ranks[ranks.length - 1] > RANK_MAX_CHAIN) return false
  for (let i = 1; i < ranks.length; i++) if (ranks[i] !== ranks[i - 1] + 1) return false
  return true
}

/**
 * 认牌型。认不出来返回 null。
 *
 * 有意做成**全序判断而不是猜**：每一步要么排除，要么确定，没有"大概是飞机吧"。
 * 唯一一处主观是飞机的读法优先级，见 parsePlane。
 */
export function parse(cards: Card[]): Combo | null {
  const n = cards.length
  if (n === 0) return null
  const counts = countByRank(cards)
  const ranks = [...counts.keys()].sort((a, b) => a - b)
  const mk = (type: ComboType, rank: Rank, len = 1): Combo => ({
    type,
    rank,
    len,
    cards: sortCards(cards),
  })

  // 王炸。唯一压一切的牌型，先认它
  if (n === 2 && counts.get(RANK_JOKER_SMALL) === 1 && counts.get(RANK_JOKER_BIG) === 1)
    return mk('rocket', RANK_JOKER_BIG)

  if (n === 1) return mk('single', ranks[0])
  if (n === 2) return ranks.length === 1 ? mk('pair', ranks[0]) : null
  if (n === 3) return ranks.length === 1 ? mk('trio', ranks[0]) : null
  if (n === 4) {
    if (ranks.length === 1) return mk('bomb', ranks[0])
    const trio = ranks.find((r) => counts.get(r) === 3)
    return trio === undefined ? null : mk('trio_single', trio)
  }
  if (n === 5) {
    const trio = ranks.find((r) => counts.get(r) === 3)
    if (trio !== undefined) {
      const pair = ranks.find((r) => counts.get(r) === 2)
      // 三带两张散牌不是牌型，只能带一对
      return pair === undefined ? null : mk('trio_pair', trio)
    }
  }

  // 顺子：五张起，每张一个 rank，连续，不含 2 和王
  if (ranks.length === n && n >= CHAIN_MIN.straight && isChain(ranks))
    return mk('straight', ranks[ranks.length - 1], n)

  // 连对：三对起
  if (
    n % 2 === 0 &&
    ranks.length === n / 2 &&
    ranks.length >= CHAIN_MIN.straight_pair &&
    ranks.every((r) => counts.get(r) === 2) &&
    isChain(ranks)
  )
    return mk('straight_pair', ranks[ranks.length - 1], ranks.length)

  return parsePlane(cards, counts, ranks, n) ?? parseFourTwo(cards, counts, ranks, n)
}

/**
 * 飞机：两组以上连续的三张，可以不带、每组带一张单、或每组带一对。
 *
 * **这里有一个主观选择**：333444555666 既能读成四连飞机不带，
 * 也能读成三连飞机带三张单。规定按"连得最长"读 ——
 * 玩家想拆开打，就少选几张牌，选择权在他手上，而不是让引擎猜。
 *
 * 另一条硬规则：**带的牌不能来自三张本身的那几个 rank**。
 * 不然 33334444 会被读成飞机带单，而它其实是两个炸弹，
 * 玩家几乎不可能是那个意思。
 */
function parsePlane(
  cards: Card[],
  counts: Map<Rank, number>,
  ranks: Rank[],
  n: number,
): Combo | null {
  const trioRanks = ranks.filter((r) => (counts.get(r) ?? 0) >= 3 && r <= RANK_MAX_CHAIN)
  if (trioRanks.length < CHAIN_MIN.plane) return null

  // 所有连续段，长的优先
  const candidates: Rank[][] = []
  for (let i = 0; i < trioRanks.length; i++) {
    for (let j = i + CHAIN_MIN.plane - 1; j < trioRanks.length; j++) {
      const run = trioRanks.slice(i, j + 1)
      if (isChain(run)) candidates.push(run)
    }
  }
  candidates.sort((a, b) => b.length - a.length || b[b.length - 1] - a[a.length - 1])

  for (const run of candidates) {
    const m = run.length
    const inRun = new Set(run)
    // 扣掉三张之后剩下什么
    const rest = new Map<Rank, number>()
    for (const [r, c] of counts) {
      const left = c - (inRun.has(r) ? 3 : 0)
      if (left > 0) rest.set(r, left)
    }
    const restTotal = [...rest.values()].reduce((a, b) => a + b, 0)
    // 带的牌不能来自三张自己那几个 rank
    if ([...rest.keys()].some((r) => inRun.has(r))) continue

    const top = run[m - 1]
    if (restTotal === 0 && n === 3 * m)
      return { type: 'plane', rank: top, len: m, cards: sortCards(cards) }
    if (restTotal === m && n === 4 * m && [...rest.values()].every((c) => c <= 2))
      return { type: 'plane_single', rank: top, len: m, cards: sortCards(cards) }
    if (restTotal === 2 * m && n === 5 * m && [...rest.values()].every((c) => c === 2))
      return { type: 'plane_pair', rank: top, len: m, cards: sortCards(cards) }
  }
  return null
}

/** 四带两张单 / 四带两对。注意它**不是炸弹**，炸弹能压它 */
function parseFourTwo(
  cards: Card[],
  counts: Map<Rank, number>,
  ranks: Rank[],
  n: number,
): Combo | null {
  const fours = ranks.filter((r) => counts.get(r) === 4)
  if (fours.length !== 1) return null
  const r4 = fours[0]
  const rest = ranks.filter((r) => r !== r4)
  if (n === 6) return { type: 'four_two_singles', rank: r4, len: 1, cards: sortCards(cards) }
  if (n === 8 && rest.length === 2 && rest.every((r) => counts.get(r) === 2))
    return { type: 'four_two_pairs', rank: r4, len: 1, cards: sortCards(cards) }
  return null
}

/**
 * a 能不能压住 b。b 为 null 表示自己是第一手，随便出。
 *
 * 顺序写死在这里：王炸 > 炸弹 > 同类型同长度比主牌。
 * 四带二**不是**炸弹，别被张数骗了。
 */
export function beats(a: Combo, b: Combo | null): boolean {
  if (!b) return true
  // 王炸压一切，但压不住王炸。一副牌里只有一个王炸，实战永远撞不上这一格，
  // 写成 `return true` 也不会有人发现 —— 但那样这个关系就是自反的，
  // 而"谁压得住谁"必须是严格偏序，否则任何依赖它排序的地方都会出鬼
  if (a.type === 'rocket') return b.type !== 'rocket'
  if (b.type === 'rocket') return false
  if (a.type === 'bomb') return b.type === 'bomb' ? a.rank > b.rank : true
  if (b.type === 'bomb') return false
  return a.type === b.type && a.len === b.len && a.rank > b.rank
}

const TYPE_NAMES: Record<ComboType, string> = {
  single: '单张',
  pair: '对子',
  trio: '三张',
  trio_single: '三带一',
  trio_pair: '三带一对',
  straight: '顺子',
  straight_pair: '连对',
  plane: '飞机',
  plane_single: '飞机带单',
  plane_pair: '飞机带对',
  four_two_singles: '四带二',
  four_two_pairs: '四带两对',
  bomb: '炸弹',
  rocket: '王炸',
}

export function describeCombo(c: Combo): string {
  if (c.type === 'rocket') return '王炸'
  const name = TYPE_NAMES[c.type]
  if (c.type === 'straight') return `${c.len} 张${name}（到 ${RANK_LABELS[c.rank]}）`
  if (c.type === 'straight_pair') return `${c.len} 连对（到 ${RANK_LABELS[c.rank]}）`
  if (c.type.startsWith('plane')) return `${c.len} 连${name}（到 ${RANK_LABELS[c.rank]}）`
  return `${name} ${RANK_LABELS[c.rank]}`
}

// ─────────────────────────────────────────────────────────────
// 候选枚举
//
// 只给 bot 和"提示"按钮用。**人出牌不走这里** —— 人是勾牌，
// 勾完了 parse + beats 判定，想怎么拆就怎么拆。
// 枚举只需要给出「一种能压住的合法打法」，不需要穷尽所有带牌方式，
// 否则一手飞机带单能炸出几百个组合，而它们在规则上完全等价。
// ─────────────────────────────────────────────────────────────

/** 挑带的牌：优先拆最没用的 —— 先散牌后对子，同结构里先小的，绝不拆炸弹 */
function pickAttach(
  counts: Map<Rank, number>,
  exclude: Set<Rank>,
  kind: 'single' | 'pair',
  k: number,
): Rank[] | null {
  const need = kind === 'pair' ? 2 : 1
  const pool = [...counts.entries()]
    .filter(([r, c]) => !exclude.has(r) && c >= need && c !== 4)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([r]) => r)
  if (pool.length < k) return null
  return pool.slice(0, k)
}

/**
 * 手里所有能压住 `req` 的打法。`req` 为 null 表示自己出第一手。
 *
 * 炸弹和王炸永远在列表末尾单独给出 —— 要不要动炸弹是策略问题，
 * 交给 bot 决定，枚举只负责说"你有这个选项"。
 */
export function candidates(hand: Card[], req: Combo | null): Combo[] {
  const counts = countByRank(hand)
  const ranks = [...counts.keys()].sort((a, b) => a - b)
  const out: Combo[] = []

  const build = (parts: { rank: Rank; n: number }[]): Card[] => {
    let pool = hand.slice()
    const picked: Card[] = []
    for (const p of parts) {
      const got = takeRank(pool, p.rank, p.n)
      picked.push(...got)
      pool = pool.filter((c) => !got.includes(c))
    }
    return picked
  }
  const push = (parts: { rank: Rank; n: number }[]) => {
    const c = parse(build(parts))
    if (c && beats(c, req)) out.push(c)
  }

  const floor = req ? req.rank : -1
  const wantLen = req ? req.len : 0

  const emitSimple = (need: number) => {
    for (const r of ranks) if ((counts.get(r) ?? 0) >= need && r > floor) push([{ rank: r, n: need }])
  }
  const emitTrioWith = (kind: 'single' | 'pair') => {
    for (const r of ranks) {
      if ((counts.get(r) ?? 0) < 3 || r <= floor) continue
      const att = pickAttach(subtract(counts, r, 3), new Set([r]), kind, 1)
      if (att) push([{ rank: r, n: 3 }, { rank: att[0], n: kind === 'pair' ? 2 : 1 }])
    }
  }
  const emitChain = (need: number, minLen: number, len: number) => {
    const usable = ranks.filter((r) => (counts.get(r) ?? 0) >= need && r <= RANK_MAX_CHAIN)
    const L = len || minLen
    for (let i = 0; i + L <= usable.length; i++) {
      const run = usable.slice(i, i + L)
      if (!isChain(run)) continue
      if (run[L - 1] <= floor) continue
      push(run.map((r) => ({ rank: r, n: need })))
    }
  }
  const emitPlane = (m: number, attach: 'none' | 'single' | 'pair') => {
    const usable = ranks.filter((r) => (counts.get(r) ?? 0) >= 3 && r <= RANK_MAX_CHAIN)
    for (let i = 0; i + m <= usable.length; i++) {
      const run = usable.slice(i, i + m)
      if (!isChain(run) || run[m - 1] <= floor) continue
      const parts = run.map((r) => ({ rank: r, n: 3 }))
      if (attach === 'none') {
        push(parts)
        continue
      }
      let left = counts
      for (const r of run) left = subtract(left, r, 3)
      const att = pickAttach(left, new Set(run), attach, m)
      if (!att) continue
      push([...parts, ...att.map((r) => ({ rank: r, n: attach === 'pair' ? 2 : 1 }))])
    }
  }
  const emitFourTwo = (kind: 'single' | 'pair') => {
    for (const r of ranks) {
      if (counts.get(r) !== 4 || r <= floor) continue
      const att = pickAttach(subtract(counts, r, 4), new Set([r]), kind, 2)
      if (att) push([{ rank: r, n: 4 }, ...att.map((a) => ({ rank: a, n: kind === 'pair' ? 2 : 1 }))])
    }
  }

  if (!req) {
    // 第一手：把所有牌型都摆出来，由 bot 挑
    emitSimple(1)
    emitSimple(2)
    emitSimple(3)
    emitTrioWith('single')
    emitTrioWith('pair')
    for (let L = CHAIN_MIN.straight; L <= 12; L++) emitChain(1, L, L)
    for (let L = CHAIN_MIN.straight_pair; L <= 10; L++) emitChain(2, L, L)
    for (let m = CHAIN_MIN.plane; m <= 6; m++) {
      emitPlane(m, 'none')
      emitPlane(m, 'single')
      emitPlane(m, 'pair')
    }
    emitFourTwo('single')
    emitFourTwo('pair')
  } else {
    switch (req.type) {
      case 'single': emitSimple(1); break
      case 'pair': emitSimple(2); break
      case 'trio': emitSimple(3); break
      case 'trio_single': emitTrioWith('single'); break
      case 'trio_pair': emitTrioWith('pair'); break
      case 'straight': emitChain(1, CHAIN_MIN.straight, wantLen); break
      case 'straight_pair': emitChain(2, CHAIN_MIN.straight_pair, wantLen); break
      case 'plane': emitPlane(wantLen, 'none'); break
      case 'plane_single': emitPlane(wantLen, 'single'); break
      case 'plane_pair': emitPlane(wantLen, 'pair'); break
      case 'four_two_singles': emitFourTwo('single'); break
      case 'four_two_pairs': emitFourTwo('pair'); break
      default: break // 炸弹和王炸只能被炸弹压，下面统一处理
    }
  }

  // 炸弹。req 是炸弹时只有更大的炸弹算数，否则任何炸弹都能压
  const bombFloor = req?.type === 'bomb' ? req.rank : -1
  for (const r of ranks)
    if (counts.get(r) === 4 && r > bombFloor && !(req && req.type === 'rocket'))
      push([{ rank: r, n: 4 }])
  if (counts.get(RANK_JOKER_SMALL) === 1 && counts.get(RANK_JOKER_BIG) === 1)
    push([{ rank: RANK_JOKER_SMALL, n: 1 }, { rank: RANK_JOKER_BIG, n: 1 }])

  return out
}

function subtract(counts: Map<Rank, number>, r: Rank, n: number): Map<Rank, number> {
  const m = new Map(counts)
  const left = (m.get(r) ?? 0) - n
  if (left > 0) m.set(r, left)
  else m.delete(r)
  return m
}

/** 手牌里有没有炸弹或王炸。结算翻倍要数它 */
export function countBombs(cards: Card[]): number {
  const counts = countByRank(cards)
  let n = 0
  for (const [, c] of counts) if (c === 4) n++
  if (counts.get(RANK_JOKER_SMALL) === 1 && counts.get(RANK_JOKER_BIG) === 1) n++
  return n
}

export { rankOf }
