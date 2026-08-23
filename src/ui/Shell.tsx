import { usePlayerStore } from '../state/usePlayerStore'
import { useLobby, useMyRoom } from '../lobby/useLobby'
import { Boom } from './Boom'
import { Lobby } from './lobby/Lobby'
import { RoomView } from './lobby/RoomView'
import { StartScreen } from './lobby/StartScreen'
import { SeatedOverlay } from './SeatedOverlay'

/**
 * 页面上盖在 3D 背景之上的那一层，只负责路由。
 *
 * 四屏一条线：**进场 → 大厅 → 房间 → 牌局**，退回去也是原路。
 * 判断顺序是从里往外写的（先看在不在局中，再看在不在房里），
 * 这样每一层只需要关心"我这层成立吗"，不用枚举别的层的状态。
 */
export function Shell() {
  const leave = useLobby((s) => s.leave)
  return (
    // 兜底放在路由外面：崩的那一屏被换掉之后，回大厅这条路必须还在
    <Boom onReset={leave}>
      <Screen />
    </Boom>
  )
}

function Screen() {
  const entered = usePlayerStore((s) => s.entered)
  const playing = useLobby((s) => s.playing)
  const room = useMyRoom()

  if (!entered) return <StartScreen />
  if (playing && room) return <SeatedOverlay />
  if (room) return <RoomView />
  return <Lobby />
}
