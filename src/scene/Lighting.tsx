import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

/**
 * 灯光。整个氛围的地基。
 *
 * 布光原则（三点光的酒吧版）：
 *   1. 主光：桌子正上方一盏暖色聚光灯，硬阴影，把注意力焊死在桌面
 *   2. 补光：极弱的冷色环境光，只负责让暗部不是纯黑
 *   3. 轮廓光：两侧远处的彩色点光，勾出角色边缘、制造冷暖对比
 *
 * 关键是主光和环境光的**比值要大**。新手最常见的错误是环境光给太亮，
 * 结果整个场景灰蒙蒙的，没有任何戏剧性。宁可暗，不要平。
 */
export function Lighting() {
  const spot = useRef<THREE.SpotLight>(null)
  const target = useRef<THREE.Object3D>(null)

  const c = useControls('灯光', {
    lampIntensity: { value: 26, min: 0, max: 80, step: 1, label: '吊灯强度' },
    lampColor: { value: '#ffb257', label: '吊灯颜色' },
    ambient: { value: 0.12, min: 0, max: 1, step: 0.01, label: '环境光' },
    ambientColor: { value: '#4a6a8c', label: '环境光色' },
    rimIntensity: { value: 9, min: 0, max: 30, step: 0.5, label: '轮廓光' },
    flicker: { value: 0.06, min: 0, max: 0.5, step: 0.01, label: '灯泡闪烁' },
    fogDensity: { value: 0.085, min: 0, max: 0.35, step: 0.005, label: '雾浓度' },
  })

  // 聚光灯必须有 target，否则默认指向原点下方
  useFrame(() => {
    if (spot.current && target.current) {
      spot.current.target = target.current
      spot.current.target.updateMatrixWorld()
    }
    // 廉价酒吧的灯泡不该是稳定的。极轻微的闪烁 = 大量的"活着"的感觉
    if (spot.current && c.flicker > 0) {
      const t = performance.now() / 1000
      const n =
        Math.sin(t * 7.3) * 0.5 + Math.sin(t * 17.1) * 0.3 + Math.sin(t * 31.7) * 0.2
      spot.current.intensity = c.lampIntensity * (1 + n * c.flicker)
    }
  })

  return (
    <>
      <fogExp2 attach="fog" args={['#0b0806', c.fogDensity]} />
      <color attach="background" args={['#0b0806']} />

      <ambientLight intensity={c.ambient} color={c.ambientColor} />

      {/* 主光：吊灯 */}
      <object3D ref={target} position={[0, 0.76, 0]} />
      <spotLight
        ref={spot}
        position={[0, 2.0, 0]}
        angle={1.15}
        penumbra={0.8}
        distance={7}
        decay={1.9}
        intensity={c.lampIntensity}
        color={c.lampColor}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
      />

      {/* 轮廓光 A：远处的红色霓虹，暖侧 */}
      <pointLight
        position={[-3.0, 1.9, -2.6]}
        intensity={c.rimIntensity}
        color="#ff4d2e"
        distance={9}
        decay={2}
      />
      {/* 轮廓光 B：青绿色，冷侧。冷暖对冲是这类场景的味道来源 */}
      <pointLight
        position={[3.1, 1.7, -2.2]}
        intensity={c.rimIntensity * 0.7}
        color="#2ee0c0"
        distance={9}
        decay={2}
      />
      {/* 极弱的地面反弹光，避免下半身死黑 */}
      <pointLight position={[0, 0.25, 0]} intensity={1.2} color="#8a5a2e" distance={4} decay={2} />
    </>
  )
}
