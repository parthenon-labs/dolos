import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { usePlayerStore } from '../../state/usePlayerStore'
import { floorHeightAt, levelFromHeight } from '../hallLayout'

/**
 * 点击寻路的目的地标记。
 *
 * 没有它的话，点一下地面只会看到自己开始走，但不知道"系统到底收到没有、
 * 要走到哪"。一个会收缩的光圈把这次点击变成看得见的反馈，
 * 这类即时确认对操作手感的影响比它的实现成本大得多。
 */
export function MoveMarker() {
  const target = usePlayerStore((s) => s.moveTarget)
  const ring = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(() => {
    if (!ring.current || !mat.current || !target) return
    const t = performance.now() / 1000
    // 持续收缩再弹回，像个"这里"的脉冲
    const p = (t * 1.6) % 1
    const s = 1.25 - p * 0.45
    ring.current.scale.set(s, s, s)
    mat.current.opacity = 0.75 * (1 - p) + 0.15
  })

  if (!target) return null

  const [x, z] = target
  // 目标点可能在二楼，得按那一层的标高把光圈贴在地面上
  const yTop = floorHeightAt(x, z, 1)
  const y = levelFromHeight(yTop) === 1 ? yTop : floorHeightAt(x, z, 0)

  return (
    <mesh
      ref={ring}
      position={[x, y + 0.015, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
    >
      <ringGeometry args={[0.24, 0.32, 32]} />
      <meshBasicMaterial
        ref={mat}
        color="#ffd9a0"
        transparent
        opacity={0.6}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
