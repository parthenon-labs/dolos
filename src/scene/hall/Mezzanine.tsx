import * as THREE from 'three'
import {
  ATRIUM,
  FLOOR2_Y,
  MEZZ_RECTS,
  SLAB,
  STAIRS,
} from '../hallLayout'

/**
 * 二层挑台、栏杆和楼梯。
 *
 * 几何体全部从 hallLayout 的那几个矩形推导 —— 渲染和碰撞读同一份数字，
 * 否则会出现"看着有地板但走不上去"这种最难查的问题。
 */
export function Mezzanine() {
  return (
    <group>
      <Slabs />
      <Railings />
      <Staircase />
      <Columns />
    </group>
  )
}

/** 楼板。上表面在 FLOOR2_Y，厚度向下长，底面就是一层的天花 */
function Slabs() {
  return (
    <group>
      {MEZZ_RECTS.map(([x0, z0, x1, z1], i) => {
        const w = x1 - x0
        const d = z1 - z0
        return (
          <group key={i}>
            <mesh
              position={[(x0 + x1) / 2, FLOOR2_Y - SLAB / 2, (z0 + z1) / 2]}
              receiveShadow
              castShadow
            >
              <boxGeometry args={[w, SLAB, d]} />
              <meshStandardMaterial color="#1d1410" roughness={0.92} />
            </mesh>
            {/* 上表面单独铺一层地板色，和楼下地面区分开 */}
            <mesh
              position={[(x0 + x1) / 2, FLOOR2_Y + 0.002, (z0 + z1) / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial color="#2b1d14" roughness={0.86} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/**
 * 栏杆。沿中庭一圈，也就是挑台朝向空洞的那些内边。
 *
 * 物理上玩家早就被高度差挡住了，栏杆纯粹是**让那道看不见的墙变得可信** ——
 * 没有栏杆的悬空边缘，玩家会一直去试探，然后觉得手感很怪。
 */
function Railings() {
  const [ax0, az0, ax1] = ATRIUM
  const segs: { pos: [number, number, number]; len: number; rotY: number }[] = [
    // 中庭西边（西挑台的内边），从北端连接处一直到南端开口
    { pos: [ax0, FLOOR2_Y, (az0 + 4.0) / 2], len: 4.0 - az0, rotY: Math.PI / 2 },
    // 中庭东边
    { pos: [ax1, FLOOR2_Y, (az0 + 4.0) / 2], len: 4.0 - az0, rotY: Math.PI / 2 },
    // 中庭北边（北端连接的内边）
    { pos: [(ax0 + ax1) / 2, FLOOR2_Y, az0], len: ax1 - ax0, rotY: 0 },
    // 西挑台的南端头
    { pos: [(-10 + ax0) / 2, FLOOR2_Y, 4.0], len: ax0 + 10, rotY: 0 },
    // 东挑台南端头：楼梯口要留空，所以拆成两段
    { pos: [(ax1 + STAIRS.x0) / 2, FLOOR2_Y, 4.0], len: STAIRS.x0 - ax1, rotY: 0 },
    { pos: [(STAIRS.x1 + 10) / 2, FLOOR2_Y, 4.0], len: 10 - STAIRS.x1, rotY: 0 },
  ]

  return (
    <group>
      {segs.map((s, i) => (
        <RailSegment key={i} {...s} />
      ))}
    </group>
  )
}

function RailSegment({
  pos,
  len,
  rotY,
}: {
  pos: [number, number, number]
  len: number
  rotY: number
}) {
  if (len <= 0.05) return null
  const postCount = Math.max(2, Math.round(len / 0.42))
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      {/* 扶手 */}
      <mesh position={[0, 0.98, 0]} castShadow>
        <boxGeometry args={[len, 0.07, 0.09]} />
        <meshStandardMaterial color="#4a3120" roughness={0.35} metalness={0.2} />
      </mesh>
      {/* 下横档 */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[len, 0.08, 0.06]} />
        <meshStandardMaterial color="#241811" roughness={0.8} />
      </mesh>
      {/* 立柱 */}
      {Array.from({ length: postCount }, (_, i) => (
        <mesh
          key={i}
          position={[-len / 2 + (i * len) / (postCount - 1), 0.54, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.022, 0.022, 0.88, 8]} />
          <meshStandardMaterial color="#1b120d" roughness={0.7} metalness={0.25} />
        </mesh>
      ))}
    </group>
  )
}

/** 一跑直梯：踏步 + 两侧梯帮 + 扶手 */
function Staircase() {
  const { x0, x1, zBottom, zTop, steps } = STAIRS
  const width = x1 - x0
  const cx = (x0 + x1) / 2
  const run = (zBottom - zTop) / steps
  const rise = FLOOR2_Y / steps

  return (
    <group>
      {Array.from({ length: steps }, (_, i) => {
        const z = zBottom - i * run - run / 2
        const y = (i + 1) * rise
        return (
          <group key={i}>
            {/* 踏板 */}
            <mesh position={[cx, y - 0.025, z]} castShadow receiveShadow>
              <boxGeometry args={[width, 0.05, run + 0.04]} />
              <meshStandardMaterial color="#33221600" roughness={0.7} />
            </mesh>
            {/* 踢面 */}
            <mesh position={[cx, y - rise / 2, z + run / 2]} receiveShadow>
              <boxGeometry args={[width, rise, 0.04]} />
              <meshStandardMaterial color="#1d1410" roughness={0.9} />
            </mesh>
          </group>
        )
      })}

      {/* 两侧梯帮，斜着的板。也是碰撞体所在，玩家只能从上下两端进出 */}
      {[x0 - 0.11, x1 + 0.11].map((x, i) => {
        const len = Math.hypot(zBottom - zTop, FLOOR2_Y)
        const angle = Math.atan2(FLOOR2_Y, zBottom - zTop)
        return (
          <mesh
            key={i}
            position={[x, FLOOR2_Y / 2 - 0.1, (zBottom + zTop) / 2]}
            rotation={[angle, 0, 0]}
            castShadow
          >
            <boxGeometry args={[0.22, 0.42, len]} />
            <meshStandardMaterial color="#241811" roughness={0.85} />
          </mesh>
        )
      })}

      {/* 扶手：沿梯段斜着走 */}
      {[x0 - 0.11, x1 + 0.11].map((x, i) => {
        const len = Math.hypot(zBottom - zTop, FLOOR2_Y)
        const angle = Math.atan2(FLOOR2_Y, zBottom - zTop)
        return (
          <mesh
            key={i}
            position={[x, FLOOR2_Y / 2 + 0.86, (zBottom + zTop) / 2]}
            rotation={[angle, 0, 0]}
            castShadow
          >
            <boxGeometry args={[0.08, 0.07, len]} />
            <meshStandardMaterial color="#4a3120" roughness={0.35} metalness={0.2} />
          </mesh>
        )
      })}

      {/* 楼梯脚下一盏地灯，把入口点出来 —— 玩家得看得见"这里能上去" */}
      <pointLight
        userData={{ budget: 'point' }}
        position={[cx, 0.5, zBottom + 0.4]}
        intensity={3.2}
        color="#ffb257"
        distance={4.5}
        decay={2}
      />
      <mesh position={[cx, 0.02, zBottom + 0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.62, 32]} />
        <meshBasicMaterial
          color="#ffb257"
          transparent
          opacity={0.3}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

/** 支撑挑台的柱子。有柱子，二楼才像是"架"在那儿而不是浮着 */
function Columns() {
  const xs = [-5.0, 5.0]
  const zs = [-10.6, -6.0, -1.2, 3.6]
  return (
    <group>
      {xs.flatMap((x) =>
        zs.map((z) => (
          <group key={`${x}:${z}`} position={[x, 0, z]}>
            <mesh position={[0, (FLOOR2_Y - SLAB) / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.28, FLOOR2_Y - SLAB, 0.28]} />
              <meshStandardMaterial color="#1b120d" roughness={0.9} />
            </mesh>
            {/* 柱础和柱头，避免柱子像根牙签 */}
            <mesh position={[0, 0.06, 0]} castShadow>
              <boxGeometry args={[0.38, 0.12, 0.38]} />
              <meshStandardMaterial color="#241811" roughness={0.8} />
            </mesh>
            <mesh position={[0, FLOOR2_Y - SLAB - 0.06, 0]} castShadow>
              <boxGeometry args={[0.38, 0.12, 0.38]} />
              <meshStandardMaterial color="#241811" roughness={0.8} />
            </mesh>
          </group>
        )),
      )}
    </group>
  )
}
