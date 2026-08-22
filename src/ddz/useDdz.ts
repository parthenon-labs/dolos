import { create } from 'zustand'
import type { Card } from './cards'
import type { Combo } from './combo'
import type { DdzEvent, PlayAction, PlayerView, Seat } from './types'

/**
 * 斗地主在**界面这一侧**的状态。
 *
 * 和德州那边同一个分工：引擎是真相，这里是"玩家此刻看到了多少"。
 * 斗地主对节奏的要求比德州还高一点 —— 三家轮流出牌，
 * 如果 bot 的两手在同一帧里刷出来，玩家根本看不出发生过什么。
 */

export type LogRow = { id: number; text: string; kind: 'action' | 'system' | 'result' }

/** 摆在某一家面前的最后一手牌。null 的 combo 表示"不要" */
export type Placed = { seat: Seat; combo: Combo | null; at: number }

export type Pending =
  | { kind: 'bid'; view: PlayerView; min: number; resolve: (score: number) => void }
  | { kind: 'play'; view: PlayerView; resolve: (a: PlayAction) => void }

type DdzState = {
  view: PlayerView | null
  pending: Pending | null
  log: LogRow[]
  /** 三家面前各摆着什么 */
  placed: Record<Seat, Placed | null>
  /** 玩家手上勾中的牌 */
  selected: Card[]
  gameNo: number
  scores: Record<Seat, number>
  /** 本局结束时的结算面板；null = 牌局进行中 */
  result: Extract<DdzEvent, { t: 'ended' }> | null
  /** 谁在思考 —— 用来给头像转圈 */
  thinking: Seat | null

  setView: (v: PlayerView) => void
  setPending: (p: Pending | null) => void
  push: (text: string, kind?: LogRow['kind']) => void
  place: (seat: Seat, combo: Combo | null) => void
  clearPlaced: () => void
  toggle: (c: Card) => void
  setSelected: (cs: Card[]) => void
  setScores: (s: Record<Seat, number>) => void
  setResult: (r: DdzState['result']) => void
  setThinking: (s: Seat | null) => void
  newGame: (n: number) => void
  reset: () => void
}

let logId = 0
const NO_PLACED: Record<Seat, Placed | null> = { 0: null, 1: null, 2: null }

export const useDdz = create<DdzState>((set) => ({
  view: null,
  pending: null,
  log: [],
  placed: { ...NO_PLACED },
  selected: [],
  gameNo: 0,
  scores: { 0: 0, 1: 0, 2: 0 },
  result: null,
  thinking: null,

  setView: (view) => set({ view }),
  setPending: (pending) => set({ pending }),
  push: (text, kind = 'action') =>
    set((s) => ({ log: [...s.log, { id: logId++, text, kind }].slice(-60) })),
  place: (seat, combo) =>
    set((s) => ({ placed: { ...s.placed, [seat]: { seat, combo, at: logId++ } } })),
  clearPlaced: () => set({ placed: { ...NO_PLACED } }),
  toggle: (c) =>
    set((s) => ({
      selected: s.selected.includes(c) ? s.selected.filter((x) => x !== c) : [...s.selected, c],
    })),
  setSelected: (selected) => set({ selected }),
  setScores: (scores) => set({ scores }),
  setResult: (result) => set({ result }),
  setThinking: (thinking) => set({ thinking }),
  newGame: (gameNo) =>
    set({ gameNo, placed: { ...NO_PLACED }, selected: [], result: null, thinking: null }),
  reset: () =>
    set({
      view: null,
      pending: null,
      log: [],
      placed: { ...NO_PLACED },
      selected: [],
      gameNo: 0,
      scores: { 0: 0, 1: 0, 2: 0 },
      result: null,
      thinking: null,
    }),
}))
