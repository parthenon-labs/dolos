import { type Card, freshDeck, shuffle } from './cards'
import { describe, evaluate } from './evaluate'
import { buildPots, settle } from './pots'
import type {
  Action,
  HandState,
  LegalActions,
  PlayerState,
  PlayerView,
  Seat,
  Street,
  TableConfig,
} from './types'

/**
 * 一手牌的状态机。
 *
 * 全部是纯函数：给一个状态和一个动作，返回新状态。
 * 这样服务端、bot 自我对弈、回放用的是同一份逻辑，
 * 而不是三份看起来一样的实现。
 *
 * 金额一律用**整数筹码**。小数会在分池时产生 0.999999，
 * 而扑克里筹码守恒是硬约束，一分钱都不能凭空出现。
 */

export function startHand(
  config: TableConfig,
  seats: { seat: Seat; name: string; color: string; isAI: boolean; stack: number }[],
  button: Seat,
  handNo: number,
  rng: () => number,
): HandState {
  const deck = shuffle(freshDeck(), rng)

  const players: PlayerState[] = seats.map((s) => ({
    seat: s.seat,
    name: s.name,
    color: s.color,
    isAI: s.isAI,
    stack: s.stack,
    committed: 0,
    totalCommitted: 0,
    cards: [],
    folded: false,
    allIn: false,
    // 没筹码的人这手牌不参与，但座位还在
    sittingOut: s.stack <= 0,
  }))

  const live = players.filter((p) => !p.sittingOut)
  if (live.length < 2) throw new Error('至少要两个有筹码的玩家')

  const state: HandState = {
    handNo,
    config,
    players,
    button,
    street: 'preflop',
    board: [],
    deck,
    toCall: 0,
    minRaise: config.bigBlind,
    turn: null,
    lastAggressor: null,
    acted: new Set(),
    pots: [],
    finished: false,
    results: [],
  }

  // 发底牌。一人一张轮着发两圈，和真实发牌一致 ——
  // 这不是形式主义：牌序影响可复现性，改了就对不上历史记录
  for (let round = 0; round < 2; round++) {
    for (const p of orderFrom(state, nextOccupied(state, button))) {
      p.cards.push(state.deck.pop()!)
    }
  }

  // 盲注
  const heads = live.length === 2
  // 单挑时钮位是小盲，且**翻牌前钮位先说话** —— 这条和多人局相反，最常写错
  const sb = heads ? button : nextOccupied(state, button)
  const bb = nextOccupied(state, sb)
  postBlind(state, sb, config.smallBlind)
  postBlind(state, bb, config.bigBlind)
  state.toCall = config.bigBlind
  state.minRaise = config.bigBlind
  state.lastAggressor = bb

  state.turn = nextToAct(state, bb)
  return state
}

function postBlind(s: HandState, seat: Seat, amount: number) {
  const p = seatOf(s, seat)
  const pay = Math.min(amount, p.stack)
  p.stack -= pay
  p.committed += pay
  p.totalCommitted += pay
  if (p.stack === 0) p.allIn = true
}

export const seatOf = (s: HandState, seat: Seat): PlayerState => {
  const p = s.players.find((x) => x.seat === seat)
  if (!p) throw new Error(`没有座位 ${seat}`)
  return p
}

/** 从某个座位开始按顺时针列出所有参与这手牌的人 */
function orderFrom(s: HandState, start: Seat): PlayerState[] {
  const out: PlayerState[] = []
  const n = s.players.length
  const startIdx = s.players.findIndex((p) => p.seat === start)
  for (let i = 0; i < n; i++) {
    const p = s.players[(startIdx + i) % n]
    if (!p.sittingOut) out.push(p)
  }
  return out
}

/** 下一个参与这手牌的座位（不管有没有弃牌/all-in） */
function nextOccupied(s: HandState, from: Seat): Seat {
  const n = s.players.length
  const idx = s.players.findIndex((p) => p.seat === from)
  for (let i = 1; i <= n; i++) {
    const p = s.players[(idx + i) % n]
    if (!p.sittingOut) return p.seat
  }
  throw new Error('没有可用座位')
}

/** 下一个**需要行动**的座位：没弃牌、没 all-in */
function nextToAct(s: HandState, from: Seat): Seat | null {
  const n = s.players.length
  const idx = s.players.findIndex((p) => p.seat === from)
  for (let i = 1; i <= n; i++) {
    const p = s.players[(idx + i) % n]
    if (!p.sittingOut && !p.folded && !p.allIn) return p.seat
  }
  return null
}

const active = (s: HandState) => s.players.filter((p) => !p.sittingOut && !p.folded)
const canAct = (s: HandState) => active(s).filter((p) => !p.allIn)

