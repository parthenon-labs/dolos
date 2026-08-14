import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getAmp } from '../audio/amplitudes'
import {
  NUM_SEATS_PLACEHOLDER,
  ringGeomArgs,
} from './constants'
import { seatAngle, seatRingPosition, TABLE_HEIGHT, TABLE_RADIUS } from './seats'

/**
 * 酒吧包间：地板 + 四面墙 + 圆桌 + 吊灯外壳。
 *
 * 全是静态几何体 —— 这正是"相机几乎不动"带来的红利：
 * 真做美术时，这些东西的光照可以在 Blender 里一次性烤进贴图，
 * 运行时零成本，效果比实时阴影还好。
 */
export function Room() {
  return (
    <group>
      <Floor />
      <Walls />
      <Table />
      <Lamp />
      <SpeakerRings />
      <Cards />
      <Clutter />
    </group>
  )
}

/**
 * 每个座位面前一小叠盖着的牌 + 中央的弃牌堆。
 * 现在是静态的；真正做起来时，出牌就是把这些 mesh 沿贝塞尔曲线
 * 移到中央 —— 全部是位置动画，不需要任何骨骼。
 */
function Cards() {
  const n = NUM_SEATS_PLACEHOLDER
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const a = seatAngle(i, n)
        const r = TABLE_RADIUS - 0.42
        return (
          <group
            key={i}
            position={[Math.sin(a) * r, TABLE_HEIGHT + 0.038, Math.cos(a) * r]}
            rotation={[0, a, 0]}
          >
            {[0, 1, 2].map((k) => (
              <mesh
                key={k}
                position={[(k - 1) * 0.075, k * 0.003, 0]}
                rotation={[0, (k - 1) * 0.14, 0]}
                castShadow
              >
                <boxGeometry args={[0.09, 0.004, 0.13]} />
                <meshStandardMaterial color="#7a1f22" roughness={0.55} />
              </mesh>
            ))}
          </group>
        )
      })}

      {/* 中央弃牌堆 */}
      <group position={[0.06, TABLE_HEIGHT + 0.038, -0.02]}>
        {[0, 1, 2, 3].map((k) => (
          <mesh
            key={k}
            position={[Math.sin(k * 2.1) * 0.02, k * 0.004, Math.cos(k * 1.7) * 0.02]}
            rotation={[0, k * 0.5, 0]}
            castShadow
          >
            <boxGeometry args={[0.09, 0.004, 0.13]} />
            <meshStandardMaterial color="#6d1a1d" roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[14, 14]} />
      <meshStandardMaterial color="#191310" roughness={0.95} metalness={0} />
    </mesh>
  )
}

/** 四面墙 + 天花板，把光关在屋里。开放场景会漏光，氛围立刻垮 */
function Walls() {
  const w = 7
  const h = 3.2
  const walls: { pos: [number, number, number]; rot: [number, number, number] }[] = [
    { pos: [0, h / 2, -w / 2], rot: [0, 0, 0] },
    { pos: [0, h / 2, w / 2], rot: [0, Math.PI, 0] },
    { pos: [-w / 2, h / 2, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [w / 2, h / 2, 0], rot: [0, -Math.PI / 2, 0] },
  ]
  return (
    <group>
      {walls.map((wl, i) => (
        <mesh key={i} position={wl.pos} rotation={wl.rot} receiveShadow>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial color="#2a1d16" roughness={1} side={THREE.FrontSide} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, w]} />
        <meshStandardMaterial color="#140f0c" roughness={1} />
      </mesh>
    </group>
  )
}

function Table() {
  return (
    <group>
      {/* 桌面 */}
      <mesh position={[0, TABLE_HEIGHT, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.07, 48]} />
        <meshStandardMaterial color="#3d2a1c" roughness={0.55} metalness={0.08} />
      </mesh>
      {/* 包边 */}
      <mesh position={[0, TABLE_HEIGHT - 0.045, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS + 0.02, TABLE_RADIUS + 0.02, 0.03, 48]} />
        <meshStandardMaterial color="#1d1410" roughness={0.8} />
      </mesh>
      {/* 桌腿 */}
      <mesh position={[0, TABLE_HEIGHT / 2 - 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, TABLE_HEIGHT - 0.1, 16]} />
        <meshStandardMaterial color="#221812" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.46, 0.06, 24]} />
        <meshStandardMaterial color="#1a120e" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** 吊灯外壳。真正发光的是 Lighting.tsx 里的聚光灯，这里只是它的"身体" */
function Lamp() {
  return (
    <group position={[0, 2.06, 0]}>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 1.1, 6]} />
        <meshStandardMaterial color="#0d0a08" />
      </mesh>
      <mesh castShadow>
        <coneGeometry args={[0.32, 0.26, 24, 1, true]} />
        <meshStandardMaterial color="#241a12" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* 灯泡本体：纯自发光，交给 Bloom 去晕开 */}
      <mesh position={[0, -0.11, 0]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshBasicMaterial color="#ffd9a0" />
      </mesh>
    </group>
  )
}

/**
 * 说话指示环 —— 桌沿每个座位前一圈发光的环，音量驱动亮度。
 * 用 meshBasicMaterial（不受光照影响）+ Bloom，就能得到很干净的辉光。
 * 这是"谁在说话"最直接的视觉线索，也是语音和画面绑在一起的地方。
 */
function SpeakerRings() {
  return (
    <group>
      {Array.from({ length: NUM_SEATS_PLACEHOLDER }, (_, i) => (
        <SpeakerRing key={i} seat={i} />
      ))}
    </group>
  )
}

function SpeakerRing({ seat }: { seat: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((_, dt) => {
    if (!mat.current) return
    const amp = getAmp(seat)
    mat.current.opacity = THREE.MathUtils.damp(
      mat.current.opacity,
      0.06 + amp * 0.9,
      12,
      dt,
    )
  })
  return (
    <mesh
      position={seatRingPosition(seat, NUM_SEATS_PLACEHOLDER)}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={ringGeomArgs} />
      <meshBasicMaterial
        ref={mat}
        color="#ffb257"
        transparent
        opacity={0.06}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/** 桌上零碎：酒杯、烟灰缸。纯粹为了让光有东西可以打 */
function Clutter() {
  return (
    <group>
      <mesh position={[0.42, TABLE_HEIGHT + 0.09, 0.3]} castShadow>
        <cylinderGeometry args={[0.055, 0.04, 0.14, 16]} />
        <meshStandardMaterial
          color="#c98b3a"
          roughness={0.08}
          metalness={0.1}
          transparent
          opacity={0.75}
        />
      </mesh>
      <mesh position={[-0.5, TABLE_HEIGHT + 0.05, -0.18]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.035, 20]} />
        <meshStandardMaterial color="#2b2320" roughness={0.5} />
      </mesh>
      <mesh position={[-0.16, TABLE_HEIGHT + 0.045, 0.44]} rotation={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.16, 0.045, 0.11]} />
        <meshStandardMaterial color="#7d1f1f" roughness={0.6} />
      </mesh>
    </group>
  )
}
