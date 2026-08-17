import { create } from 'zustand'
import type { GameEvent, PlayerId, PlayerView } from '../game/types'

/**
 * 一局对局在**界面这一侧**的状态。
 *
 * 和 `game/` 里的引擎状态刻意分开，理由和 3D 那边的 useTableStore 一样：
 * 引擎状态是真相，这里是"玩家此刻看到了多少"。
 * 事件是一瞬间全部产生的（bot 投票没有耗时），但人需要时间读，
 * 所以中间隔一个**揭示队列**。
 */

export type Msg =
  | { kind: 'speech'; seat: PlayerId; text: string; round: number }
  | { kind: 'system'; text: string; round: number }
  | {
      kind: 'proposal'
      seat: PlayerId
      team: PlayerId[]
      round: number
    }
  | { kind: 'vote'; votes: boolean[]; passed: boolean; round: number }
  | {
      kind: 'quest'
      questIndex: number
      fails: number
      success: boolean
      round: number
    }
  | { kind: 'assassination'; target: PlayerId; wasMerlin: boolean; round: number }

/** 需要玩家做的决定。UI 拿到它才渲染操作区 */
export type Pending =
  | { kind: 'propose'; view: PlayerView; resolve: (t: PlayerId[]) => void }
  | { kind: 'vote'; view: PlayerView; resolve: (v: boolean) => void }
  | { kind: 'quest'; view: PlayerView; resolve: (success: boolean) => void }
  | { kind: 'assassinate'; view: PlayerView; resolve: (t: PlayerId) => void }

type MatchState = {
  /** 已经揭示给玩家看的消息 */
  messages: Msg[]
  /** 还没揭示的，按顺序排队 */
  queue: Msg[]
  /** 我这一侧的视图。**界面只能读这个**，读引擎状态就是作弊 */
  view: PlayerView | null
  pending: Pending | null
  /** 当前提名轮次，用来给消息分组 */
  round: number
  /** true = 玩家按了快进，队列一次性放完 */
  rushing: boolean
  finished: null | { winner: 'good' | 'evil'; reason: string }

  push: (m: Msg) => void
  drainOne: () => void
  rush: () => void
  setView: (v: PlayerView) => void
  setPending: (p: Pending | null) => void
  finish: (w: 'good' | 'evil', reason: string) => void
  reset: () => void
  /** 队列空了吗 —— 决定要不要把操作区放出来 */
  isDrained: () => boolean
}

const EMPTY = {
  messages: [] as Msg[],
  queue: [] as Msg[],
  view: null,
  pending: null,
  round: 0,
  rushing: false,
  finished: null,
}

export const useMatch = create<MatchState>((set, get) => ({
  ...EMPTY,
  push: (m) => set((s) => ({ queue: [...s.queue, m] })),
  drainOne: () =>
    set((s) => {
      if (s.queue.length === 0) return s
      const [head, ...rest] = s.queue
      const round = head.kind === 'proposal' ? head.round : s.round
      return { messages: [...s.messages, head], queue: rest, round }
    }),
  rush: () =>
    set((s) => ({
      messages: [...s.messages, ...s.queue],
      queue: [],
      rushing: true,
    })),
  setView: (v) => set({ view: v }),
  setPending: (p) => set({ pending: p, rushing: false }),
  finish: (winner, reason) => set({ finished: { winner, reason } }),
  reset: () => set({ ...EMPTY }),
  isDrained: () => get().queue.length === 0,
}))

/**
 * 把一条引擎事件翻译成界面消息。
 *
 * 和 3D 那边的 `anim/gameCues.ts` 是同一个角色：**唯一知道"事件长什么样"的地方**。
 * 引擎不知道界面，界面不知道规则，中间只有 GameEvent 这一层契约。
 */
export function msgsFor(e: GameEvent, round: number): Msg[] {
  switch (e.t) {
    case 'started':
      return [{ kind: 'system', text: '对局开始', round }]
    case 'speech':
      return [{ kind: 'speech', seat: e.player, text: e.text, round }]
    case 'proposed':
      return [{ kind: 'proposal', seat: e.leader, team: e.team, round: round + 1 }]
    case 'voted': {
      const yes = e.votes.filter(Boolean).length
      return [
        { kind: 'vote', votes: e.votes, passed: yes * 2 > e.votes.length, round },
      ]
    }
    case 'vote_failed':
      return [
        {
          kind: 'system',
          text: `队伍被否决，连续第 ${e.consecutiveRejects} 次。满 5 次坏人直接获胜`,
          round,
        },
      ]
    case 'quest_played':
      return [
        {
          kind: 'quest',
          questIndex: e.questIndex,
          fails: e.fails,
          success: e.success,
          round,
        },
      ]
    case 'assassinated':
      return [
        { kind: 'assassination', target: e.target, wasMerlin: e.wasMerlin, round },
      ]
    case 'ended':
      return [
        {
          kind: 'system',
          text: e.winner === 'good' ? '好人阵营获胜' : '坏人阵营获胜',
          round,
        },
      ]
  }
}
