import { RESOURCES, makeBoard, type Resource } from './board'
import {
  emptyHand,
  handSize,
  type CatanAction,
  type CatanEvent,
  type DevKind,
  type GameState,
  type Hand,
  type PlayerState,
  type PlayerView,
  type Seat,
} from './types'

/**
 * 卡坦岛的规则引擎。
 *
 * 和前两个游戏一样是**纯的**：不碰计时器、不碰界面、随机源从外面传。
 * 但卡坦和牌类游戏有个结构性区别：一个回合里能做很多件事，
 * 而且顺序自由（掷骰之后想建就建、想换就换、想买卡就买卡）。
 * 所以这里不写"一手牌的流程"，而是写成**状态机 + 合法动作枚举**：
 *
 * - `legal(s, seat)` 列出此刻能做什么
 * - `apply(s, seat, a)` 执行一个动作
 *
 * 这么写的直接好处是**界面和 bot 吃同一份合法性**：
 * 按钮灰不灰、bot 有哪些选项，都来自同一个 `legal`。
 * 分成两套的话，界面允许的和引擎允许的迟早会分家。
 */

export const COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { ore: 3, grain: 2 },
  dev: { ore: 1, wool: 1, grain: 1 },
} as const satisfies Record<string, Partial<Hand>>

export const VP_TO_WIN = 10

const DEV_BAG: DevKind[] = [
  ...Array<DevKind>(14).fill('knight'),
  ...Array<DevKind>(5).fill('victory_point'),
  ...Array<DevKind>(2).fill('road_building'),
  ...Array<DevKind>(2).fill('year_of_plenty'),
  ...Array<DevKind>(2).fill('monopoly'),
]

const shuffle = <T,>(xs: T[], rng: () => number): T[] => {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const canPay = (h: Hand, cost: Partial<Hand>) =>
  RESOURCES.every((r) => h[r] >= (cost[r] ?? 0))

/**
 * 付钱。**必须把资源还给银行** —— 卡坦的资源是一副有限的牌，
 * 不是一个计数器。第一版只从手上扣、没往银行加，
 * 于是每盖一样东西就有几张资源永久消失：
 * 一局下来 95 张只剩 31 张，银行发空，产出停摆，谁也到不了 10 分。
 * 场面上看不出任何异常，只是"大家都很穷"。
 */
const pay = (s: S, h: Hand, cost: Partial<Hand>) => {
  for (const r of RESOURCES) {
    const n = cost[r] ?? 0
    h[r] -= n
    s.bank[r] += n
  }
}

export type Seats = { seat: Seat; name: string; color: string; isAI: boolean }[]

/**
 * 引擎内部比 GameState 多两个字段。
 *
 * `robberReturn` 是必需的：强盗动完之后回哪儿，取决于**为什么动它** ——
 * 掷出 7 是已经掷过了、回建造阶段；掷骰前打骑士是还没掷、回掷骰阶段；
 * 掷骰后打骑士则回建造阶段。三条路都真实存在，
 * 靠"看 dice 是不是 null"猜会在第三种情况上出错。
 */
export type EngineState = GameState & {
  lastSetupVertex: number | null
  robberReturn: 'roll' | 'build'
}

export function makeGame(seats: Seats, rng: () => number): EngineState {
  const board = makeBoard(rng)
  const players: PlayerState[] = seats.map((s) => ({
    ...s,
    hand: emptyHand(),
    dev: [],
    devFresh: 0,
    playedKnights: 0,
    roadsLeft: 15,
    settlementsLeft: 5,
    citiesLeft: 4,
    playedDevThisTurn: false,
  }))
  return {
    board,
    players,
    turn: 0,
    phase: 'setup',
    setupStep: 0,
    setupNeedsRoad: false,
    lastSetupVertex: null,
    robberReturn: 'build',
    dice: null,
    buildings: Array(board.vertices.length).fill(null),
    roads: Array(board.edges.length).fill(null),
    // 银行每种资源 19 张。发完了就是发完了 —— 这条规则很少触发，但它是真的
    bank: { brick: 19, lumber: 19, wool: 19, grain: 19, ore: 19 },
    devDeck: shuffle(DEV_BAG, rng),
    longestRoad: null,
    largestArmy: null,
    freeRoads: 0,
    mustDiscard: [],
    winner: null,
    turnNo: 0,
  }
}

type S = EngineState

/**
 * 投影。
 *
 * 卡坦的隐藏信息是**部分的**：别人手上几张牌是公开的，具体是哪几张不是。
 * 所以这里不能像斗地主那样整个字段抹掉，得压成 `handCount`。
 * 发展卡整张都是私密的，连"打过几张骑士"才是公开的。
 */
export function project(s: S, me: Seat): PlayerView {
  const self = s.players.find((p) => p.seat === me)!
  return {
    me,
    board: s.board,
    phase: s.phase,
    turn: s.turn,
    turnNo: s.turnNo,
    dice: s.dice,
    buildings: s.buildings,
    roads: s.roads,
    myHand: { ...self.hand },
    myDev: self.dev.slice(),
    myDevFresh: self.devFresh,
    players: s.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      color: p.color,
      isAI: p.isAI,
      handCount: handSize(p.hand),
      devCount: p.dev.length,
      playedKnights: p.playedKnights,
      publicVp: publicVp(s, p.seat),
      roadsLeft: p.roadsLeft,
      settlementsLeft: p.settlementsLeft,
      citiesLeft: p.citiesLeft,
      hasLongestRoad: s.longestRoad?.seat === p.seat,
      hasLargestArmy: s.largestArmy?.seat === p.seat,
    })),
    bank: { ...s.bank },
    devLeft: s.devDeck.length,
    freeRoads: s.freeRoads,
    mustDiscard: s.mustDiscard.slice(),
    setupStep: s.setupStep,
    setupNeedsRoad: s.setupNeedsRoad,
    winner: s.winner,
  }
}

