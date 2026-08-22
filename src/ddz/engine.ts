import { freshDeck, removeCards, shuffle, sortCards, type Card } from './cards'
import { beats, isBomb, parse, type Combo } from './combo'
import type {
  BidAction,
  DdzEvent,
  GameState,
  PlayAction,
  PlayerState,
  PlayerView,
  Seat,
  SpringKind,
} from './types'

/**
 * 一局斗地主。
 *
 * 引擎是**纯的**：不碰计时器、不碰界面、不碰 Math.random。
 * 随机源从外面传进来，所以一局牌能靠种子完整重放 ——
 * bot 出了什么迷之操作、谁的牌算错了，都能原样跑第二遍。
 * 界面那层的节奏和动画一律不在这里。
 */

export interface DdzAgent {
  /** 叫分。返回 0 表示不叫；必须严格大于 `min`，否则视为不叫 */
  bid(view: PlayerView, min: number): Promise<number> | number
  play(view: PlayerView): Promise<PlayAction> | PlayAction
}

export type Seats = { seat: Seat; name: string; color: string; isAI: boolean; score: number }[]

/** 三家 17 张，留三张底牌 */
export function deal(rng: () => number): { hands: Card[][]; bottom: Card[] } {
  const d = shuffle(freshDeck(), rng)
  return {
    hands: [sortCards(d.slice(0, 17)), sortCards(d.slice(17, 34)), sortCards(d.slice(34, 51))],
    bottom: sortCards(d.slice(51, 54)),
  }
}

/**
 * 投影。**隐藏信息在这里、也只在这里被切掉**。
 *
 * 别人的手牌变成一个数字，底牌在定地主之前是 null。
 * 一旦这个函数漏了，客户端改个变量就能看穿全场 —— 前端渲染层的任何"别显示"都不算数。
 */
export function project(s: GameState, me: Seat, recent: { seat: Seat; combo: Combo | null }[]): PlayerView {
  const self = s.players.find((p) => p.seat === me)
  return {
    gameNo: s.gameNo,
    me,
    myCards: self ? sortCards(self.cards) : [],
    players: s.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      color: p.color,
      isAI: p.isAI,
      count: p.cards.length,
      isLandlord: p.isLandlord,
      score: p.score,
    })),
    bottom: s.landlord === null ? null : s.bottom,
    landlord: s.landlord,
    base: s.base,
    turn: s.turn,
    required: s.required,
    multiplier: s.multiplier,
    phase: s.phase,
    recent: recent.slice(-3),
  }
}

/** 出这手牌合不合法。**引擎和界面共用同一个判断**，不允许各写一套 */
export function validatePlay(
  s: GameState,
  seat: Seat,
  cards: Card[],
): { ok: true; combo: Combo } | { ok: false; why: string } {
  const p = s.players.find((x) => x.seat === seat)
  if (!p) return { ok: false, why: '没有这个座位' }
  const pool = p.cards.slice()
  for (const c of cards) {
    const i = pool.indexOf(c)
    if (i < 0) return { ok: false, why: '打出了手里没有的牌' }
    pool.splice(i, 1)
  }
  const combo = parse(cards)
  if (!combo) return { ok: false, why: '不成牌型' }
  if (!beats(combo, s.required?.combo ?? null)) return { ok: false, why: '压不住上家' }
  return { ok: true, combo }
}

export type GameResult = {
  state: GameState
  events: DdzEvent[]
  winner: Seat
  landlordWon: boolean
  deltas: { seat: Seat; delta: number }[]
}

/**
 * 叫地主。
 *
 * 用叫分制而不是"叫/不叫"：一句"三分"就能把这局的赌注抬起来，
 * 而且给了 bot 一个表达手牌强度的出口 —— 不然定地主完全是随机的，
 * 打起来会觉得每一局都一样。
 *
 * 三家都不叫就重新发牌。这个分支不能省 —— 三家都是烂牌是真会发生的。
 */
async function runBidding(
  s: GameState,
  agents: Map<Seat, DdzAgent>,
  first: Seat,
  emit: (e: DdzEvent) => void,
  recent: { seat: Seat; combo: Combo | null }[],
): Promise<{ landlord: Seat; base: number } | null> {
  let best = 0
  let bestSeat: Seat | null = null
  for (let i = 0; i < 3; i++) {
    const seat = (first + i) % 3
    const a = agents.get(seat)!
    const raw = await a.bid(project(s, seat, recent), best)
    // 叫的分不比现有的高就算不叫。**在引擎里归一化，不指望 agent 守规矩**
    const score = Number.isFinite(raw) && raw > best && raw <= 3 ? Math.floor(raw) : 0
    emit({ t: 'bid', seat, score })
    if (score > 0) {
      best = score
      bestSeat = seat
      if (score === 3) break // 叫满了，后面没人能再抬
    }
  }
  if (bestSeat === null) return null
  return { landlord: bestSeat, base: best }
}