/* ---------------- 合法动作 ---------------- */

/**
 * 算出某个座位现在能做什么。
 *
 * **界面绝不许自己推这个。** 下注上限、最小加注、能不能过牌，
 * 每一条都有边界情况（筹码不够、all-in 不足最小加注量…），
 * 两处实现必然会分叉，而分叉的表现是玩家点了按钮却被引擎拒绝。
 */
export function legalActions(s: HandState, seat: Seat): LegalActions | null {
  const p = seatOf(s, seat)
  if (p.folded || p.allIn || p.sittingOut || s.finished) return null

  const owed = s.toCall - p.committed
  const callAmount = Math.min(owed, p.stack)
  const canCheck = owed === 0
  // 全场只剩一个能动的人时不需要再问
  const someoneElseCanAct = canAct(s).length > 1

  const maxRaiseTo = p.committed + p.stack
  // 加注下限：跟上当前注额，再加至少一个最小加注增量
  const wantMin = s.toCall + s.minRaise
  const minRaiseTo = Math.min(wantMin, maxRaiseTo)
  // 筹码只够跟注甚至不够跟注时不能加注（此时唯一的进攻手段是 all-in）
  const hasRaiseRoom = maxRaiseTo > s.toCall

  return {
    canFold: owed > 0,
    canCheck,
    callAmount,
    canCall: owed > 0 && p.stack > 0,
    canBet: s.toCall === 0 && hasRaiseRoom && someoneElseCanAct,
    canRaise: s.toCall > 0 && hasRaiseRoom && someoneElseCanAct,
    minRaiseTo,
    maxRaiseTo,
  }
}

/* ---------------- 应用动作 ---------------- */

export type ApplyResult = {
  state: HandState
  /** 实际发生的动作（可能被引擎修正，比如加注被降级成 all-in） */
  applied: Action
}

/**
 * 应用一个动作。
 *
 * 对不合法的动作**不抛错，而是纠正成最接近的合法动作**：
 * 和阿瓦隆那边同一条纪律 —— agent 给非法动作是常态而不是异常，
 * 整手牌不该因此崩掉。但纠正次数会被统计，它本身就是个能力指标。
 */
export function applyAction(s: HandState, seat: Seat, action: Action): ApplyResult {
  const legal = legalActions(s, seat)
  if (!legal) throw new Error(`座位 ${seat} 现在不该行动`)
  const p = seatOf(s, seat)
  const owed = s.toCall - p.committed

  let kind = action.kind
  // 不能过牌时把 check 当 fold 处理是错的（玩家会莫名其妙输掉牌），
  // 降级成跟注更接近意图
  if (kind === 'check' && !legal.canCheck) kind = 'call'
  if (kind === 'call' && legal.canCheck) kind = 'check'
  if ((kind === 'bet' || kind === 'raise') && !legal.canBet && !legal.canRaise) {
    kind = owed > 0 ? 'call' : 'check'
  }

  let applied: Action = { kind }

  switch (kind) {
    case 'fold':
      p.folded = true
      break

    case 'check':
      break

    case 'call': {
      const pay = Math.min(owed, p.stack)
      commit(p, pay)
      if (p.stack === 0) {
        p.allIn = true
        applied = { kind: 'allin', to: p.committed }
      }
      break
    }

    case 'allin': {
      const pay = p.stack
      commit(p, pay)
      p.allIn = true
      applied = { kind: 'allin', to: p.committed }
      raiseBookkeeping(s, p, seat)
      break
    }

    case 'bet':
    case 'raise': {
      const want = action.to ?? legal.minRaiseTo
      const to = Math.max(legal.minRaiseTo, Math.min(want, legal.maxRaiseTo))
      const pay = to - p.committed
      commit(p, pay)
      if (p.stack === 0) p.allIn = true
      applied = { kind: p.allIn ? 'allin' : kind, to: p.committed }
      raiseBookkeeping(s, p, seat)
      break
    }
  }

  s.acted.add(seat)
  advance(s)
  return { state: s, applied }
}

function commit(p: PlayerState, pay: number) {
  p.stack -= pay
  p.committed += pay
  p.totalCommitted += pay
}

/**
 * 加注之后要更新 toCall / minRaise / lastAggressor，并**重开一圈**。
 *
 * 关键规则：**all-in 金额不足一个最小加注增量时，不重开下注权**。
 * 也就是说已经行动过的人不能再加注，只能跟或弃。
 * 漏掉这条会让短码 all-in 变成无限重开的工具，是很容易被利用的漏洞。
 */
