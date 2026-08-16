import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { loudestAt } from '../audio/amplitudes'
import { startFakeDriver } from '../audio/fakeDriver'
import { useGameStore } from '../state/useGameStore'
import { usePlayerStore } from '../state/usePlayerStore'
import { PlayerRig } from '../player/PlayerRig'
import { SeatPicker } from '../player/SeatPicker'
import { TABLES, tableById } from './hallLayout'
import { Hall } from './hall/Hall'
import { TableUnit } from './hall/TableUnit'
import { Effects } from './Effects'
import { Lighting } from './Lighting'
import { LightBudget } from './LightBudget'
import { CueDriver, useEventBridge } from '../anim/CueDriver'
import { useDemoGame } from '../anim/useDemoGame'
import { useTableView } from '../state/useTableStore'
import { useCues } from '../anim/cues'
import { preloadModels } from './character/models'
import { gestureAtTable, registeredSeats, setActiveTable } from './character/rigRegistry'

// 模型必须在进大厅**之前**下载完。坐下那一刻才开始下载的话，
// 玩家会盯着空椅子等好几秒 —— 那正好是整个体验里期待值最高的时刻。
// 清单为空时这是个空操作。
preloadModels()

export function Scene() {
  // 落座后自动开一局演示对局。接 WebSocket 后换成真实事件源，
  // useEventBridge 那边一行不用改。
  const seated = usePlayerStore((s) => s.mode === 'seated')
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  // 人数必须跟着实际桌子走 —— 写死 5 的话坐到 6 人桌上会少一个人的动画
  const seatCount = seatedAt ? (tableById(seatedAt.tableId)?.seats ?? 5) : 5
  const demoEvents = useDemoGame(seated, seatCount)
  useEventBridge(demoEvents, seatCount)

  // 告诉 rig 登记表手势该往哪张桌子发。
  // cue 只知道座位号 —— 一局游戏只发生在一张桌子上，桌号是外部上下文。
  useEffect(() => {
    setActiveTable(seated ? (seatedAt?.tableId ?? null) : null)
    return () => setActiveTable(null)
  }, [seated, seatedAt])

  // 接真 WebRTC 时，把这一段换成：
  //   import { startWebRTCDriver } from '../audio/webrtcDriver'
  //   useEffect(() => startWebRTCDriver(), [])
  // 场景代码一行都不用改。
  useEffect(() => startFakeDriver(), [])

  return (
    <>
      <PlayerRig />
      <SeatPicker />
      <Lighting />
      <Hall />
      <ShadowBudget />
      <LightBudget />
      <CueDriver />
      <SpeakerTracker />
      <Effects />
      {import.meta.env.DEV && <DevHandle />}
    </>
  )
}

/** 开发期把 three 的 scene / camera 挂到 window，方便控制台排查 */
function DevHandle() {
  const { scene, camera, gl } = useThree()
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    const d = (w.__dolos ?? {}) as Record<string, unknown>
    d.scene = scene
    d.camera = camera
    d.gl = gl
    d.tableView = useTableView
    d.cues = useCues
    d.gesture = gestureAtTable
    d.rigs = registeredSeats
    w.__dolos = d
  }, [scene, camera, gl])
  return null
}

/**
 * 阴影预算：只让离玩家最近的两张桌子投实时阴影。
 *
 * 每盏 castShadow 的聚光灯都是一次额外的场景渲染。四张桌子全开
 * 会明显掉帧，而三米开外的桌子阴影根本看不清 —— 花在那里的
 * 每一帧都是白给的。
 */
function ShadowBudget() {
  const { camera } = useThree()
  const [near, setNear] = useState<string[]>([TABLES[0].id, TABLES[1].id])
  const frame = useRef(0)

  useFrame(() => {
    frame.current++
    // 每 20 帧重算一次就够，玩家不可能在 1/3 秒内跨越半个大厅
    if (frame.current % 20 !== 0) return
    const ranked = TABLES.map((t) => ({
      id: t.id,
      d: (camera.position.x - t.pos[0]) ** 2 + (camera.position.z - t.pos[1]) ** 2,
    }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map((r) => r.id)
    if (ranked[0] !== near[0] || ranked[1] !== near[1]) setNear(ranked)
  })

  return (
    <>
      {TABLES.map((t) => (
        <TableUnit key={t.id} table={t} castShadows={near.includes(t.id)} />
      ))}
    </>
  )
}

/**
 * 把"谁在说话"从每帧的音量数据降频写进 React store，给 HUD 用。
 *
 * 只跟踪玩家当前所在的那张桌子 —— HUD 只显示这一桌，
 * 没必要为看不见的桌子做状态更新。3D 那边不走这条路，
 * 它直接读 amplitudes 内存。
 */
function SpeakerTracker() {
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const setSpeakingKey = useGameStore((s) => s.setSpeakingKey)

  useFrame(() => {
    if (!seatedAt) {
      setSpeakingKey(null)
      return
    }
    const table = TABLES.find((t) => t.id === seatedAt.tableId)
    if (!table) return
    setSpeakingKey(loudestAt(table.id, table.seats))
  })

  return null
}
