import { useLobby, useMyRoom } from '../lobby/useLobby'
import { PokerTable } from './poker/PokerTable'
import { DdzTable } from './ddz/DdzTable'
import { CatanTable } from './catan/CatanTable'

/**
 * 开局之后盖在 3D 背景上的那一层。
 *
 * 打什么由**房间**决定，不再是坐下之后现选 —— 大厅那一行必须
 * 提前说清楚这间打什么，不然点进去才发现不对是最讨厌的。
 *
 * **每个游戏组件都只在开局时挂载**：它们的会话是在 effect 里起的，
 * 不挂载就不会有第二局在后台偷偷跑。
 */
export function SeatedOverlay() {
  const playing = useLobby((s) => s.playing)
  const room = useMyRoom()

  if (!playing || !room) return null
  if (room.game === 'poker') return <PokerTable />
  if (room.game === 'ddz') return <DdzTable />
  return <CatanTable />
}
