import { create } from 'zustand'
import { TABLES } from '../scene/hallLayout'

export type Occupant = {
  name: string
  /** 面具主色 */
  color: string
  isAI: boolean
}

/** tableId -> (座位号 -> 占用者 | null) */
export type Occupancy = Record<string, (Occupant | null)[]>

type GameState = {
  occupancy: Occupancy
  /** 全局音量最大的座位，格式 "tableId:seat"；无人说话为 null */
  speakingKey: string | null
  setSpeakingKey: (k: string | null) => void
  /** 玩家坐下 / 起身时占位 */
  claimSeat: (tableId: string, seat: number, who: Occupant | null) => void
}

const NAMES = [
  ['Foxy', '#c1502e'],
  ['Bristle', '#b9737d'],
  ['Toar', '#4a5d63'],
  ['Scubby', '#7a5c3e'],
  ['Marlow', '#6d6a94'],
  ['Pella', '#9a6b3f'],
  ['Vex', '#3f6b5a'],
  ['Gundy', '#8c5a5a'],
  ['Ossa', '#5f7a4a'],
  ['Rook', '#7a4a5f'],
  ['Wren', '#4a6a7a'],
  ['Bram', '#8a6a3a'],
] as const

/**
 * Mock 占用数据。刻意留出空位，且每张桌子空的数量不同 ——
 * 走进大厅要一眼看出「哪桌能坐」。
 *
 * 二楼三桌留的空位更多：走上去发现没人可坐会很挫败，
 * 得让那趟楼梯是有回报的。
 */
function mockOccupancy(): Occupancy {
  // 每张桌子哪些座位是空的
  const emptyBySeat: Record<string, number[]> = {
    t1: [0, 3],
    t2: [2],
    t3: [0, 1, 4],
    t4: [1, 2, 3],
    t5: [2, 4],
    m1: [0, 2, 3],
    m2: [1, 3],
    m3: [0, 1, 3, 4],
  }
  let cursor = 0
  const out: Occupancy = {}
  for (const t of TABLES) {
    const empties = emptyBySeat[t.id] ?? []
    out[t.id] = Array.from({ length: t.seats }, (_, i) => {
      if (empties.includes(i)) return null
      const [name, color] = NAMES[cursor % NAMES.length]
      cursor++
      // 大约每三个里有一个是 AI
      return { name, color, isAI: cursor % 3 === 0 }
    })
  }
  return out
}

export const useGameStore = create<GameState>((set) => ({
  occupancy: mockOccupancy(),
  speakingKey: null,
  setSpeakingKey: (k) =>
    set((s) => (s.speakingKey === k ? s : { speakingKey: k })),
  claimSeat: (tableId, seat, who) =>
    set((s) => {
      const table = s.occupancy[tableId]
      if (!table) return s
      const next = table.slice()
      next[seat] = who
      return { occupancy: { ...s.occupancy, [tableId]: next } }
    }),
}))

export const seatKey = (tableId: string, seat: number) => `${tableId}:${seat}`
