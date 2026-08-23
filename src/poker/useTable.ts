import { create } from 'zustand'
import type { Action, PlayerView, PokerEvent, Seat } from './types'

/**
 * 牌桌在**界面这一侧**的状态。
 *
 * 和引擎状态分开的理由和之前一样：引擎是真相，这里是"玩家此刻看到了多少"。
 * 但扑克有个额外的要求：**发牌、下注、揭牌必须一件一件看得见**。
 * 引擎算完一手牌只要几毫秒，全甩上去玩家什么都没看到就结束了。
 */

export type LogRow = {
  id: number
  text: string
  kind: 'action' | 'street' | 'result' | 'system'
}

type TableState = {
  view: PlayerView | null
  /** 轮到我时的待决动作 */
  pending: { view: PlayerView; resolve: (a: Action) => void } | null
  log: LogRow[]
  /** 刚刚行动过的座位，用来做高亮闪烁 */
  lastActor: Seat | null
  /** 摊牌时每个座位的牌型说明 */
  showdown: { seat: Seat; label: string; best: number[] }[]
  /** 本手牌的分配结果，用来飘筹码 */
  awarded: { seat: Seat; won: number }[]
  handNo: number
  /**
   * 牌局为什么结束了。null = 还在打。
   *
   * 这条一定要有：输光筹码之后，牌桌原来就那么停在那里，
   * 只有日志里一行小字说"你已经输光了"。**没有出口的静止画面看起来就是卡死。**
   */
  over: { title: string; detail: string } | null

  setView: (v: PlayerView) => void
  setPending: (p: TableState['pending']) => void
  push: (text: string, kind?: LogRow['kind']) => void
  setLastActor: (s: Seat | null) => void
  setShowdown: (r: { seat: Seat; label: string; best: number[] }[]) => void
  setAwarded: (r: { seat: Seat; won: number }[]) => void
  newHand: (n: number) => void
  setOver: (o: TableState['over']) => void
  reset: () => void
}

let logId = 0

export const useTable = create<TableState>((set) => ({
  view: null,
  pending: null,
  log: [],
  lastActor: null,
  showdown: [],
  awarded: [],
  handNo: 0,
  over: null,

  setView: (v) => set({ view: v }),
  setPending: (p) => set({ pending: p }),
  push: (text, kind = 'action') =>
    // 日志只留最近 60 条：这是给"刚才发生了什么"用的，不是完整牌谱。
    // 完整牌谱走事件流存库，不该占着内存
    set((s) => ({ log: [...s.log, { id: logId++, text, kind }].slice(-60) })),
  setLastActor: (lastActor) => set({ lastActor }),
  setShowdown: (showdown) => set({ showdown }),
  setAwarded: (awarded) => set({ awarded }),
  newHand: (handNo) => set({ handNo, showdown: [], awarded: [], lastActor: null }),
  setOver: (over) => set({ over }),
  reset: () =>
    set({ view: null, pending: null, log: [], lastActor: null, showdown: [], awarded: [], handNo: 0, over: null }),
}))

/** 把一条引擎事件翻成人话。**唯一知道事件怎么念的地方** */
export function describeEvent(
  e: PokerEvent,
  nameOf: (s: Seat) => string,
): { text: string; kind: LogRow['kind'] } | null {
  switch (e.t) {
    case 'hand_started':
      return { text: `—— 第 ${e.handNo} 手 ——`, kind: 'system' }
    case 'blinds':
      return {
        text: `${nameOf(e.small)} 小盲 ${e.smallAmount}，${nameOf(e.big)} 大盲 ${e.bigAmount}`,
        kind: 'system',
      }
    case 'acted': {
      const n = nameOf(e.seat)
      switch (e.action.kind) {
        case 'fold': return { text: `${n} 弃牌`, kind: 'action' }
        case 'check': return { text: `${n} 过牌`, kind: 'action' }
        case 'call': return { text: `${n} 跟注 ${e.committed}`, kind: 'action' }
        case 'bet': return { text: `${n} 下注 ${e.action.to}`, kind: 'action' }
        case 'raise': return { text: `${n} 加注到 ${e.action.to}`, kind: 'action' }
        case 'allin': return { text: `${n} 全下 ${e.committed}`, kind: 'action' }
      }
      return null
    }
    case 'street': {
      const cn = { flop: '翻牌', turn: '转牌', river: '河牌', preflop: '', showdown: '' }
      return { text: cn[e.street] || e.street, kind: 'street' }
    }
    case 'showdown':
      return {
        text: e.revealed.map((r) => `${nameOf(r.seat)}：${r.label}`).join('　'),
        kind: 'result',
      }
    case 'awarded': {
      const winners = e.rows.filter((r) => r.won > 0)
      if (winners.length === 0) return null
      return {
        text: winners.map((r) => `${nameOf(r.seat)} 赢得 ${r.won}`).join('　'),
        kind: 'result',
      }
    }
    default:
      return null
  }
}
