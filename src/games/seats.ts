import { useMemo } from 'react'
import { useMyRoom } from '../lobby/useLobby'

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
 * 这一局的名单：你 + 房里其余的人。
 *
 * `count` 由游戏决定（斗地主永远 3），**不是房间容量** ——
 * 虽然现在建房时容量就按游戏定死了，这个区分还是要留着：
 * 以后一间房里换着玩不同游戏时，人数是会变的。
 *
 * **你永远排在 0 号**。各游戏内部的座位号从这里起算，
 * 和房间里的排位无关 —— 房间里的位次是社交概念，
 * 牌局的座位号是规则概念，混在一起迟早出事。
 */
export function useRoster(count: number): RosterSeat[] {
  const room = useMyRoom()

  return useMemo(() => {
    if (!room || count <= 0) return []
    const me = room.players.find((p) => !p.isAI)
    const roster: RosterSeat[] = [
      { seat: 0, name: '你', color: me?.color ?? '#e2743a', isAI: false },
    ]
    // 房里其他人先上，不够再拿 FILLERS 兜底 ——
    // 你在房间里看到的是谁，开局之后对面就是谁
    const others = room.players.filter((p) => p.isAI)
    for (let i = 1; i < count; i++) {
      const o = others[i - 1]
      const f = FILLERS[(i - 1) % FILLERS.length]
      roster.push({ seat: i, name: o?.name ?? f.name, color: o?.color ?? f.color, isAI: true })
    }
    return roster
  }, [room, count])
}
