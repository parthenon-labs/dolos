import type { Board, Resource } from './board'

/**
 * 卡坦岛的状态、动作与事件。
 *
 * 隐藏信息又出现了，而且比前两个游戏更细：
 * **别人手上有几张资源是公开的，具体是哪几张是私密的**；发展卡则整张都是私密的。
 * 所以投影不能整个字段抹掉，得把 `hand` 压成一个数字。
 * 这种"部分公开"最容易在前端顺手 `player.hand` 就漏掉，所以照样只走 project()。
 */

export type Seat = number
export type Hand = Record<Resource, number>

export type DevKind = 'knight' | 'road_building' | 'year_of_plenty' | 'monopoly' | 'victory_point'

export const DEV_NAMES: Record<DevKind, string> = {
  knight: '骑士',
  road_building: '修路',
  year_of_plenty: '丰收',
  monopoly: '垄断',
  victory_point: '胜利点',
}

export type Building = { owner: Seat; kind: 'settlement' | 'city' }

export type PlayerState = {
  seat: Seat
  name: string
  color: string
  isAI: boolean
  hand: Hand
  dev: DevKind[]
  /** 本回合买的发展卡不能马上用，记下张数 */
  devFresh: number
  playedKnights: number
  roadsLeft: number
  settlementsLeft: number
  citiesLeft: number
  /** 本回合已经打过一张发展卡。一回合只能打一张 */
  playedDevThisTurn: boolean
}

export type Phase =
  /** 开局摆村庄和路，蛇形顺序 */
  | 'setup'
  /** 该掷骰了 */
  | 'roll'
  /** 掷出 7，手牌超过 7 张的要弃一半 */
  | 'discard'
  /** 移动强盗（掷出 7 或者打了骑士） */
  | 'move_robber'
  /** 掷完了，可以建造和交易 */
  | 'build'
  | 'ended'

export type GameState = {
  board: Board
  players: PlayerState[]
  turn: Seat
  phase: Phase
  /** 开局摆放的步数，0..2n-1。蛇形：前 n 步顺着来，后 n 步倒着来 */
  setupStep: number
  /** 开局这一步是先摆村庄还是摆路 */
  setupNeedsRoad: boolean
  dice: [number, number] | null
  /** 路口 -> 建筑 */
  buildings: (Building | null)[]
  /** 边 -> 谁的路 */
  roads: (Seat | null)[]
  bank: Hand
  devDeck: DevKind[]
  longestRoad: { seat: Seat; len: number } | null
  largestArmy: { seat: Seat; n: number } | null
  /** 修路卡给的免费路额度 */
  freeRoads: number
  /** 掷出 7 之后还没弃牌的人 */
  mustDiscard: Seat[]
  winner: Seat | null
  turnNo: number
}

export type CatanAction =
  | { kind: 'place_settlement'; vertex: number }
  | { kind: 'place_road'; edge: number }
  | { kind: 'roll' }
  | { kind: 'discard'; give: Hand }
  | { kind: 'move_robber'; hex: number; steal: Seat | null }
  | { kind: 'build_road'; edge: number }
  | { kind: 'build_settlement'; vertex: number }
  | { kind: 'build_city'; vertex: number }
  | { kind: 'buy_dev' }
  | { kind: 'play_knight' }
  | { kind: 'play_road_building' }
  | { kind: 'play_year_of_plenty'; a: Resource; b: Resource }
  | { kind: 'play_monopoly'; res: Resource }
  | { kind: 'bank_trade'; give: Resource; want: Resource; rate: number }
  | { kind: 'end_turn' }

/** 发给某一家的视图。**隐藏信息唯一的出口** */
export type PlayerView = {
  me: Seat
  board: Board
  phase: Phase
  turn: Seat
  turnNo: number
  dice: [number, number] | null
  buildings: (Building | null)[]
  roads: (Seat | null)[]
  myHand: Hand
  myDev: DevKind[]
  myDevFresh: number
  players: {
    seat: Seat
    name: string
    color: string
    isAI: boolean
    /** 别人只看得到张数 */
    handCount: number
    devCount: number
    playedKnights: number
    /** 公开的胜利点：村庄、城市、最长路、最大军。**不含发展卡里的胜利点** */
    publicVp: number
    roadsLeft: number
    settlementsLeft: number
    citiesLeft: number
    hasLongestRoad: boolean
    hasLargestArmy: boolean
  }[]
  bank: Hand
  devLeft: number
  freeRoads: number
  mustDiscard: Seat[]
  setupStep: number
  setupNeedsRoad: boolean
  winner: Seat | null
}

export type CatanEvent =
  | { t: 'setup_placed'; seat: Seat; vertex: number; gained: Partial<Hand> | null }
  | { t: 'setup_road'; seat: Seat; edge: number }
  | { t: 'turn_started'; seat: Seat; turnNo: number }
  | { t: 'rolled'; seat: Seat; dice: [number, number]; sum: number }
  | { t: 'produced'; rows: { seat: Seat; res: Resource; n: number }[] }
  | { t: 'robber_blocked'; hex: number }
  | { t: 'discarded'; seat: Seat; give: Hand }
  | { t: 'robber_moved'; seat: Seat; hex: number; stole: { from: Seat; res: Resource | null } | null }
  | { t: 'built'; seat: Seat; what: 'road' | 'settlement' | 'city'; where: number }
  | { t: 'bought_dev'; seat: Seat }
  | { t: 'played_dev'; seat: Seat; card: DevKind; detail?: string }
  | { t: 'bank_traded'; seat: Seat; give: Resource; want: Resource; rate: number }
  | { t: 'longest_road'; seat: Seat; len: number }
  | { t: 'largest_army'; seat: Seat; n: number }
  | { t: 'won'; seat: Seat; vp: number }

export const emptyHand = (): Hand => ({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 })
export const handSize = (h: Hand) => h.brick + h.lumber + h.wool + h.grain + h.ore
