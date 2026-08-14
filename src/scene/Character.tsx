import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getAmp } from '../audio/amplitudes'
import { TABLE_HEIGHT, seatFacing, seatLocal } from './hallLayout'
import type { Occupant } from '../state/useGameStore'

/** 坐姿头部高度。必须明显高于桌面(0.76)，否则角色看起来是陷在桌子里的 */
const HEAD_Y = 1.2
/** 超过这个距离就不显示名牌，否则整个大厅飘满字 */
const LABEL_DISTANCE = 6.5

/**
 * 一个玩家 = 胶囊身体 + 球形头 + 圆锥吻部 + 两只耳朵。
 *
 * 全部 primitive，故意的：先把"状态 → 动作"的管线跑通，
 * 最后再换成 glTF 模型。反过来做（先啃模型）是单人项目最常见的死法。
 *
 * 动物头套不只是风格，是工程决策：刚性面具 = 不需要面部绑定、
 * 不需要 blendshape、不需要口型同步，也绕开了恐怖谷。
 * 所有表达压到肢体语言上。
 */
export function Character({
  tableId,
  seat,
  seatCount,
  occupant,
}: {
  tableId: string
  seat: number
  seatCount: number
  occupant: Occupant
}) {
  const root = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const mask = useRef<THREE.MeshStandardMaterial>(null)
  const [labelVisible, setLabelVisible] = useState(false)

  // 每个角色一个固定相位偏移，否则一桌人会同步呼吸，非常假
  const phase = useRef(seat * 1.7 + 0.4)
  const worldPos = useRef(new THREE.Vector3())
  const frame = useRef(0)

  useFrame(({ camera }, dt) => {
    if (!root.current || !head.current) return
    const t = performance.now() / 1000 + phase.current
    // 这里直接读模块级内存，不经过 React —— 每帧 setState 会炸掉性能
    const amp = getAmp(tableId, seat)

    // 常态呼吸：非常轻微，但没有它角色会像雕像
    const breath = Math.sin(t * 1.15) * 0.006
    // 说话时：头部上下点动 + 身体微微前倾
    const bob = Math.sin(t * 13) * amp * 0.022
    const nod = Math.sin(t * 9.5) * amp * 0.05

    head.current.position.y = HEAD_Y + breath + bob
    head.current.rotation.x = nod
    head.current.rotation.z = Math.sin(t * 5) * amp * 0.04

    root.current.rotation.x = THREE.MathUtils.damp(
      root.current.rotation.x,
      -amp * 0.035,
      6,
      dt,
    )

    // 面具自发光跟着音量走 —— 配合 Bloom，说话的人会自己"亮起来"
    if (mask.current) {
      mask.current.emissiveIntensity = THREE.MathUtils.damp(
        mask.current.emissiveIntensity,
        amp * 0.85,
        10,
        dt,
      )
    }

    // 名牌的距离剔除。每帧算距离没必要，8 帧一次足够
    frame.current++
    if (frame.current % 8 === 0) {
      root.current.getWorldPosition(worldPos.current)
      const near = camera.position.distanceTo(worldPos.current) < LABEL_DISTANCE
      if (near !== labelVisible) setLabelVisible(near)
    }
  })

  return (
    <group
      position={seatLocal(seat, seatCount)}
      rotation={[0, seatFacing(seat, seatCount), 0]}
    >
      <group ref={root}>
        {/* 身体 */}
        <mesh position={[0, 0.66, 0]} castShadow>
          <capsuleGeometry args={[0.24, 0.5, 6, 16]} />
          <meshStandardMaterial color="#241c18" roughness={0.9} metalness={0.05} />
        </mesh>

        {/* 肩膀，让轮廓不那么"胶囊" */}
        <mesh position={[0, 0.97, 0]} castShadow>
          <sphereGeometry args={[0.27, 20, 12]} />
          <meshStandardMaterial color="#1e1815" roughness={0.95} />
        </mesh>

        {/* 手臂搭在桌面上。y 必须在桌面之上，否则整条手臂埋在桌子里看不见 */}
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * 0.28, TABLE_HEIGHT + 0.07, -0.34]}
            rotation={[Math.PI / 2.15, 0, s * 0.3]}
            castShadow
          >
            <capsuleGeometry args={[0.075, 0.4, 4, 10]} />
            <meshStandardMaterial color="#241c18" roughness={0.9} />
          </mesh>
        ))}

        {/* 头 = 动物面具 */}
        <group ref={head} position={[0, HEAD_Y, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.2, 28, 20]} />
            <meshStandardMaterial
              ref={mask}
              color={occupant.color}
              emissive={occupant.color}
              emissiveIntensity={0}
              roughness={0.55}
              metalness={0.1}
            />
          </mesh>

          {/* 吻部：朝 -Z，也就是朝桌心 */}
          <mesh position={[0, -0.04, -0.17]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
            <coneGeometry args={[0.1, 0.19, 14]} />
            <meshStandardMaterial color={occupant.color} roughness={0.6} />
          </mesh>

          {/* 耳朵 */}
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              position={[s * 0.11, 0.19, 0.02]}
              rotation={[0, 0, s * 0.35]}
              castShadow
            >
              <coneGeometry args={[0.055, 0.16, 10]} />
              <meshStandardMaterial color={occupant.color} roughness={0.6} />
            </mesh>
          ))}

          {/* 眼睛：暗色凹陷，靠环境光形成阴影，比贴图便宜 */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.078, 0.045, -0.163]}>
              <sphereGeometry args={[0.032, 12, 10]} />
              <meshStandardMaterial color="#0b0908" roughness={0.25} />
            </mesh>
          ))}

          {labelVisible && <NameTag occupant={occupant} />}
        </group>
      </group>
    </group>
  )
}

/**
 * 名牌用 drei 的 <Html>（纯 DOM）而不是 3D 文字：免去字体加载。
 * 不用 distanceFactor —— 那会让名牌跟着透视缩放，
 * 近处玩家的名字会大到糊住半个屏幕。名牌是 HUD，该是恒定屏幕尺寸。
 */
function NameTag({ occupant }: { occupant: Occupant }) {
  return (
    <Html
      position={[0, 0.4, 0]}
      center
      zIndexRange={[10, 0]}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      <div className="nametag">
        {occupant.name}
        {occupant.isAI && <span className="ai-badge">AI</span>}
      </div>
    </Html>
  )
}