/** 公开胜利点：村庄、城市、最长路、最大军。**不含发展卡里的胜利点** */
export function publicVp(s: S, seat: Seat): number {
  let vp = 0
  for (const b of s.buildings) if (b?.owner === seat) vp += b.kind === 'city' ? 2 : 1
  if (s.longestRoad?.seat === seat) vp += 2
  if (s.largestArmy?.seat === seat) vp += 2
  return vp
}

/** 真实胜利点，含手上扣着的胜利点卡。只有引擎和本人知道 */
export function totalVp(s: S, seat: Seat): number {
  const p = s.players.find((x) => x.seat === seat)!
  return publicVp(s, seat) + p.dev.filter((d) => d === 'victory_point').length
}

// ─────────────────────────────────────────────────────────────
// 摆放规则
// ─────────────────────────────────────────────────────────────

/** 距离规则：村庄不能和另一个建筑相邻。这条不check的话开局就崩 */
export function canPlaceSettlement(s: S, seat: Seat, v: number, setup: boolean): boolean {
  if (s.buildings[v]) return false
  const vx = s.board.vertices[v]
  if (vx.adj.some((n) => s.buildings[n])) return false
  if (setup) return true
  // 正常游戏里还必须连着自己的路
  return vx.edges.some((e) => s.roads[e] === seat)
}

export function canPlaceRoad(s: S, seat: Seat, e: number, setupVertex: number | null): boolean {
  if (s.roads[e] !== null) return false
  const ed = s.board.edges[e]
  if (setupVertex !== null) return ed.a === setupVertex || ed.b === setupVertex
  // 接着自己的路或自己的建筑；且不能从别人的建筑底下穿过去
  for (const v of [ed.a, ed.b]) {
    const b = s.buildings[v]
    if (b?.owner === seat) return true
    if (b && b.owner !== seat) continue
    if (s.board.vertices[v].edges.some((x) => s.roads[x] === seat)) return true
  }
  return false
}

/**
 * 某一家的最长路。
 *
 * 是"不重复走同一条路的最长路径"，不是路的总条数 —— 这两个数字经常不一样，
 * 而且**分叉的路会让人直觉上数错**。所以老老实实做 DFS。
 *
 * 一条容易漏的规则：路从别人的村庄底下**过不去**。
 * 断在那里是这个游戏里最要命的一招，漏了它最长路会算多。
 */
export function longestRoadFor(s: S, seat: Seat): number {
  const mine = s.roads.map((o, i) => (o === seat ? i : -1)).filter((i) => i >= 0)
  if (mine.length === 0) return 0
  const byVertex = new Map<number, number[]>()
  for (const e of mine) {
    const { a, b } = s.board.edges[e]
    ;(byVertex.get(a) ?? byVertex.set(a, []).get(a)!).push(e)
    ;(byVertex.get(b) ?? byVertex.set(b, []).get(b)!).push(e)
  }

  let best = 0
  const used = new Set<number>()
  const walk = (v: number, len: number) => {
    if (len > best) best = len
    // 到了别人的建筑上就断了，不能继续往前
    const b = s.buildings[v]
    if (b && b.owner !== seat && len > 0) return
    for (const e of byVertex.get(v) ?? []) {
      if (used.has(e)) continue
      used.add(e)
      const ed = s.board.edges[e]
      walk(ed.a === v ? ed.b : ed.a, len + 1)
      used.delete(e)
    }
  }
  for (const v of byVertex.keys()) walk(v, 0)
  return best
}

