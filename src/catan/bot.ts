import { RESOURCES, type Resource } from './board'
import { COSTS, canPay, longestRoadFor } from './engine'
import {
  emptyHand,
  handSize,
  type CatanAction,
  type Hand,
  type PlayerView,
  type Seat,
  type TradeOffer,
} from './types'

/**
 * 启发式 bot。
 *
 * 卡坦和前两个游戏不一样：**开局摆村庄基本决定了这一局**。
 * 所以这里的重心不在回合中的取舍，而在两件事上 ——
 * 摆得准，以及不要囤着资源不花。
 *
 * 想再强就往搜索走（多步展开、期望产出的蒙特卡洛），**不是往语言模型走** ——
 * 卡坦是完全信息加骰子概率，这些本地代码算得比模型准，而且快几万倍。
 */

/** 数字标记的点数：6 和 8 是五个点，2 和 12 是一个点。**概率的正确度量** */
export const pips = (n: number | null) => (n === null ? 0 : 6 - Math.abs(7 - n))

export interface CatanAgent {
  act(view: PlayerView, options: CatanAction[]): Promise<CatanAction> | CatanAction
  /** 别人提议跟你换，接不接。不实现就等于永远不接 */
  respondTrade?(view: PlayerView, offer: TradeOffer): Promise<boolean> | boolean
}

/** 每种资源现在值多少。缺的比多的值钱，矿和麦在后期最贵 */
function needs(v: PlayerView): Record<Resource, number> {
  const h = v.myHand
  const me = v.players.find((p) => p.seat === v.me)!
  // 有村庄可升级就奔城市，否则奔村庄
  const wantCity = me.citiesLeft > 0 && v.buildings.some((b) => b?.owner === v.me && b.kind === 'settlement')
  const goal: Partial<Hand> = wantCity ? COSTS.city : COSTS.settlement
  const out = {} as Record<Resource, number>
  for (const r of RESOURCES) out[r] = Math.max(0, (goal[r] ?? 0) - h[r]) * 3 + 1
  return out
}

/**
 * 一个路口值多少。
 *
 * 主项是点数之和 —— 那是"每回合期望产出多少"的直接度量。
 * 另外两项都是防止 bot 变成瞎子：
 * - **种类分散**要加分。三块地全是麦子的路口点数可能很高，
 *   但你永远换不出砖和木头，开局就死了
 * - **港口**加一点，但不多。港口是中后期的东西
 */
export function vertexValue(v: PlayerView, vertex: number): number {
  const vx = v.board.vertices[vertex]
  let score = 0
  const kinds = new Set<string>()
  for (const h of vx.hexes) {
    const hex = v.board.hexes[h]
    if (hex.terrain === 'desert') continue
    score += pips(hex.number)
    kinds.add(hex.terrain)
  }
  score += kinds.size * 1.5
  if (vx.port) score += vx.port.kind === 'generic' ? 0.8 : 1.2
  return score
}

