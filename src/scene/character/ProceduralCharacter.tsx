import { forwardRef, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { TABLE_HEIGHT } from '../hallLayout'
import {
  GESTURE_DURATION,
  type Gesture,
  type RigHandle,
  aimHead,
  breathe,
  gestureEnvelope,
  speechMotion,
} from './rig'

/** 坐姿头部高度。必须明显高于桌面(0.76)，否则角色看起来是陷在桌子里的 */
const HEAD_Y = 1.2

/**
 * 用基本几何体拼的角色，实现 RigHandle。
 *
 * 动物头套不只是风格，是工程决策：刚性面具 = 不需要面部绑定、
 * 不需要 blendshape、不需要口型同步，也绕开了恐怖谷。
 * 所有表达压到肢体语言上 —— 而肢体语言恰好是几何体也能做的。
 *
 * 这个实现**不是临时占位**：它是 glTF 加载失败时的兜底，会一直留着。
 * 一个模型 404 就白屏，比一个模型丑得多。
 */
export const ProceduralCharacter = forwardRef<
  RigHandle,
  { color: string; lod: 'full' | 'cheap' }
>(function ProceduralCharacter({ color, lod }, ref) {
  const root = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Mesh>(null)
  const armR = useRef<THREE.Mesh>(null)
  const mask = useRef<THREE.MeshStandardMaterial>(null)

  // 手势状态用 ref 而不是 state：手势每秒可能触发好几次，
  // 走 React 会让整棵角色树重渲染
  const gesture = useRef<{ g: Gesture; t: number } | null>(null)
  const phaseRef = useRef(Math.random() * 6.28)

  useImperativeHandle(
    ref,
    (): RigHandle => ({
      play: (g) => {
        gesture.current = { g, t: 0 }
      },
      update: (s, dt) => {
        if (!root.current || !head.current) return
        const t = performance.now() / 1000 + phaseRef.current

        // ---- 手势推进 ----
        let env = 0
        let g: Gesture | null = null
        if (gesture.current) {
          gesture.current.t += dt / GESTURE_DURATION[gesture.current.g]
          if (gesture.current.t >= 1) gesture.current = null
          else {
            env = gestureEnvelope(gesture.current.t)
            g = gesture.current.g
          }
        }

        // ---- 头 ----
        const m = speechMotion(t, s.amp)
        const aim = aimHead(head.current, s.lookAt, root.current, dt)
        head.current.position.y = HEAD_Y + breathe(t) + m.bob
        head.current.rotation.y = THREE.MathUtils.damp(
          head.current.rotation.y,
          aim.yaw,
          7,
          dt,
        )
        head.current.rotation.x = THREE.MathUtils.damp(
          head.current.rotation.x,
          aim.pitch,
          7,
          dt,
        ) + m.nod
        head.current.rotation.z = m.tilt

        // ---- 躯干：说话前倾，lean/recline 手势叠加 ----
        const bodyTilt =
          -s.amp * 0.035 +
          (g === 'lean' ? env * 0.18 : 0) +
          (g === 'recline' ? -env * 0.15 : 0)
        root.current.rotation.x = THREE.MathUtils.damp(
          root.current.rotation.x,
          bodyTilt,
          6,
          dt,
        )

        // ---- 手臂 ----
        // 静止时搭在桌上；point 抬右臂前伸，place 双臂伸向桌心，shrug 双臂外翻
        if (armL.current && armR.current) {
          for (const [i, arm] of [armL.current, armR.current].entries()) {
            const side = i === 0 ? -1 : 1
            let lift = 0
            let out = 0
            let fwd = 0
            if (g === 'point' && side > 0) {
              lift = env * 0.55
              fwd = env * 0.22
            } else if (g === 'place') {
              lift = env * 0.2
              fwd = env * 0.26
            } else if (g === 'shrug') {
              lift = env * 0.3
              out = env * 0.45
            }
            arm.rotation.x = THREE.MathUtils.damp(
              arm.rotation.x,
              Math.PI / 2.15 - lift,
              9,
              dt,
            )
            arm.rotation.z = THREE.MathUtils.damp(
              arm.rotation.z,
              side * (0.3 + out),
              9,
              dt,
            )
            arm.position.z = THREE.MathUtils.damp(arm.position.z, -0.34 - fwd, 9, dt)
          }
        }

        // ---- 面具自发光跟音量走：配合 Bloom，说话的人自己"亮起来" ----
        if (mask.current) {
          mask.current.emissiveIntensity = THREE.MathUtils.damp(
            mask.current.emissiveIntensity,
            s.amp * 0.85,
            10,
            dt,
          )
        }
      },
    }),
    [],
  )

  // 远处的角色砍掉细节：眼睛、耳朵、吻部在 6 米外就是几个像素，
  // 但它们是 4 个额外 draw call ×每个角色。大厅里有 30 个人时这很值钱。
  const detailed = lod === 'full'

  return (
    <group ref={root}>
      {/* 身体 */}
      <mesh position={[0, 0.66, 0]} castShadow>
        <capsuleGeometry args={[0.24, 0.5, 6, detailed ? 16 : 8]} />
        <meshStandardMaterial color="#241c18" roughness={0.9} metalness={0.05} />
      </mesh>

      {/* 肩膀，让轮廓不那么"胶囊" */}
      <mesh position={[0, 0.97, 0]} castShadow>
        <sphereGeometry args={[0.27, detailed ? 20 : 10, detailed ? 12 : 6]} />
        <meshStandardMaterial color="#1e1815" roughness={0.95} />
      </mesh>

      {/* 手臂搭在桌面上。y 必须在桌面之上，否则整条手臂埋在桌子里看不见 */}
      <mesh
        ref={armL}
        position={[-0.28, TABLE_HEIGHT + 0.07, -0.34]}
        rotation={[Math.PI / 2.15, 0, -0.3]}
        castShadow
      >
        <capsuleGeometry args={[0.075, 0.4, 4, detailed ? 10 : 6]} />
        <meshStandardMaterial color="#241c18" roughness={0.9} />
      </mesh>
      <mesh
        ref={armR}
        position={[0.28, TABLE_HEIGHT + 0.07, -0.34]}
        rotation={[Math.PI / 2.15, 0, 0.3]}
        castShadow
      >
        <capsuleGeometry args={[0.075, 0.4, 4, detailed ? 10 : 6]} />
        <meshStandardMaterial color="#241c18" roughness={0.9} />
      </mesh>

      {/* 头 = 动物面具 */}
      <group ref={head} position={[0, HEAD_Y, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.2, detailed ? 28 : 12, detailed ? 20 : 8]} />
          <meshStandardMaterial
            ref={mask}
            color={color}
            emissive={color}
            emissiveIntensity={0}
            roughness={0.55}
            metalness={0.1}
          />
        </mesh>

        {detailed && (
          <>
            {/* 吻部：朝 -Z，也就是朝桌心 */}
            <mesh position={[0, -0.04, -0.17]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
              <coneGeometry args={[0.1, 0.19, 14]} />
              <meshStandardMaterial color={color} roughness={0.6} />
            </mesh>

            {[-1, 1].map((s) => (
              <mesh
                key={`ear${s}`}
                position={[s * 0.11, 0.19, 0.02]}
                rotation={[0, 0, s * 0.35]}
                castShadow
              >
                <coneGeometry args={[0.055, 0.16, 10]} />
                <meshStandardMaterial color={color} roughness={0.6} />
              </mesh>
            ))}

            {/* 眼睛：暗色凹陷，靠环境光形成阴影，比贴图便宜 */}
            {[-1, 1].map((s) => (
              <mesh key={`eye${s}`} position={[s * 0.078, 0.045, -0.163]}>
                <sphereGeometry args={[0.032, 12, 10]} />
                <meshStandardMaterial color="#0b0908" roughness={0.25} />
              </mesh>
            ))}
          </>
        )}
      </group>
    </group>
  )
})