/** 最长路和最大军的归属。**只有严格超过才易主**，平手保持原状 */
function recomputeAwards(s: S, emit: (e: CatanEvent) => void) {
  let bestSeat: Seat | null = null
  let bestLen = 4 // 五条起才算
  for (const p of s.players) {
    const len = longestRoadFor(s, p.seat)
    if (len > bestLen) {
      bestLen = len
      bestSeat = p.seat
    }
  }
  if (bestSeat !== null) {
    const cur = s.longestRoad
    if (!cur || bestLen > cur.len) {
      if (cur?.seat !== bestSeat || cur.len !== bestLen) {
        s.longestRoad = { seat: bestSeat, len: bestLen }
        emit({ t: 'longest_road', seat: bestSeat, len: bestLen })
      }
    } else if (cur.seat === bestSeat) {
      s.longestRoad = { seat: bestSeat, len: bestLen }
    }
  } else if (s.longestRoad) {
    // 路被别人的村庄切断，可能没人够五条了
    s.longestRoad = null
  }

  let armySeat: Seat | null = null
  let armyN = 2 // 三张骑士起
  for (const p of s.players)
    if (p.playedKnights > armyN) {
      armyN = p.playedKnights
      armySeat = p.seat
    }
  if (armySeat !== null && s.largestArmy?.seat !== armySeat) {
    s.largestArmy = { seat: armySeat, n: armyN }
    emit({ t: 'largest_army', seat: armySeat, n: armyN })
  } else if (armySeat !== null) {
    s.largestArmy = { seat: armySeat, n: armyN }
  }
}

/** 这个路口能享受什么汇率。**只有自己有建筑的港口才算** */
export function tradeRate(s: S, seat: Seat, res: Resource): number {
  let rate = 4
  for (let v = 0; v < s.buildings.length; v++) {
    const b = s.buildings[v]
    if (b?.owner !== seat) continue
    const port = s.board.vertices[v].port
    if (!port) continue
    if (port.kind === 'generic') rate = Math.min(rate, 3)
    else if (port.kind === res) rate = Math.min(rate, 2)
  }
  return rate
}

// ─────────────────────────────────────────────────────────────
// 合法动作
// ─────────────────────────────────────────────────────────────

/** 现在该谁动。弃牌阶段是**别人**在动，这是唯一一处不是 turn 的情况 */
export function whoActs(s: S): Seat {
  if (s.phase === 'discard') return s.mustDiscard[0]
  return s.turn
}