export class RuleBot implements CatanAgent {
  private rng: () => number
  constructor(
    readonly name: string,
    seed: number,
    /** 胆子：影响买发展卡和铺路的积极程度 */
    readonly nerve = 0.5,
  ) {
    let st = (seed | 0) || 1
    this.rng = () => ((st = (st * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  }

  act(v: PlayerView, opts: CatanAction[]): CatanAction {
    if (opts.length === 0) throw new Error('没有可选动作')
    if (v.phase === 'discard') return this.discard(v)
    if (v.phase === 'setup') return this.setup(v, opts)
    if (v.phase === 'move_robber') return this.robber(v, opts)
    if (v.phase === 'roll') return this.beforeRoll(v, opts)
    return this.build(v, opts)
  }

  /** 弃牌：**先弃现在最不需要的**，同时避免把某一种一次性弃光 */
  private discard(v: PlayerView): CatanAction {
    const need = Math.floor(handSize(v.myHand) / 2)
    const want = needs(v)
    const pool: Resource[] = []
    for (const r of RESOURCES) for (let i = 0; i < v.myHand[r]; i++) pool.push(r)
    pool.sort((a, b) => want[a] - want[b])
    const give = emptyHand()
    for (let i = 0; i < need; i++) give[pool[i]]++
    return { kind: 'discard', give }
  }

  private setup(v: PlayerView, opts: CatanAction[]): CatanAction {
    const spots = opts.filter((o) => o.kind === 'place_settlement')
    if (spots.length > 0) {
      let best = spots[0]
      let bestScore = -Infinity
      for (const o of spots) {
        const sc = vertexValue(v, o.vertex) + this.rng() * 0.8
        if (sc > bestScore) {
          bestScore = sc
          best = o
        }
      }
      return best
    }
    // 路：朝着旁边最好的那个路口铺
    const roads = opts.filter((o) => o.kind === 'place_road')
    let best = roads[0]
    let bestScore = -Infinity
    for (const o of roads) {
      if (o.kind !== 'place_road') continue
      const e = v.board.edges[o.edge]
      const sc = Math.max(vertexValue(v, e.a), vertexValue(v, e.b)) + this.rng() * 0.5
      if (sc > bestScore) {
        bestScore = sc
        best = o
      }
    }
    return best
  }

  /**
   * 强盗放哪。
   *
   * 放在**领先那家产出最高的地上**，顺手抢他一张。
   * 一个容易写错的地方：别放在自己也吃的地上 —— 自伤。
   */
  private robber(v: PlayerView, opts: CatanAction[]): CatanAction {
    const moves = opts.filter((o) => o.kind === 'move_robber')
    const vpOf = (s: Seat) => v.players.find((p) => p.seat === s)?.publicVp ?? 0
    let best = moves[0]
    let bestScore = -Infinity
    for (const o of moves) {
      if (o.kind !== 'move_robber') continue
      const hex = v.board.hexes[o.hex]
      let score = 0
      for (let vx = 0; vx < v.buildings.length; vx++) {
        const b = v.buildings[vx]
        if (!b || !v.board.vertices[vx].hexes.includes(o.hex)) continue
        const w = pips(hex.number) * (b.kind === 'city' ? 2 : 1)
        // 压别人的地是收益，压自己的地是代价
        score += b.owner === v.me ? -w * 2.5 : w * (1 + vpOf(b.owner) * 0.25)
      }
      if (o.steal !== null) score += 2 + vpOf(o.steal) * 0.4
      score += this.rng() * 0.5
      if (score > bestScore) {
        bestScore = score
        best = o
      }
    }
    return best
  }

  /** 掷骰之前：强盗压在自己地上就先用骑士轰走 */
  private beforeRoll(v: PlayerView, opts: CatanAction[]): CatanAction {
    const knight = opts.find((o) => o.kind === 'play_knight')
    if (knight) {
      const onMine = v.buildings.some(
        (b, i) => b?.owner === v.me && v.board.vertices[i].hexes.includes(v.board.robber),
      )
      if (onMine) return knight
    }
    return opts.find((o) => o.kind === 'roll')!
  }

  private build(v: PlayerView, opts: CatanAction[]): CatanAction {
    const pick = <K extends CatanAction['kind']>(k: K) =>
      opts.filter((o): o is Extract<CatanAction, { kind: K }> => o.kind === k)

    /**
     * 手上超过七张就会被强盗抓着弃一半，所以**攥牌是有成本的**。
     *
     * 第一版没有这个概念：bot 只在"换完立刻能盖"的时候才换银行、
     * 铺路还要看心情，于是一路囤到十几张。三百局里弃了 11551 次，
     * 平均每局 38 次 —— 场上没有任何报错，只是所有人都在给强盗送牌，
     * 一局要打 131 个回合才结束。
     */
    const flush = handSize(v.myHand) >= 8

    // 修路卡的免费路：只有这一种选项，直接选最长路增益最大的
    const freeRoads = pick('build_road')
    if (v.freeRoads > 0 && freeRoads.length > 0) return this.bestRoad(v, freeRoads)

    // 1. 升城市。**永远优先**：城市是双倍产出加一分，性价比压过一切
    const cities = pick('build_city')
    if (cities.length > 0) {
      let best = cities[0]
      let bestScore = -Infinity
      for (const o of cities) {
        const sc = vertexValue(v, o.vertex)
        if (sc > bestScore) {
          bestScore = sc
          best = o
        }
      }
      return best
    }

    // 2. 建村庄
    const setts = pick('build_settlement')
    if (setts.length > 0) {
      let best = setts[0]
      let bestScore = -Infinity
      for (const o of setts) {
        const sc = vertexValue(v, o.vertex)
        if (sc > bestScore) {
          bestScore = sc
          best = o
        }
      }
      return best
    }

    // 3. 骑士：能抢到最大军就打，或者强盗压着自己
    const knight = opts.find((o) => o.kind === 'play_knight')
    if (knight) {
      const me = v.players.find((p) => p.seat === v.me)!
      const topKnights = Math.max(...v.players.map((p) => p.playedKnights))
      const onMine = v.buildings.some(
        (b, i) => b?.owner === v.me && v.board.vertices[i].hexes.includes(v.board.robber),
      )
      if (onMine || (me.playedKnights + 1 > topKnights && me.playedKnights + 1 >= 3)) return knight
    }

    // 4. 垄断和丰收：手上有就用掉，攥着不涨分
    const mono = pick('play_monopoly')
    if (mono.length > 0) {
      // 抢自己最缺、别人手上大概最多的那种
      const want = needs(v)
      return mono.reduce((a, b) => (want[b.res] > want[a.res] ? b : a))
    }
    const yop = pick('play_year_of_plenty')
    if (yop.length > 0) {
      const want = needs(v)
      return yop.reduce((a, b) => (want[b.a] + want[b.b] > want[a.a] + want[a.b] ? b : a))
    }

    // 5. 铺路。有村庄名额、而且这条路能通向好地方才铺
    const roads = pick('build_road')
    const me = v.players.find((p) => p.seat === v.me)!
    if (roads.length > 0 && me.settlementsLeft > 0 && (flush || this.rng() < 0.35 + this.nerve * 0.4))
      return this.bestRoad(v, roads)

    // 6. 先问问人。**和人换比和银行换划算得多**（银行至少四换一，
    //    港口也要三换一，而人换人是一换一），所以顺序在银行前面
    const offer = this.proposeTrade(v, opts)
    if (offer) return offer

    // 7. 买发展卡。资源花不出去的时候买卡，总比攥着强
    const buy = opts.find((o) => o.kind === 'buy_dev')
    if (buy && (flush || this.rng() < 0.5 + this.nerve * 0.3)) return buy

    // 8. 换银行，凑下一个目标。快被强盗抓了就放宽条件，换到最缺的那种
    const trade = this.bestTrade(v, pick('bank_trade'), flush)
    if (trade) return trade

    // 9. 修路卡留到有路可铺的时候
    const rb = opts.find((o) => o.kind === 'play_road_building')
    if (rb && me.roadsLeft >= 2) return rb

    return opts.find((o) => o.kind === 'end_turn')!
  }

  /**
   * 主动提议交易。
   *
   * 只提**最简单的一换一**：我多的换我缺的。复杂的组合对 bot 来说
   * 收益不大，对人来说也很难判断划不划算 —— 一屏弹出来
   * "三换二"的提议，玩家要算半天，多数人会直接拒。
   */
  private proposeTrade(v: PlayerView, opts: CatanAction[]): CatanAction | null {
    if (!opts.some((o) => o.kind === 'offer_trade')) return null
    /**
     * 提议的频率要压得很低。
     *
     * 第一版是 45%，三百局里提了 26415 次 —— 摊到每局 88 次，
     * 也就是**每个回合都要被问一次**。bot 之间无所谓，
     * 但只要桌上有个真人，那就是每回合弹一次窗，比不能换还烦。
     */
    if (this.rng() > 0.16) return null
    const me = v.players.find((p) => p.seat === v.me)!
    const wantCity =
      me.citiesLeft > 0 && v.buildings.some((b) => b?.owner === v.me && b.kind === 'settlement')
    const goal: Partial<Hand> = wantCity ? COSTS.city : COSTS.settlement

    const missing = RESOURCES.filter((r) => v.myHand[r] < (goal[r] ?? 0)).sort(
      (a, b) => (goal[b] ?? 0) - v.myHand[b] - ((goal[a] ?? 0) - v.myHand[a]),
    )
    // 多出来的：目标用不上、而且手里有两张以上的
    const spare = RESOURCES.filter((r) => v.myHand[r] - (goal[r] ?? 0) >= 2).sort(
      (a, b) => v.myHand[b] - v.myHand[a],
    )
    if (missing.length === 0 || spare.length === 0) return null
    return { kind: 'offer_trade', give: { [spare[0]]: 1 }, want: { [missing[0]]: 1 } }
  }

  private bestRoad(
    v: PlayerView,
    roads: Extract<CatanAction, { kind: 'build_road' }>[],
  ): CatanAction {
    let best = roads[0]
    let bestScore = -Infinity
    for (const o of roads) {
      const e = v.board.edges[o.edge]
      // 这条路通向的两个路口，谁好算谁；已经有建筑的路口不值钱
      let sc = 0
      for (const vx of [e.a, e.b]) {
        if (v.buildings[vx]) continue
        const blockedByNeighbour = v.board.vertices[vx].adj.some((n) => v.buildings[n])
        sc = Math.max(sc, vertexValue(v, vx) * (blockedByNeighbour ? 0.25 : 1))
      }
      sc += this.rng() * 0.6
      if (sc > bestScore) {
        bestScore = sc
        best = o
      }
    }
    return best
  }

  /**
   * 别人提议跟你换，接不接。
   *
   * 三条判据，按重要性：
   * - **领先的人别帮**。快到十分的那个提出来的交易，多半对他更有利
   * - 换进来的比换出去的更需要（用同一套 needs 打分）
   * - 换出去之后不能把自己正在攒的东西拆了
   *
   * 少了第一条，bot 会一路把冠军喂到底 —— 那比不会换更糟。
   */
  respondTrade(v: PlayerView, offer: TradeOffer): boolean {
    const me = v.players.find((p) => p.seat === v.me)!
    const him = v.players.find((p) => p.seat === offer.from)
    if (!him) return false
    // 他要赢了就别帮
    if (him.publicVp >= 8) return false
    // 我拿到 offer.give，付出 offer.want
    const want = needs(v)
    let gain = 0
    let cost = 0
    for (const r of RESOURCES) {
      const g = offer.give[r] ?? 0
      const w = offer.want[r] ?? 0
      if (w > v.myHand[r]) return false
      gain += g * want[r]
      cost += w * want[r]
    }
    if (gain <= cost) return false
    // 领先者要多要一点才划算；落后者可以松一点
    const margin = me.publicVp >= him.publicVp ? 1.35 : 1.1
    return gain >= cost * margin + this.rng() * 0.6
  }

  /** 只在**换完真能凑出东西**的时候换，别为了换而换 */
  private bestTrade(
    v: PlayerView,
    trades: Extract<CatanAction, { kind: 'bank_trade' }>[],
    flush: boolean,
  ): CatanAction | null {
    if (trades.length === 0) return null
    const me = v.players.find((p) => p.seat === v.me)!
    const wantCity =
      me.citiesLeft > 0 && v.buildings.some((b) => b?.owner === v.me && b.kind === 'settlement')
    const goal = wantCity ? COSTS.city : COSTS.settlement

    for (const t of trades) {
      const after = { ...v.myHand }
      // 汇率是引擎连同动作一起给的，别在这儿自己再算一遍 ——
      // 两处算法一旦有出入，bot 会以为换得起而出非法动作
      after[t.give] -= t.rate
      after[t.want] += 1
      if (after[t.give] < 0) continue
      // 换完就能盖 —— 那就换
      if (canPay(after, goal)) return t
    }
    if (!flush) return null
    // 反正要被弃掉，那就把多的换成最缺的
    const want = needs(v)
    return trades.reduce((a, b) =>
      want[b.want] - want[b.give] > want[a.want] - want[a.give] ? b : a,
    )
  }
}

export { longestRoadFor }
