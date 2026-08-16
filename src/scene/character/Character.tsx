import {
  Component,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getAmp } from '../../audio/amplitudes'
import { seatFacing, seatLocal } from '../hallLayout'
import type { Occupant } from '../../state/useGameStore'
import { GltfCharacter } from './GltfCharacter'
import { ProceduralCharacter } from './ProceduralCharacter'
import { modelForSeat } from './models'
import { type RigHandle, makeRigState } from './rig'
import { registerRig, unregisterRig } from './rigRegistry'

/** 超过这个距离就不显示名牌，否则整个大厅飘满字 */
const LABEL_DISTANCE = 6.5
/** 超过这个距离掉到低模。刚好是"看不清五官"的距离 */
const LOD_DISTANCE = 7.5

/**
 * 一个座位上的角色。
 *
 * 这一层只做三件事：摆位置、每帧喂 RigState、挂名牌。
 * **它不知道角色是几何体拼的还是 glTF** —— 那是 rig.ts 契约下面的事。
 */
export function Character({
  tableId,
  seat,
  seatCount,
  occupant,
}: {
  tableId: string
  seat: number
  seatCount: number
  occupant: Occupant
}) {
  const rig = useRef<RigHandle | null>(null)
  const holder = useRef<THREE.Group>(null)
  const state = useMemo(makeRigState, [])
  const [labelVisible, setLabelVisible] = useState(false)
  const [lod, setLod] = useState<'full' | 'cheap'>('full')

  const worldPos = useRef(new THREE.Vector3())
  const frame = useRef(0)

  /**
   * 登记到 rig 表，让动画 cue 能指挥这个座位做动作。
   *
   * 必须用 callback ref，不能用 useEffect：
   * Suspense 兜底角色 → glTF 角色的切换发生在**同一次提交**里，
   * ref 换了但依赖数组没变，effect 不会重跑 —— 表里会留一个已卸载的 handle，
   * 表现是模型加载完成后角色再也不做动作。callback ref 跟着实际挂载走，不会漏。
   */
  const attach = useCallback(
    (h: RigHandle | null) => {
      rig.current = h
      if (h) registerRig(tableId, seat, h)
      else unregisterRig(tableId, seat)
    },
    [tableId, seat],
  )

  useFrame(({ camera }, dt) => {
    // 音量直接读模块级内存，不经过 React —— 每帧 setState 会炸掉性能
    state.amp = getAmp(tableId, seat)
    rig.current?.update(state, Math.min(dt, 0.05))

    // 距离相关的判断 8 帧算一次就够，每帧算是浪费
    frame.current++
    if (frame.current % 8 !== 0 || !holder.current) return
    holder.current.getWorldPosition(worldPos.current)
    const d = camera.position.distanceTo(worldPos.current)

    const near = d < LABEL_DISTANCE
    if (near !== labelVisible) setLabelVisible(near)
    // 迟滞：两个阈值差 1 米，否则站在边界上会疯狂来回切换
    const want = d < LOD_DISTANCE ? 'full' : d > LOD_DISTANCE + 1 ? 'cheap' : lod
    if (want !== lod) setLod(want)
  })

  const def = modelForSeat(seat)

  return (
    <group
      ref={holder}
      position={seatLocal(seat, seatCount)}
      rotation={[0, seatFacing(seat, seatCount), 0]}
    >
      {/*
        两层保护，缺一不可：
          Suspense    —— 模型还在下载时不阻塞整个画面
          ErrorBoundary —— 文件 404 / 解析失败时退回程序化角色

        没有 ErrorBoundary 的话，一个坏掉的 .glb 会让 R3F 整棵树卸载，
        表现是整个大厅变黑。一个角色丑，好过所有人消失。
      */}
      {def ? (
        <RigFallback fallback={<ProceduralCharacter ref={attach} color={occupant.color} lod={lod} />}>
          <Suspense fallback={<ProceduralCharacter ref={attach} color={occupant.color} lod={lod} />}>
            <GltfCharacter ref={attach} def={def} color={occupant.color} />
          </Suspense>
        </RigFallback>
      ) : (
        <ProceduralCharacter ref={attach} color={occupant.color} lod={lod} />
      )}

      {labelVisible && <NameTag occupant={occupant} />}
    </group>
  )
}

/** 模型加载失败时换成兜底角色，并且只警告一次 —— 每帧刷屏的日志没人看 */
class RigFallback extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: Error) {
    console.warn('[dolos] 角色模型加载失败，已退回程序化角色：', e.message)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * 名牌用 drei 的 <Html>（纯 DOM）而不是 3D 文字：免去字体加载。
 * 不用 distanceFactor —— 那会让名牌跟着透视缩放，
 * 近处玩家的名字会大到糊住半个屏幕。名牌是 HUD，该是恒定屏幕尺寸。
 */
function NameTag({ occupant }: { occupant: Occupant }) {
  return (
    <Html
      position={[0, 1.6, 0]}
      center
      zIndexRange={[10, 0]}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      <div className="nametag">
        {occupant.name}
        {occupant.isAI && <span className="ai-badge">AI</span>}
      </div>
    </Html>
  )
}