export function legal(s: S, seat: Seat): CatanAction[] {
  const out: CatanAction[] = []
  const p = s.players.find((x) => x.seat === seat)!
  if (s.winner !== null) return out

  if (s.phase === 'setup') {
    if (s.setupNeedsRoad) {
      for (let e = 0; e < s.roads.length; e++)
        if (canPlaceRoad(s, seat, e, s.lastSetupVertex)) out.push({ kind: 'place_road', edge: e })
    } else {
      for (let v = 0; v < s.buildings.length; v++)
        if (canPlaceSettlement(s, seat, v, true)) out.push({ kind: 'place_settlement', vertex: v })
    }
    return out
  }

  if (s.phase === 'discard') {
    // 弃哪几张由界面/bot 自己拼，这里只说"要弃几张"。
    // 组合数太大，枚举出来没有意义
    return [{ kind: 'discard', give: emptyHand() }]
  }

  if (s.phase === 'move_robber') {
    for (let h = 0; h < s.board.hexes.length; h++) {
      if (h === s.board.robber) continue
      for (const victim of stealTargets(s, seat, h)) out.push({ kind: 'move_robber', hex: h, steal: victim })
      if (stealTargets(s, seat, h).length === 0) out.push({ kind: 'move_robber', hex: h, steal: null })
    }
    return out
  }

  if (s.phase === 'roll') {
    out.push({ kind: 'roll' })
    // 掷骰之前可以先打骑士 —— 这是真规则，而且是有意义的一步：
    // 先把强盗从自己的地上挪开，再掷
    if (canPlayDev(p, 'knight')) out.push({ kind: 'play_knight' })
    return out
  }

  if (s.phase !== 'build') return out

  // 免费路（修路卡）优先，用完之前不做别的
  if (s.freeRoads > 0) {
    for (let e = 0; e < s.roads.length; e++)
      if (canPlaceRoad(s, seat, e, null) && p.roadsLeft > 0) out.push({ kind: 'build_road', edge: e })
    if (out.length === 0) return [{ kind: 'end_turn' }]
    return out
  }

  if (p.roadsLeft > 0 && canPay(p.hand, COSTS.road))
    for (let e = 0; e < s.roads.length; e++)
      if (canPlaceRoad(s, seat, e, null)) out.push({ kind: 'build_road', edge: e })

  if (p.settlementsLeft > 0 && canPay(p.hand, COSTS.settlement))
    for (let v = 0; v < s.buildings.length; v++)
      if (canPlaceSettlement(s, seat, v, false)) out.push({ kind: 'build_settlement', vertex: v })

  if (p.citiesLeft > 0 && canPay(p.hand, COSTS.city))
    for (let v = 0; v < s.buildings.length; v++) {
      const b = s.buildings[v]
      if (b?.owner === seat && b.kind === 'settlement') out.push({ kind: 'build_city', vertex: v })
    }

  if (s.devDeck.length > 0 && canPay(p.hand, COSTS.dev)) out.push({ kind: 'buy_dev' })

  if (canPlayDev(p, 'knight')) out.push({ kind: 'play_knight' })
  if (canPlayDev(p, 'road_building')) out.push({ kind: 'play_road_building' })
  if (canPlayDev(p, 'monopoly'))
    for (const r of RESOURCES) out.push({ kind: 'play_monopoly', res: r })
  if (canPlayDev(p, 'year_of_plenty'))
    for (const a of RESOURCES) for (const b of RESOURCES) out.push({ kind: 'play_year_of_plenty', a, b })

  for (const give of RESOURCES) {
    const rate = tradeRate(s, seat, give)
    if (p.hand[give] < rate) continue
    for (const want of RESOURCES)
      if (want !== give && s.bank[want] > 0) out.push({ kind: 'bank_trade', give, want, rate })
  }

  out.push({ kind: 'end_turn' })
  return out
}

/** 本回合买的不能用，胜利点卡不能"打"，一回合只能打一张 */
function canPlayDev(p: PlayerState, kind: DevKind): boolean {
  if (p.playedDevThisTurn) return false
  const holding = p.dev.filter((d) => d === kind).length
  if (holding === 0) return false
  // 本回合买的那几张排在末尾，扣掉之后还有才算能打
  const fresh = p.dev.slice(p.dev.length - p.devFresh)
  return holding - fresh.filter((d) => d === kind).length > 0
}

/** 强盗放到某块地上，能抢谁 */
export function stealTargets(s: S, seat: Seat, hex: number): Seat[] {
  const out = new Set<Seat>()
  for (let v = 0; v < s.buildings.length; v++) {
    const b = s.buildings[v]
    if (!b || b.owner === seat) continue
    if (!s.board.vertices[v].hexes.includes(hex)) continue
    if (handSize(s.players.find((p) => p.seat === b.owner)!.hand) > 0) out.add(b.owner)
  }
  return [...out]
}

// ─────────────────────────────────────────────────────────────
// 执行
// ─────────────────────────────────────────────────────────────

/** 从银行拿资源。**银行发完了就发不出来** —— 这条规则冷门但是真的 */
function give(s: S, seat: Seat, res: Resource, n: number): number {
  const real = Math.min(n, s.bank[res])
  if (real <= 0) return 0
  s.bank[res] -= real
  s.players.find((p) => p.seat === seat)!.hand[res] += real
  return real
}

