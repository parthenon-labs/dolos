import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { registerSeat } from '../../player/seatRegistry'
import { usePlayerStore } from '../../state/usePlayerStore'
import { seatFacing, seatLocal } from '../hallLayout'

/**
 * 一把椅子 + 一个不可见的命中体。
 *
 * 命中体比椅子大一圈，因为准心对准一把细腿椅子太难瞄了 ——
 * 交互体积永远该比视觉体积宽容，这是手感的一部分。
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
  const hit = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const hovered = usePlayerStore((s) => s.hovered)
  const isHovered =
    !!hovered && hovered.tableId === tableId && hovered.seat === index

  const pos = seatLocal(index, seatCount)
  const rot = seatFacing(index, seatCount)

  // 只有空位才注册进射线检测 —— 有人坐的椅子不该被瞄上
  useEffect(() => {
    if (!empty || !hit.current) return
    return registerSeat({ tableId, seat: index, mesh: hit.current })
  }, [empty, tableId, index])

  useFrame((_, dt) => {
    if (!glow.current) return
    const t = performance.now() / 1000
    // 空位常态微微呼吸，被瞄准时亮起来
    const base = empty ? 0.16 + Math.sin(t * 2.1 + index) * 0.05 : 0
    const target = isHovered ? 0.85 : base
    glow.current.opacity = THREE.MathUtils.damp(glow.current.opacity, target, 12, dt)
  })

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

      {/* 命中体：不可见，但比椅子宽容得多 */}
      <mesh ref={hit} position={[0, 0.7, 0]} visible={false}>
        <boxGeometry args={[0.8, 1.5, 0.8]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  )
}