function raiseBookkeeping(s: HandState, p: PlayerState, seat: Seat) {
  const increment = p.committed - s.toCall
  if (p.committed > s.toCall) {
    const fullRaise = increment >= s.minRaise
    s.toCall = p.committed
    if (fullRaise) {
      s.minRaise = increment
      s.lastAggressor = seat
      // 完整加注：其他人重新获得行动权
      s.acted = new Set([seat])
    }
    // 不足额的 all-in：只更新要跟的金额，不重开一圈
  }
}

/** 本条街的下注是否结束 */
function bettingClosed(s: HandState): boolean {
  const live = canAct(s)
  if (live.length === 0) return true
  // 所有还能动的人都行动过，且投入相同
  return live.every((p) => s.acted.has(p.seat) && p.committed === s.toCall)
}

function advance(s: HandState) {
  // 只剩一个人没弃牌 —— 直接结束，不用摊牌
  if (active(s).length === 1) {
    finish(s, false)
    return
  }

  if (!bettingClosed(s)) {
    s.turn = nextToAct(s, s.turn!)
    // 找不到下一个能动的人（都 all-in 了），当作这条街结束
    if (s.turn === null) nextStreet(s)
    return
  }
  nextStreet(s)
}

const NEXT: Record<Street, Street> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
  river: 'showdown',
  showdown: 'showdown',
}

function nextStreet(s: HandState) {
  // 收拢本条街的投入
  for (const p of s.players) p.committed = 0
  s.toCall = 0
  s.minRaise = s.config.bigBlind
  s.lastAggressor = null
  s.acted = new Set()
  s.pots = buildPots(s.players)

  if (s.street === 'river') {
    finish(s, true)
    return
  }

  s.street = NEXT[s.street]
  // 每次发公共牌前烧一张，和真实牌桌一致（同样是为了可复现性）
  s.deck.pop()
  const n = s.street === 'flop' ? 3 : 1
  for (let i = 0; i < n; i++) s.board.push(s.deck.pop()!)

  // 还能行动的人不足两个时，剩下的街直接发完再摊牌
  if (canAct(s).length < 2) {
    s.turn = null
    nextStreet(s)
    return
  }
  s.turn = nextToAct(s, s.button)
}

function finish(s: HandState, showdown: boolean) {
  for (const p of s.players) p.committed = 0
  s.pots = buildPots(s.players)

  const contenders = active(s)
  const scores = new Map<Seat, number>()
  const labels = new Map<Seat, { score: number; label: string; best: Card[] }>()

  if (showdown && contenders.length > 1) {
    for (const p of contenders) {
      const r = evaluate([...p.cards, ...s.board])
      scores.set(p.seat, r.score)
      labels.set(p.seat, { score: r.score, label: describe(r), best: r.best })
    }
  } else {
    // 没摊牌：唯一没弃牌的人拿走全部，**底牌不公开**
    for (const p of contenders) scores.set(p.seat, 1)
  }

  const order = orderFrom(s, nextOccupied(s, s.button)).map((p) => p.seat)
  s.results = settle(s.players, s.pots, scores, labels, order)
  for (const r of s.results) seatOf(s, r.seat).stack += r.won

  s.street = 'showdown'
  s.turn = null
  s.finished = true
}

/* ---------------- 投影 ---------------- */

/**
 * 切给单个玩家看的视图。
 *
 * **别人的底牌在这里就被抹掉了**，不是靠前端不渲染。
 * 只有一处隐藏信息，反而更要在这一层切干净 —— 一旦漏，
 * 客户端改个变量就能看穿全场。
 */
export function project(s: HandState, me: Seat): PlayerView {
  const showdown = s.finished && s.results.some((r) => r.hand !== null)
  return {
    me,
    myCards: seatOf(s, me).cards.slice(),
    players: s.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      color: p.color,
      isAI: p.isAI,
      stack: p.stack,
      committed: p.committed,
      folded: p.folded,
      allIn: p.allIn,
      sittingOut: p.sittingOut,
      revealed:
        p.seat === me
          ? p.cards.slice()
          : showdown && !p.folded && s.results.some((r) => r.seat === p.seat && r.hand)
            ? p.cards.slice()
            : null,
    })),
    button: s.button,
    street: s.street,
    board: s.board.slice(),
    toCall: s.toCall,
    minRaise: s.minRaise,
    turn: s.turn,
    pots: s.pots.map((p) => ({ amount: p.amount, eligible: p.eligible.slice() })),
    config: s.config,
    legal: s.turn === me ? legalActions(s, me) : null,
  }
}

/** 界面要显示的"当前总底池"：已封的池 + 本条街还在桌上的投入 */
export const totalPot = (s: HandState | PlayerView) =>
  s.pots.reduce((a, p) => a + p.amount, 0) +
  (('players' in s ? s.players : []) as { committed: number }[]).reduce(
    (a, p) => a + p.committed,
    0,
  )