export function apply(
  s: S,
  seat: Seat,
  a: CatanAction,
  rng: () => number,
  emit: (e: CatanEvent) => void,
): void {
  const p = s.players.find((x) => x.seat === seat)!

  switch (a.kind) {
    case 'place_settlement': {
      if (!canPlaceSettlement(s, seat, a.vertex, true)) throw new Error('这个路口摆不了村庄')
      s.buildings[a.vertex] = { owner: seat, kind: 'settlement' }
      p.settlementsLeft--
      // 第二轮的村庄要发资源
      const secondRound = s.setupStep >= s.players.length
      let gained: Partial<Hand> | null = null
      if (secondRound) {
        gained = {}
        for (const h of s.board.vertices[a.vertex].hexes) {
          const hex = s.board.hexes[h]
          if (hex.terrain === 'desert') continue
          const got = give(s, seat, hex.terrain, 1)
          if (got) gained[hex.terrain] = (gained[hex.terrain] ?? 0) + got
        }
      }
      s.lastSetupVertex = a.vertex
      s.setupNeedsRoad = true
      emit({ t: 'setup_placed', seat, vertex: a.vertex, gained })
      return
    }

    case 'place_road': {
      if (!canPlaceRoad(s, seat, a.edge, s.lastSetupVertex)) throw new Error('这条路摆不了')
      s.roads[a.edge] = seat
      p.roadsLeft--
      emit({ t: 'setup_road', seat, edge: a.edge })
      s.setupNeedsRoad = false
      s.lastSetupVertex = null
      s.setupStep++
      const n = s.players.length
      if (s.setupStep >= 2 * n) {
        s.phase = 'roll'
        s.turn = 0
        s.turnNo = 1
        emit({ t: 'turn_started', seat: 0, turnNo: 1 })
      } else {
        // 蛇形：前 n 步顺着，后 n 步倒着
        s.turn = s.setupStep < n ? s.setupStep : 2 * n - 1 - s.setupStep
      }
      return
    }

    case 'roll': {
      const d: [number, number] = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)]
      s.dice = d
      const sum = d[0] + d[1]
      emit({ t: 'rolled', seat, dice: d, sum })
      if (sum === 7) {
        s.mustDiscard = s.players.filter((x) => handSize(x.hand) > 7).map((x) => x.seat)
        s.robberReturn = 'build'
        s.phase = s.mustDiscard.length > 0 ? 'discard' : 'move_robber'
        return
      }
      produce(s, sum, emit)
      s.phase = 'build'
      return
    }

    case 'discard': {
      const need = Math.floor(handSize(p.hand) / 2)
      const total = handSize(a.give)
      if (total !== need) throw new Error(`要弃 ${need} 张，给了 ${total} 张`)
      for (const r of RESOURCES) {
        if (a.give[r] > p.hand[r]) throw new Error('弃了手上没有的牌')
        p.hand[r] -= a.give[r]
        s.bank[r] += a.give[r]
      }
      emit({ t: 'discarded', seat, give: a.give })
      s.mustDiscard = s.mustDiscard.filter((x) => x !== seat)
      if (s.mustDiscard.length === 0) s.phase = 'move_robber'
      return
    }

    case 'move_robber': {
      if (a.hex === s.board.robber) throw new Error('强盗必须换一块地')
      s.board.robber = a.hex
      let stole: { from: Seat; res: Resource | null } | null = null
      if (a.steal !== null) {
        const victim = s.players.find((x) => x.seat === a.steal)!
        const pool: Resource[] = []
        for (const r of RESOURCES) for (let i = 0; i < victim.hand[r]; i++) pool.push(r)
        if (pool.length > 0) {
          const r = pool[Math.floor(rng() * pool.length)]
          victim.hand[r]--
          p.hand[r]++
          stole = { from: a.steal, res: r }
        } else {
          stole = { from: a.steal, res: null }
        }
      }
      emit({ t: 'robber_moved', seat, hex: a.hex, stole })
      s.phase = s.robberReturn
      return
    }

    case 'build_road': {
      if (!canPlaceRoad(s, seat, a.edge, null)) throw new Error('这条路接不上')
      if (s.freeRoads > 0) s.freeRoads--
      else pay(s, p.hand, COSTS.road)
      s.roads[a.edge] = seat
      p.roadsLeft--
      emit({ t: 'built', seat, what: 'road', where: a.edge })
      recomputeAwards(s, emit)
      checkWin(s, seat, emit)
      return
    }

    case 'build_settlement': {
      if (!canPlaceSettlement(s, seat, a.vertex, false)) throw new Error('这个路口建不了')
      pay(s, p.hand, COSTS.settlement)
      s.buildings[a.vertex] = { owner: seat, kind: 'settlement' }
      p.settlementsLeft--
      emit({ t: 'built', seat, what: 'settlement', where: a.vertex })
      // 新村庄可能切断别人的最长路
      recomputeAwards(s, emit)
      checkWin(s, seat, emit)
      return
    }

    case 'build_city': {
      const b = s.buildings[a.vertex]
      if (b?.owner !== seat || b.kind !== 'settlement') throw new Error('这里没有你的村庄')
      pay(s, p.hand, COSTS.city)
      s.buildings[a.vertex] = { owner: seat, kind: 'city' }
      p.citiesLeft--
      p.settlementsLeft++
      emit({ t: 'built', seat, what: 'city', where: a.vertex })
      checkWin(s, seat, emit)
      return
    }

    case 'buy_dev': {
      if (s.devDeck.length === 0) throw new Error('发展卡抽完了')
      pay(s, p.hand, COSTS.dev)
      p.dev.push(s.devDeck.pop()!)
      p.devFresh++
      emit({ t: 'bought_dev', seat })
      checkWin(s, seat, emit)
      return
    }

    case 'play_knight': {
      useDev(p, 'knight')
      p.playedKnights++
      emit({ t: 'played_dev', seat, card: 'knight' })
      recomputeAwards(s, emit)
      s.robberReturn = s.phase === 'roll' ? 'roll' : 'build'
      s.phase = 'move_robber'
      checkWin(s, seat, emit)
      return
    }

    case 'play_road_building': {
      useDev(p, 'road_building')
      s.freeRoads = Math.min(2, p.roadsLeft)
      emit({ t: 'played_dev', seat, card: 'road_building' })
      if (s.freeRoads === 0) return
      return
    }

    case 'play_year_of_plenty': {
      useDev(p, 'year_of_plenty')
      give(s, seat, a.a, 1)
      give(s, seat, a.b, 1)
      emit({ t: 'played_dev', seat, card: 'year_of_plenty', detail: `${a.a}+${a.b}` })
      return
    }

    case 'play_monopoly': {
      useDev(p, 'monopoly')
      let got = 0
      for (const other of s.players) {
        if (other.seat === seat) continue
        got += other.hand[a.res]
        other.hand[a.res] = 0
      }
      p.hand[a.res] += got
      emit({ t: 'played_dev', seat, card: 'monopoly', detail: `${a.res} ×${got}` })
      return
    }

    case 'bank_trade': {
      const rate = tradeRate(s, seat, a.give)
      if (p.hand[a.give] < rate) throw new Error('资源不够换')
      if (s.bank[a.want] <= 0) throw new Error('银行没有这种资源了')
      p.hand[a.give] -= rate
      s.bank[a.give] += rate
      p.hand[a.want] += 1
      s.bank[a.want] -= 1
      emit({ t: 'bank_traded', seat, give: a.give, want: a.want, rate })
      return
    }

    case 'end_turn': {
      p.devFresh = 0
      p.playedDevThisTurn = false
      s.freeRoads = 0
      s.dice = null
      s.turn = (s.turn + 1) % s.players.length
      s.turnNo++
      s.phase = 'roll'
      emit({ t: 'turn_started', seat: s.turn, turnNo: s.turnNo })
      return
    }
  }
}

