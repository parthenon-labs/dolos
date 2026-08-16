import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { usePlayerStore } from '../../state/usePlayerStore'
import { useGameStore } from '../../state/useGameStore'
import { seatFacing, seatLocal } from '../hallLayout'

/** 超过这个距离够不着，只高亮不给坐 */
const REACH = 3.6

/**
 * 一把椅子 + 一个透明的命中体。
 *
 * 命中体用 opacity=0 的材质而不是 visible={false}：three 的 Raycaster
 * 会跳过 visible=false 的对象，那样 R3F 的指针事件永远收不到。
 * 它也比椅子本身大一圈 —— 交互体积永远该比视觉体积宽容，
 * 拿光标去够细椅子腿不是什么好体验。
 */
export function Seat({
  tableId,
  index,
  seatCount,
  empty,
}: {
  tableId: string
  index: number
  seatCount: number
  empty: boolean
}) {
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const hit = useRef<THREE.Mesh>(null)
  const inReach = useRef(false)
  const worldPos = useRef(new THREE.Vector3())
  const frame = useRef(0)

  const mode = usePlayerStore((s) => s.mode)
  const hovered = usePlayerStore((s) => s.hovered)
  const setHovered = usePlayerStore((s) => s.setHovered)
  const beginSit = usePlayerStore((s) => s.beginSit)
  const claimSeat = useGameStore((s) => s.claimSeat)

  const isHovered =
    !!hovered && hovered.tableId === tableId && hovered.seat === index
  const selectable = empty && mode === 'walking'

  const pos = seatLocal(index, seatCount)
  const rot = seatFacing(index, seatCount)

  useFrame(({ camera }, dt) => {
    // 距离检查降频到 6 帧一次，玩家不可能在 1/10 秒里跨越三米
    frame.current++
    if (hit.current && frame.current % 6 === 0) {
      hit.current.getWorldPosition(worldPos.current)
      const near = camera.position.distanceTo(worldPos.current) < REACH
      if (near !== inReach.current) {
        inReach.current = near
        // 走出范围时要主动摘掉 hover，否则提示会一直挂在那儿
        if (!near && isHovered) setHovered(null)
      }
    }

    if (!glow.current) return
    const t = performance.now() / 1000
    // 空位常态微微呼吸，被指到时亮起来
    const base = selectable ? 0.16 + Math.sin(t * 2.1 + index) * 0.05 : 0
    const target = isHovered ? 0.9 : base
    glow.current.opacity = THREE.MathUtils.damp(glow.current.opacity, target, 12, dt)
  })

  const sit = () => {
    if (!selectable || !inReach.current) return
    claimSeat(tableId, index, { name: '你', color: '#c9a227', isAI: false })
    beginSit({ tableId, seat: index })
  }

  return (
    <group position={pos} rotation={[0, rot, 0]}>
      {/* 座面 */}
      <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.06, 0.42]} />
        <meshStandardMaterial color="#2a1c14" roughness={0.85} />
      </mesh>
      {/* 靠背 */}
      <mesh position={[0, 0.74, 0.2]} castShadow>
        <boxGeometry args={[0.42, 0.56, 0.05]} />
        <meshStandardMaterial color="#241811" roughness={0.85} />
      </mesh>
      {/* 四条腿 */}
      {[
        [-0.17, -0.17],
        [0.17, -0.17],
        [-0.17, 0.17],
        [0.17, 0.17],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.44, 8]} />
          <meshStandardMaterial color="#1b120d" roughness={0.9} />
        </mesh>
      ))}

      {/* 地面上的指示光圈 */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <ringGeometry args={[0.26, 0.33, 32]} />
        <meshBasicMaterial
          ref={glow}
          color={isHovered ? '#ffd9a0' : '#2ee0c0'}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 提示牌贴在椅子上方，而不是屏幕正中 */}
      {isHovered && (
        <Html
          position={[0, 1.15, 0]}
          center
          zIndexRange={[20, 10]}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="seat-prompt">
            <kbd>E</kbd> 坐下
          </div>
        </Html>
      )}

      {/* 命中体：透明但可被射线击中，且比椅子宽容 */}
      <mesh
        ref={hit}
        position={[0, 0.7, 0]}
        onPointerOver={(e) => {
          if (!selectable) return
          e.stopPropagation()
          setHovered({ tableId, seat: index })
        }}
        onPointerOut={() => {
          if (isHovered) setHovered(null)
        }}
        onClick={(e) => {
          // 够不着或已有人时不拦截事件，让这一下点击穿过去落到地板上，
          // 变成"走过去"的指令 —— 对着占着的椅子点一下毫无反应最劝退
          if (!selectable || !inReach.current) return
          e.stopPropagation()
          sit()
        }}
      >
        <boxGeometry args={[0.8, 1.5, 0.8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
