import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HALL } from '../hallLayout'

// 数量和亮度都要克制。浮尘是"余光里察觉到"的东西，
// 一旦你能一颗颗数出来，它就从氛围变成了下雪。
// 空间变大了要相应加量，但密度必须保持低 —— 浮尘是"余光里察觉到"的东西，
// 一旦你能一颗颗数出来，它就从氛围变成了下雪。
const COUNT = 420

/**
 * 空气里的浮尘。
 *
 * 单点成本几乎为零，但它是"这个空间是活的"最便宜的信号 ——
 * 静止的空气会让再好的布光都显得像产品渲染图而不是一个地方。
 * 配合 Bloom，落进光锥里的那些会自己亮起来。
 */
export function DustMotes() {
  const points = useRef<THREE.Points>(null)

  const { geometry, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const spd = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * HALL.width
      positions[i * 3 + 1] = 0.25 + Math.random() * (HALL.height - 0.5)
      positions[i * 3 + 2] = (Math.random() - 0.5) * HALL.depth
      // 极慢的随机漂移，加一点点向上的热气流
      spd[i * 3] = (Math.random() - 0.5) * 0.045
      spd[i * 3 + 1] = 0.012 + Math.random() * 0.028
      spd[i * 3 + 2] = (Math.random() - 0.5) * 0.045
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return { geometry: g, speeds: spd }
  }, [])

  useFrame((_, dt) => {
    if (!points.current) return
    const attr = points.current.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    const t = performance.now() / 1000
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3
      // 叠一层正弦让轨迹不是直线，否则看起来像下雪
      arr[i3] += (speeds[i3] + Math.sin(t * 0.3 + i) * 0.012) * dt
      arr[i3 + 1] += speeds[i3 + 1] * dt
      arr[i3 + 2] += (speeds[i3 + 2] + Math.cos(t * 0.27 + i * 1.7) * 0.012) * dt
      // 飘到天花板就回到地面，循环利用
      if (arr[i3 + 1] > HALL.height - 0.2) {
        arr[i3 + 1] = 0.25
        arr[i3] = (Math.random() - 0.5) * HALL.width
        arr[i3 + 2] = (Math.random() - 0.5) * HALL.depth
      }
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={0.009}
        sizeAttenuation
        color="#ffd9a8"
        transparent
        opacity={0.22}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}
