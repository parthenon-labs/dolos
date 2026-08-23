import { Suspense, lazy } from 'react'
import { useLobby, useMyRoom } from '../lobby/useLobby'

/**
 * 三个牌桌各自成块，用到哪个下哪个。
 *
 * 一个只想打斗地主的人，没理由先下载卡坦的棋盘几何和德州的牌力评估。
 * 而且这三块本来就**只在开局时挂载**，懒加载和现有的生命周期正好对上。
 */
const PokerTable = lazy(() => import('./poker/PokerTable').then((m) => ({ default: m.PokerTable })))
const DdzTable = lazy(() => import('./ddz/DdzTable').then((m) => ({ default: m.DdzTable })))
const CatanTable = lazy(() => import('./catan/CatanTable').then((m) => ({ default: m.CatanTable })))

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
  return (
    <Suspense fallback={<div className="table-loading">正在开桌…</div>}>
      {room.game === 'poker' ? <PokerTable /> : room.game === 'ddz' ? <DdzTable /> : <CatanTable />}
    </Suspense>
  )
}
