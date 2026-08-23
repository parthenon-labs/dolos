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
import * as THREE from 'three'
import { getAmp } from '../../audio/amplitudes'
import { seatFacing, seatLocal } from '../hallLayout'
import type { Occupant } from '../../state/useGameStore'
import { GltfCharacter } from './GltfCharacter'
import { ProceduralCharacter } from './ProceduralCharacter'
import { modelForSeat } from './models'
import { type RigHandle, makeRigState } from './rig'
import { registerRig, unregisterRig } from './rigRegistry'

/**
 * 超过这个距离掉到低模。刚好是"看不清五官"的距离。
 *
 * 这里以前还有一个 LABEL_DISTANCE，控制角色头顶的名牌。
 * 名牌是"你和这些人同桌"时才有意义的东西 —— 大厅改成 2D 之后没人同桌了，
 * 于是它变成了**漏进画面的 UI**：几个名字飘在背景的酒馆里，
 * 还带着 AI 徽标。背景该像一幅画，不该像一个开着调试信息的游戏。
 */
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

