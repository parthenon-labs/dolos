import * as THREE from 'three'
import { seatFacing, seatLocal } from '../hallLayout'

/**
 * 一把椅子。
 *
 * 以前它还画两样东西：地上的青色光圈（"这个位置可以坐"）和
 * 悬在椅背上方的 `E 坐下` 提示。大厅改成 2D 之后**这两样都成了假承诺** ——
 * 光圈还在亮，而那把椅子已经坐不进去了。
 *
 * 一个还在发邀请的、点了没反应的东西，比没有它更糟。所以只剩木头。
 */
export function Seat({ index, seatCount }: { index: number; seatCount: number }) {
  const pos = seatLocal(index, seatCount)
  const rot = seatFacing(index, seatCount)

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
    </group>
  )
}

/** 椅子不再吃朝向以外的任何状态，这个导出只是给别处算位置用 */
export const seatWorldFacing = (index: number, seatCount: number): THREE.Euler =>
  new THREE.Euler(0, seatFacing(index, seatCount), 0)
