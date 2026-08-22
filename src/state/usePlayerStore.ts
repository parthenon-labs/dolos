import { create } from 'zustand'
import type { GameId } from '../games/registry'

/**
 * 玩家所处的模式。转场是显式状态而不是布尔开关 —— 转场中必须屏蔽输入，
 * 否则玩家能在相机飞行途中转头，画面会拧成麻花。
 */
export type Mode = 'walking' | 'sitting-down' | 'seated' | 'standing-up'

export type SeatRef = { tableId: string; seat: number }

type PlayerState = {
  mode: Mode
  /** 已落座的位置 */
  seatedAt: SeatRef | null
  /** 光标当前指着的空位 */
  hovered: SeatRef | null
  /** 是否已经过了进场页（也是 AudioContext 需要的那次用户手势） */
  entered: boolean
  /** 指针当前是否锁定。走动时锁，落座时解锁 */
  locked: boolean
  /**
   * 这一次落座选了什么游戏。null = 还停在选择面板上。
   *
   * 挂在玩家状态而不是桌子上：同一张桌子换个人坐下可以换个游戏，
   * 而离席就该忘掉 —— 起身回来重新选，比"上次打的还在那儿"更合直觉。
   */
  game: GameId | null

  setHovered: (s: SeatRef | null) => void
  setEntered: (v: boolean) => void
  setLocked: (v: boolean) => void
  chooseGame: (g: GameId | null) => void
  beginSit: (s: SeatRef) => void
  finishSit: () => void
  beginStand: () => void
  finishStand: () => void
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  mode: 'walking',
  seatedAt: null,
  hovered: null,
  entered: false,
  locked: false,
  game: null,

  setHovered: (s) =>
    set((prev) => {
      const a = prev.hovered
      if (a === s) return prev
      if (a && s && a.tableId === s.tableId && a.seat === s.seat) return prev
      return { hovered: s }
    }),

  setEntered: (v) => set((p) => (p.entered === v ? p : { entered: v })),
  setLocked: (v) => set((p) => (p.locked === v ? p : { locked: v })),

  chooseGame: (game) => set({ game }),

  beginSit: (s) => {
    if (get().mode !== 'walking') return
    set({ mode: 'sitting-down', seatedAt: s, hovered: null, game: null })
  },
  finishSit: () => set({ mode: 'seated' }),

  beginStand: () => {
    if (get().mode !== 'seated') return
    set({ mode: 'standing-up' })
  },
  finishStand: () => set({ mode: 'walking', seatedAt: null, game: null }),
}))