export async function runGame(
  gameNo: number,
  seats: Seats,
  agents: Map<Seat, DdzAgent>,
  rng: () => number,
  emit: (e: DdzEvent) => void,
  firstBidder: Seat = 0,
): Promise<GameResult> {
  let s: GameState
  let attempts = 0

  // 三家都不叫就重发。理论上能一直不叫，所以给个上限 ——
  // 到了上限强制让第一个叫牌的人当地主，总比死循环好
  for (;;) {
    const { hands, bottom } = deal(rng)
    const players: PlayerState[] = seats.map((x, i) => ({
      seat: x.seat,
      name: x.name,
      color: x.color,
      isAI: x.isAI,
      cards: hands[i],
      isLandlord: false,
      score: x.score,
    }))
    s = {
      gameNo,
      players,
      bottom,
      landlord: null,
      base: 1,
      turn: firstBidder,
      required: null,
      passes: 0,
      multiplier: 1,
      phase: 'bidding',
      winner: null,
      plays: [0, 0, 0],
    }
    emit({ t: 'game_started', gameNo })

    const r = await runBidding(s, agents, firstBidder, emit, [])
    if (r) {
      s.landlord = r.landlord
      s.base = r.base
      break
    }
    attempts++
    if (attempts >= 8) {
      s.landlord = firstBidder
      s.base = 1
      emit({ t: 'redeal', reason: '连续无人叫地主，由第一家兜底' })
      break
    }
    emit({ t: 'redeal', reason: '三家都不叫，重新发牌' })
  }

  // 地主拿底牌
  const lord = s.players.find((p) => p.seat === s.landlord)!
  lord.isLandlord = true
  lord.cards = sortCards([...lord.cards, ...s.bottom])
  emit({ t: 'landlord', seat: lord.seat, bottom: s.bottom, base: s.base })

  s.phase = 'playing'
  s.turn = lord.seat
  const recent: { seat: Seat; combo: Combo | null }[] = []

  const events: DdzEvent[] = []
  const record = (e: DdzEvent) => {
    events.push(e)
    emit(e)
  }

  // 出牌
  for (let guard = 0; guard < 1000; guard++) {
    const seat = s.turn
    const p = s.players.find((x) => x.seat === seat)!
    const view = project(s, seat, recent)
    const free = s.required === null

    const action: PlayAction = await agents.get(seat)!.play(view)

    if (action.kind === 'pass') {
      // 自由出牌时不许不要 —— 不然三家互相让，牌局永远不结束
      if (free) throw new Error(`${p.name} 在自由出牌时选择了不要，这是非法动作`)
      s.passes++
      recent.push({ seat, combo: null })
      record({ t: 'passed', seat })
    } else {
      const v = validatePlay(s, seat, action.cards)
      if (!v.ok) throw new Error(`${p.name} 出了非法的牌：${v.why}`)
      p.cards = removeCards(p.cards, action.cards)
      s.required = { seat, combo: v.combo }
      s.passes = 0
      s.plays[seat]++
      recent.push({ seat, combo: v.combo })
      record({ t: 'played', seat, combo: v.combo, left: p.cards.length })
      if (isBomb(v.combo)) {
        s.multiplier *= 2
        record({
          t: 'multiplied',
          seat,
          reason: v.combo.type === 'rocket' ? '王炸' : '炸弹',
          multiplier: s.multiplier,
        })
      }
      if (p.cards.length === 0) {
        s.winner = seat
        s.phase = 'ended'
        break
      }
    }

    s.turn = (seat + 1) % 3
    // 两家都不要，回到出牌那家自由出
    if (s.passes >= 2) {
      s.passes = 0
      s.required = null
    }
  }

  if (s.winner === null) throw new Error('牌局没有分出胜负 —— 出牌循环耗尽，这是引擎 bug')

  const landlordWon = s.winner === s.landlord
  const spring = detectSpring(s, landlordWon)
  const multiplier = s.multiplier * (spring === 'none' ? 1 : 2)
  const unit = s.base * multiplier

  /**
   * 结算。地主一个人对两个农民，所以地主的进出是农民的两倍。
   *
   * **总和必须精确为零** —— 这是这个游戏唯一的守恒律，
   * 和德州的筹码守恒是同一个位置的东西。分错了它立刻不成立。
   */
  const deltas = s.players.map((p) => ({
    seat: p.seat,
    delta: p.isLandlord ? (landlordWon ? 2 * unit : -2 * unit) : landlordWon ? -unit : unit,
  }))
  const sum = deltas.reduce((a, d) => a + d.delta, 0)
  if (sum !== 0)
    throw new Error(`积分不守恒：三家加起来是 ${sum}，应该是 0 —— 结算写错了`)

  for (const p of s.players) p.score += deltas.find((d) => d.seat === p.seat)!.delta

  record({
    t: 'ended',
    winner: s.winner,
    landlordWon,
    spring,
    multiplier,
    base: s.base,
    deltas,
    revealed: s.players.map((p) => ({ seat: p.seat, cards: sortCards(p.cards) })),
  })

  return { state: s, events, winner: s.winner, landlordWon, deltas }
}

/**
 * 春天：地主赢了而两个农民一手牌都没出过。反春天：农民赢了而地主只出过第一手。
 *
 * 注意**判的是"出过牌"而不是"pass 过"** —— 农民一路 pass 到底才算春天，
 * 中间抢到过一次出牌权就不算，哪怕那手牌毫无作用。
 */
function detectSpring(s: GameState, landlordWon: boolean): SpringKind {
  const lord = s.landlord!
  const farmerPlays = s.plays.reduce((a, n, i) => a + (i === lord ? 0 : n), 0)
  if (landlordWon && farmerPlays === 0) return 'spring'
  if (!landlordWon && s.plays[lord] <= 1) return 'anti'
  return 'none'
}

export type { BidAction }
