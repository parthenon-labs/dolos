import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { loudestAt } from '../audio/amplitudes'
import { startFakeDriver } from '../audio/fakeDriver'
import { useGameStore } from '../state/useGameStore'
import { BackdropCamera } from './BackdropCamera'
import { TABLES } from './hallLayout'
import { Hall } from './hall/Hall'
import { TableUnit } from './hall/TableUnit'
import { Effects } from './Effects'
import { Lighting } from './Lighting'
import { LightBudget } from './LightBudget'
import { SignWall } from './uts/SignWall'
import { CampusModels } from './uts/CampusModels'
import { UtsDressing } from './uts/UtsDressing'
import { CueDriver } from '../anim/CueDriver'
import { useTavernLife } from '../anim/tavernLife'
import { useCues } from '../anim/cues'
import { preloadModels } from './character/models'
import { gestureAtTable, registeredSeats, setActiveTable } from './character/rigRegistry'

// 模型必须在进大厅**之前**下载完。坐下那一刻才开始下载的话，
// 玩家会盯着空椅子等好几秒 —— 那正好是整个体验里期待值最高的时刻。
// 清单为空时这是个空操作。
preloadModels()

/**
 * 大厅从"能走进去的 3D 空间"降级成了**背景**。
 *
 * 玩家现在在 2D 页面里挑房间，没有人再走进这座酒馆 ——
 * 但把它删掉是错的：一块会动、有人在打牌的背景，
 * 是这个产品和一个普通网页棋牌室之间唯一的区别。
 *
 * 所以这里做的是减法而不是删除：拿掉 PlayerRig 和 SeatPicker
 * （走动、落座、指针锁定全部不需要了），换上一台自己慢慢漂移的相机。
 * 场景、灯光、光源预算、UTS 那些一行没动。
 */
const BACKDROP_TABLE = 't3'
const BACKDROP_SEATS = 5

export function Scene() {
  // 背景里那桌人一直在动。**这是有意的** —— 空荡荡的酒馆当背景很惨淡，
  // 有人在动才叫"营业中"。
  useTavernLife(BACKDROP_SEATS)

  useEffect(() => {
    setActiveTable(BACKDROP_TABLE)
    return () => setActiveTable(null)
  }, [])

  // 接真 WebRTC 时，把这一段换成：
  //   import { startWebRTCDriver } from '../audio/webrtcDriver'
  //   useEffect(() => startWebRTCDriver(), [])
  // 场景代码一行都不用改。
  useEffect(() => startFakeDriver(), [])

  return (
    <>
      <BackdropCamera />
      <Lighting />
      <Hall />
      {/*
        UTS 元素。都是程序化几何体，没有任何外部资源，也不占光源预算
        （靠 emissive + 已有的 Bloom 发光）。

        位置是挑过的：幕墙在东墙、二楼挑台底下 —— 从南边入口走进来正对着它，
        而且挑台压低了那一片的天花，绿光打在下面刚好。
      */}
      <SignWall position={[9.82, 1.55, -4]} rotation={[0, -Math.PI / 2, 0]} />
      <CampusModels position={[-8.4, 0, -8.6]} rotation={[0, Math.PI / 2, 0]} />
      <UtsDressing />
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
  const setSpeakingKey = useGameStore((s) => s.setSpeakingKey)

  useFrame(() => {
    const table = TABLES.find((t) => t.id === BACKDROP_TABLE)
    if (!table) return
    setSpeakingKey(loudestAt(table.id, table.seats))
  })

  return null
}