function useDev(p: PlayerState, kind: DevKind) {
  const i = p.dev.indexOf(kind)
  if (i < 0) throw new Error(`手上没有${kind}`)
  p.dev.splice(i, 1)
  p.playedDevThisTurn = true
}

/** 产出。强盗压着的那块地不产 */
function produce(s: S, sum: number, emit: (e: CatanEvent) => void) {
  const rows: { seat: Seat; res: Resource; n: number }[] = []
  let blocked = false
  for (const hex of s.board.hexes) {
    if (hex.number !== sum || hex.terrain === 'desert') continue
    if (hex.id === s.board.robber) {
      blocked = true
      continue
    }
    for (let v = 0; v < s.buildings.length; v++) {
      const b = s.buildings[v]
      if (!b || !s.board.vertices[v].hexes.includes(hex.id)) continue
      const n = give(s, b.owner, hex.terrain, b.kind === 'city' ? 2 : 1)
      if (n > 0) {
        const row = rows.find((r) => r.seat === b.owner && r.res === hex.terrain)
        if (row) row.n += n
        else rows.push({ seat: b.owner, res: hex.terrain, n })
      }
    }
  }
  if (blocked) emit({ t: 'robber_blocked', hex: s.board.robber })
  if (rows.length > 0) emit({ t: 'produced', rows })
}

function checkWin(s: S, seat: Seat, emit: (e: CatanEvent) => void) {
  const vp = totalVp(s, seat)
  if (vp >= VP_TO_WIN) {
    s.winner = seat
    s.phase = 'ended'
    emit({ t: 'won', seat, vp })
  }
}
