import { useMemo } from 'react'
import { useGameStore } from '../state/useGameStore'
import { usePlayerStore } from '../state/usePlayerStore'
import { tableById } from '../scene/hallLayout'

/**
 * 空位的补位 AI。
 *
 * 名字取自 UTS 周边的地名和人 —— Ultimo / Broadway / Haymarket 是校区所在，
 * Dysart 是 UTS Tower 的建筑师，Gehry 是 Building 8 的设计者。
 * 一桌陌生人如果只叫 P0…P5，坐下来是没有"这是个地方"的感觉的。
 */
export const FILLERS = [
  { name: 'Ultimo', color: '#9a6b3f' },
  { name: 'Broadway', color: '#4a6a7a' },
  { name: 'Haymarket', color: '#7a4a5f' },
  { name: 'Dysart', color: '#5f7a4a' },
  { name: 'Gehry', color: '#8c5a5a' },
  { name: 'Alumni', color: '#6d6a94' },
]

export type RosterSeat = {
  seat: number
  name: string
  color: string
  isAI: boolean
}

/**
 * 这一局的名单：你 + 若干补位 AI。
 *
 * `count` 由游戏决定（斗地主永远 3），**不是椅子数** ——
 * 六人桌开斗地主只坐三个人。你永远排在 0 号，
 * 各游戏内部的座位号从这里起算，和 3D 大厅里那把椅子的编号无关：
 * 大厅的椅子编号是空间概念，牌局的座位号是规则概念，混在一起迟早出事。
 */
export function useRoster(count: number): RosterSeat[] {
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const occupancy = useGameStore((s) => s.occupancy)

  return useMemo(() => {
    if (!seatedAt || count <= 0) return []
    const table = tableById(seatedAt.tableId)
    const occ = (table && occupancy[table.id]) || []
    const mine = occ[seatedAt.seat]

    const roster: RosterSeat[] = [
      { seat: 0, name: '你', color: mine?.color ?? '#c9a227', isAI: false },
    ]
    // 补位从大厅里那张桌子上真实坐着的 AI 取起，取不满再拿 FILLERS 兜底 ——
    // 这样你在大厅看到的是谁，坐下之后对面就是谁
    const others = occ.filter((_, i) => i !== seatedAt.seat).filter(Boolean)
    for (let i = 1; i < count; i++) {
      const o = others[i - 1]
      const f = FILLERS[(i - 1) % FILLERS.length]
      roster.push({
        seat: i,
        name: o?.name ?? f.name,
        color: o?.color ?? f.color,
        isAI: true,
      })
    }
    return roster
  }, [seatedAt, occupancy, count])
}
