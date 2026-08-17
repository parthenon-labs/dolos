import type { Card } from './cards'

/**
 * 德州扑克的状态与事件。
 *
 * 沿用阿瓦隆那套地基：**状态 = fold(事件)**，
 * 发给玩家的永远是 PlayerView 而不是完整状态。
 * 唯一的隐藏信息是底牌，但正因为只有这一处，
 * 更不能靠"前端别渲染"来藏 —— 投影在服务端就切干净。
 */

export type Seat = number

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'

export type Action = {
  kind: ActionKind
  /** bet/raise 时是**加注到多少**（total to），不是加了多少。见 engine 的说明 */
  to?: number
}

export type PlayerState = {
  seat: Seat
  name: string
  color: string
  isAI: boolean
  /** 手上还剩多少筹码（不含已投入本轮的） */
  stack: number
  /** 本条街已投入 */
  committed: number
  /** 本手牌累计已投入，算边池要用 */
  totalCommitted: number
  cards: Card[]
  folded: boolean
  allIn: boolean
  /** 坐着但这手牌没参与（中途加入、或上一手破产） */
  sittingOut: boolean
}

export type Pot = {
  amount: number
  /** 有资格争这个池的座位 */
  eligible: Seat[]
}

export type TableConfig = {
  smallBlind: number
  bigBlind: number
  /** 每人起始筹码 */
  startingStack: number
}

export type HandState = {
  handNo: number
  config: TableConfig
  players: PlayerState[]
  /** 庄家钮位 */
  button: Seat
  street: Street
  board: Card[]
  deck: Card[]
  /** 本条街当前需要跟到多少 */
  toCall: number
  /**
   * 最小加注增量。
   * 德扑规则：加注至少要比上一次加注的**增量**大，而不是比当前注额大。
   * 开局是大盲。
   */
  minRaise: number
  /** 轮到谁 */
  turn: Seat | null
  /** 本条街最后一个主动加注的人，用来判断一圈是否走完 */
  lastAggressor: Seat | null
  /** 本条街已经行动过的座位 */
  acted: Set<Seat>
  pots: Pot[]
  finished: boolean
  /** 摊牌结果，finished 后才有 */
  results: HandResultRow[]
}

export type HandResultRow = {
  seat: Seat
  won: number
  /** 摊牌时才公开；没摊牌就是 null */
  hand: { score: number; label: string; best: Card[] } | null
}

/* ---------------- 事件 ---------------- */

export type PokerEvent =
  | { t: 'hand_started'; handNo: number; button: Seat; seed: number }
  | { t: 'blinds'; small: Seat; big: Seat; smallAmount: number; bigAmount: number }
  /** 底牌只发给本人，事件里不带牌面 —— 见 project() */
  | { t: 'hole_dealt'; seat: Seat }
  | { t: 'acted'; seat: Seat; action: Action; committed: number; stack: number }
  | { t: 'street'; street: Street; board: Card[] }
  | { t: 'pots'; pots: Pot[] }
  /** best = 构成这手牌的五张，界面靠它高亮"是哪五张赢的" */
  | {
      t: 'showdown'
      revealed: { seat: Seat; cards: Card[]; label: string; best: Card[] }[]
    }
  | { t: 'awarded'; rows: HandResultRow[] }
  | { t: 'hand_ended'; handNo: number }

/* ---------------- 给单个玩家的视图 ---------------- */

export type PlayerView = {
  me: Seat
  /** 只有我自己的底牌。别人的永远是 null，除非摊牌 */
  myCards: Card[]
  players: {
    seat: Seat
    name: string
    color: string
    isAI: boolean
    stack: number
    committed: number
    folded: boolean
    allIn: boolean
    sittingOut: boolean
    /** 摊牌后才有值 */
    revealed: Card[] | null
  }[]
  button: Seat
  street: Street
  board: Card[]
  toCall: number
  minRaise: number
  turn: Seat | null
  pots: Pot[]
  config: TableConfig
  /** 我现在能做哪些动作，以及金额边界。**由引擎算，界面不许自己推** */
  legal: LegalActions | null
}

export type LegalActions = {
  canFold: boolean
  canCheck: boolean
  /** 跟注要付多少（可能小于 toCall，因为筹码不够就是 all-in） */
  callAmount: number
  canCall: boolean
  canBet: boolean
  canRaise: boolean
  /** 加注到的下限和上限（total to） */
  minRaiseTo: number
  maxRaiseTo: number
}
