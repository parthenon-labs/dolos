import { usePlayerStore } from '../state/usePlayerStore'
import { GamePicker } from './GamePicker'
import { PokerTable } from './poker/PokerTable'
import { DdzTable } from './ddz/DdzTable'
import { CatanTable } from './catan/CatanTable'

/**
 * 落座之后盖在 3D 上的那一层。
 *
 * 只做一件事：还没选游戏就出选择面板，选了就把台面交给对应的游戏。
 * **每个游戏组件都只在被选中时挂载** —— 它们的会话是在 effect 里起的，
 * 不挂载就不会有第二局牌在后台偷偷跑。
 */
export function SeatedOverlay() {
  const mode = usePlayerStore((s) => s.mode)
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const game = usePlayerStore((s) => s.game)

  if (mode !== 'seated' || !seatedAt) return null
  if (!game) return <GamePicker />
  if (game === 'poker') return <PokerTable />
  if (game === 'ddz') return <DdzTable />
  return <CatanTable />
}
