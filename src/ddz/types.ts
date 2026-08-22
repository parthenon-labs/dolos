import type { Card } from './cards'
import type { Combo } from './combo'

/**
 * 斗地主的状态、动作与事件。
 *
 * 沿用德州那边的地基：**状态是真相，发给玩家的永远是 PlayerView**。
 * 斗地主的隐藏信息比德州多得多 —— 另外两家一整手牌、以及定地主前的三张底牌，
 * 全都不能出现在投影里。整局唯一"允许玩家知道"的别人的信息只有**张数**。
 */

export type Seat = number

export type Phase = 'bidding' | 'playing' | 'ended'

export type PlayerState = {
  seat: Seat
  name: string
  color: string
  isAI: boolean
  cards: Card[]
  isLandlord: boolean
  /** 累计积分，跨局保留 */
  score: number
}

export type GameState = {
  gameNo: number
  players: PlayerState[]
  /** 三张底牌。定地主之前谁都不知道 */
  bottom: Card[]
  landlord: Seat | null
  /** 叫到几分。底分，结算时乘上去 */
  base: number
  turn: Seat
  /** 当前要压的牌。null = 自由出，可以出任何牌型 */
  required: { seat: Seat; combo: Combo } | null
  /** 连续 pass 数。到 2 就轮空回到出牌那家 */
  passes: number
  /** 炸弹翻倍，从 1 起 */
  multiplier: number
  phase: Phase
  winner: Seat | null
  /** 每家出过几手（不含 pass）。判春天要用 */
  plays: number[]
}

export type BidAction = { kind: 'bid'; score: number }
export type PlayAction = { kind: 'play'; cards: Card[] } | { kind: 'pass' }

/**
 * 发给某一家的视图。**这是隐藏信息唯一的出口**。
 *
 * 和德州那边一模一样的道理：别人的牌在这里就被抹成一个数字，
 * 不是靠前端不渲染。整个项目只有两处投影，正因为少，更不能靠自觉。
 */
export type PlayerView = {
  gameNo: number
  me: Seat
  myCards: Card[]
  /** 别人只剩张数 */
  players: { seat: Seat; name: string; color: string; isAI: boolean; count: number; isLandlord: boolean; score: number }[]
  /** 定地主之后才公开 */
  bottom: Card[] | null
  landlord: Seat | null
  base: number
  turn: Seat
  required: { seat: Seat; combo: Combo } | null
  multiplier: number
  phase: Phase
  /** 最近几手，界面上摆在各家面前。pass 也要记，不然看不出谁不要 */
  recent: { seat: Seat; combo: Combo | null }[]
}

export type SpringKind = 'none' | 'spring' | 'anti'

export type DdzEvent =
  | { t: 'game_started'; gameNo: number }
  | { t: 'bid'; seat: Seat; score: number }
  | { t: 'redeal'; reason: string }
  | { t: 'landlord'; seat: Seat; bottom: Card[]; base: number }
  | { t: 'played'; seat: Seat; combo: Combo; left: number }
  | { t: 'passed'; seat: Seat }
  | { t: 'multiplied'; seat: Seat; reason: '炸弹' | '王炸'; multiplier: number }
  | {
      t: 'ended'
      winner: Seat
      landlordWon: boolean
      spring: SpringKind
      multiplier: number
      base: number
      deltas: { seat: Seat; delta: number }[]
      /** 摊牌：结算时把大家剩的牌亮出来 */
      revealed: { seat: Seat; cards: Card[] }[]
    }

/** 出牌的一方是不是农民队友 */
export const isFarmer = (s: GameState, seat: Seat) => s.landlord !== null && seat !== s.landlord
