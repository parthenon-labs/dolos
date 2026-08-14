import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useControls } from 'leva'
import * as THREE from 'three'
import { useMemo } from 'react'

/**
 * 后处理栈 —— 氛围的七成在这里，不在建模里。
 *
 * 把 leva 面板里的 enabled 关掉再打开，感受一下差距：
 * 同样的胶囊体，关掉是一坨塑料，打开是一间酒吧。
 *
 * 顺序有讲究：Bloom 要在色差之前（先辉光再撕色），
 * 噪点和暗角放最后，它们是"镜头"而不是"场景"的属性。
 */
export function Effects() {
  const c = useControls('后处理', {
    enabled: { value: true, label: '总开关' },
    bloomIntensity: { value: 1.15, min: 0, max: 4, step: 0.05, label: '辉光强度' },
    bloomThreshold: { value: 0.55, min: 0, max: 1, step: 0.01, label: '辉光阈值' },
    aberration: { value: 0.0008, min: 0, max: 0.006, step: 0.0001, label: '色差' },
    noise: { value: 0.055, min: 0, max: 0.25, step: 0.005, label: '胶片噪点' },
    vignette: { value: 0.95, min: 0, max: 2, step: 0.05, label: '暗角' },
  })

  const offset = useMemo(
    () => new THREE.Vector2(c.aberration, c.aberration * 0.6),
    [c.aberration],
  )

  if (!c.enabled) return null

  return (
    <EffectComposer multisampling={4}>
      <Bloom
        intensity={c.bloomIntensity}
        luminanceThreshold={c.bloomThreshold}
        luminanceSmoothing={0.32}
        mipmapBlur
      />
      <ChromaticAberration
        offset={offset}
        radialModulation={true}
        modulationOffset={0.3}
        blendFunction={BlendFunction.NORMAL}
      />
      <Noise opacity={c.noise} blendFunction={BlendFunction.OVERLAY} premultiply />
      <Vignette offset={0.22} darkness={c.vignette} eskil={false} />
    </EffectComposer>
  )
}
