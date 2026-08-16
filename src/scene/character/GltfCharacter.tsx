import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import {
  GESTURE_DURATION,
  type Gesture,
  type RigHandle,
  type RigState,
  aimHead,
  breathe,
  speechMotion,
} from './rig'
import { type ModelDef, findClip } from './models'

/**
 * glTF 角色，实现和程序化角色完全相同的 RigHandle。
 *
 * 上层看不出区别 —— 这正是 rig.ts 存在的理由。
 */
export const GltfCharacter = forwardRef<
  RigHandle,
  { def: ModelDef; color: string }
>(function GltfCharacter({ def, color }, ref) {
  const root = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(def.url)

  /**
   * **必须克隆，而且必须用 SkeletonUtils.clone。**
   *
   * useGLTF 缓存的是同一个 scene 实例，直接挂多次的话所有角色共享一份
   * transform —— 一桌人会像连体婴一样同步动。
   * 而普通的 .clone() 不会重建骨骼绑定：SkinnedMesh 会继续引用**原始**骨架，
   * 表现是模型加载出来了但动画全错位，是这一块最难查的坑之一。
   */
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { actions, names } = useAnimations(animations, model)

  // 材质要单独克隆一份，否则给一个角色染色会染到所有共享该材质的角色
  useEffect(() => {
    const c = new THREE.Color(color)
    model.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return
      const mesh = o as THREE.Mesh
      mesh.castShadow = true
      const src = mesh.material
      const mats = Array.isArray(src) ? src : [src]
      mesh.material = Array.isArray(src)
        ? mats.map((m) => tint(m, c))
        : tint(mats[0], c)
    })
  }, [model, color])

  // 找头骨用来做视线跟随。找不到就不跟随 —— 缺一个骨骼不该让角色消失
  const headBone = useMemo(() => {
    let found: THREE.Object3D | null = null
    model.traverse((o) => {
      if (found) return
      const n = o.name.toLowerCase()
      if (n === 'head' || n.endsWith('_head') || n.includes('mixamorighead')) found = o
    })
    return found as THREE.Object3D | null
  }, [model])

  const idleName = useMemo(() => findClip(names, def.clips.idle ?? 'idle'), [names, def])
  const gesture = useRef<{ action: THREE.AnimationAction; t: number } | null>(null)
  const phaseRef = useRef(Math.random() * 6.28)

  // 待机循环。offset 让同桌的人不同步 —— 同步的待机动画一眼假
  useEffect(() => {
    if (!idleName) return
    const a = actions[idleName]
    if (!a) return
    a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.3).play()
    a.time = phaseRef.current
    return () => void a.fadeOut(0.3)
  }, [actions, idleName])

  useImperativeHandle(
    ref,
    (): RigHandle => ({
      play: (g: Gesture) => {
        const clip = def.clips[g]
        const name = clip ? findClip(names, clip) : null
        // 模型没有这个动作就静默跳过。缺动作是常态，不该报错更不该崩
        if (!name) return
        const a = actions[name]
        if (!a) return
        a.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.15).play()
        a.clampWhenFinished = true
        gesture.current = { action: a, t: 0 }
      },
      update: (s: RigState, dt: number) => {
        if (!root.current) return
        const t = performance.now() / 1000 + phaseRef.current

        if (gesture.current) {
          gesture.current.t += dt
          const dur = gesture.current.action.getClip().duration || 1
          if (gesture.current.t >= Math.min(dur, GESTURE_DURATION.point * 2)) {
            gesture.current.action.fadeOut(0.25)
            gesture.current = null
          }
        }

        // 骨骼动画之上叠加**程序化的头部运动**。
        // 说话不做成一段固定 clip，是因为音量是连续的实时信号，
        // 而 clip 是离散的 —— 叠加能让口型节奏跟真实音频对上。
        if (headBone) {
          const m = speechMotion(t, s.amp)
          const aim = aimHead(headBone, s.lookAt, root.current, dt)
          headBone.rotation.y = THREE.MathUtils.damp(headBone.rotation.y, aim.yaw, 7, dt)
          headBone.rotation.x =
            THREE.MathUtils.damp(headBone.rotation.x, aim.pitch, 7, dt) + m.nod
          headBone.rotation.z = m.tilt
          headBone.position.y += breathe(t)
        }
      },
    }),
    [actions, names, def, headBone],
  )

  return (
    <group ref={root} scale={def.scale} rotation={[0, def.yawOffset, 0]}>
      <primitive object={model} />
    </group>
  )
})

/** 只给带 color 的标准材质染色，跳过 shader 材质等特殊情况 */
function tint(m: THREE.Material, c: THREE.Color): THREE.Material {
  const cloned = m.clone()
  const withColor = cloned as THREE.Material & { color?: THREE.Color }
  if (withColor.color) withColor.color.copy(c)
  return cloned
}
