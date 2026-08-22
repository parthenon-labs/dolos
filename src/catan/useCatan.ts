import { create } from 'zustand'
import type { CatanAction, CatanEvent, PlayerView, Seat } from './types'

/**
 * 卡坦岛在**界面这一侧**的状态。
 *
 * 卡坦和牌类游戏的区别在这里也体现出来：牌类的界面状态主要是"播到哪一步了"，
 * 而卡坦的界面状态主要是"此刻我能点什么"。
 * 所以这里存的核心是**待决动作和它的合法选项** —— 高亮哪些路口、
 * 哪些边能点、按钮灰不灰，全部从 `pending.options` 推出来，
 * 界面自己不判断一条规则。
 */

export type LogRow = { id: number; text: string; kind: 'action' | 'system' | 'result' }

export type Pending = {
  view: PlayerView
  options: CatanAction[]
  resolve: (a: CatanAction) => void
}

type CatanUi = {
  view: PlayerView | null
  pending: Pending | null
  log: LogRow[]
  /** 谁在思考 */
  thinking: Seat | null
  /** 最近一次掷骰，用来做骰子动画 */
  lastRoll: { dice: [number, number]; seat: Seat; at: number } | null
  result: Extract<CatanEvent, { t: 'won' }> | null

  setView: (v: PlayerView) => void
  setPending: (p: Pending | null) => void
  push: (text: string, kind?: LogRow['kind']) => void
  setThinking: (s: Seat | null) => void
  setLastRoll: (r: CatanUi['lastRoll']) => void
  setResult: (r: CatanUi['result']) => void
  reset: () => void
}

let logId = 0

export const useCatan = create<CatanUi>((set) => ({
  view: null,
  pending: null,
  log: [],
  thinking: null,
  lastRoll: null,
  result: null,

  setView: (view) => set({ view }),
  setPending: (pending) => set({ pending }),
  push: (text, kind = 'action') =>
    set((s) => ({ log: [...s.log, { id: logId++, text, kind }].slice(-80) })),
  setThinking: (thinking) => set({ thinking }),
  setLastRoll: (lastRoll) => set({ lastRoll }),
  setResult: (result) => set({ result }),
  reset: () =>
    set({ view: null, pending: null, log: [], thinking: null, lastRoll: null, result: null }),
}))

/** 从合法选项里挑出某一类，界面拿它做高亮 */
export function optionsOf<K extends CatanAction['kind']>(
  options: CatanAction[] | undefined,
  kind: K,
): Extract<CatanAction, { kind: K }>[] {
  return (options ?? []).filter((o): o is Extract<CatanAction, { kind: K }> => o.kind === kind)
}
