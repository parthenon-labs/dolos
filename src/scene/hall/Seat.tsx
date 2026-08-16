import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { usePlayerStore } from '../../state/usePlayerStore'
import { seatFacing, seatLocal } from '../hallLayout'

/**
 * 一把椅子。
 *
 * 它本身不再处理任何输入 —— 选中哪把是 SeatPicker 按距离算出来的，
 * 这里只负责把结果画出来：空位常态微微呼吸，被选中就亮起来并浮出提示。
 * 之前那个用来接指针事件的透明命中体已经不需要了。
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
  const mode = usePlayerStore((s) => s.mode)
  const hovered = usePlayerStore((s) => s.hovered)

  const isHovered =
    !!hovered && hovered.tableId === tableId && hovered.seat === index
  const selectable = empty && mode === 'walking'

  const pos = seatLocal(index, seatCount)
  const rot = seatFacing(index, seatCount)

  useFrame((_, dt) => {
    if (!glow.current) return
    const t = performance.now() / 1000
    const base = selectable ? 0.16 + Math.sin(t * 2.1 + index) * 0.05 : 0
    const target = isHovered ? 0.9 : base
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
    </group>
  )
}
