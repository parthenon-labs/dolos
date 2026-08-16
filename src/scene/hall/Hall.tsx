import { useMemo, useRef } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BAR, FLOOR2_Y, HALL } from '../hallLayout'
import { DustMotes } from './DustMotes'
import { Mezzanine } from './Mezzanine'

/**
 * 酒馆大厅：地板、墙、天花板、吧台、霓虹、壁炉、二层挑台。
 *
 * 全是静态几何体 —— 真做美术时，这些东西的光照可以在 Blender 里
 * 一次性烤进贴图，运行时零成本，效果比实时阴影还好。
 */
export function Hall() {
  return (
    <group>
      <Floor />
      <Shell />
      <Mezzanine />
      <BarCounter />
      <Fireplace />
      <Sconces />
      <Chandelier position={[0, 0, -5.5]} />
      <Chandelier position={[0, 0, 6.5]} scale={0.82} />
      <Neon />
      <DustMotes />
    </group>
  )
}

/**
 * 中庭吊灯。
 *
 * 挑空之后中庭上半部是一大片没有任何东西的黑，纵向空间白白浪费掉了。
 * 吊灯同时解决三件事：填满那段高度、给二楼一个平视高度的发光物
 * （否则站在挑台上视野里只有黑天花板）、以及作为长厅里的方位地标。
 */
function Chandelier({
  position,
  scale = 1,
}: {
  position: [number, number, number]
  scale?: number
}) {
  const y = 5.6
  const r = 1.15
  const candles = 8
  return (
    <group position={[position[0], y, position[2]]} scale={scale}>
      {/* 吊链 */}
      <mesh position={[0, (HALL.height - y) / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, HALL.height - y, 6]} />
        <meshStandardMaterial color="#0d0a08" />
      </mesh>
      {/* 外圈铁环 */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[r, 0.032, 8, 40]} />
        <meshStandardMaterial color="#3a2c18" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* 内圈 */}
      <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[r * 0.55, 0.024, 8, 30]} />
        <meshStandardMaterial color="#3a2c18" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* 斜拉的支条 */}
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2
        return (
          <mesh
            key={i}
            position={[Math.sin(a) * r * 0.78, 0.14, Math.cos(a) * r * 0.78]}
            rotation={[0, -a, 0.42]}
          >
            <cylinderGeometry args={[0.01, 0.01, 0.62, 6]} />
            <meshStandardMaterial color="#3a2c18" roughness={0.5} metalness={0.7} />
          </mesh>
        )
      })}
      {/* 一圈蜡烛 */}
      {Array.from({ length: candles }, (_, i) => {
        const a = (i / candles) * Math.PI * 2
        return (
          <group key={i} position={[Math.sin(a) * r, 0.03, Math.cos(a) * r]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.032, 0.036, 0.2, 8]} />
              <meshStandardMaterial color="#d8cbb0" roughness={0.85} />
            </mesh>
            {/* 火苗：自发光小球，交给 Bloom 晕开成一圈光点 */}
            <mesh position={[0, 0.14, 0]}>
              <sphereGeometry args={[0.028, 8, 6]} />
              <meshBasicMaterial color="#ffd08a" toneMapped={false} />
            </mesh>
          </group>
        )
      })}
      {/* 单个点光源代表整圈蜡烛 —— 八个真光源太贵，观感差别很小 */}
      <pointLight userData={{ budget: 'point' }} position={[0, 0.1, 0]} intensity={11} color="#ffb257" distance={13} decay={2} />
    </group>
  )
}

/**
 * 反射地板 —— 单项性价比最高的一个效果。
 *
 * 酒吧地面的湿润反光会把霓虹和吊灯全部再现一遍，
 * 空间的纵深感和"贵"的感觉大半来自这里。
 * resolution 压到 512 + 高 blur：反正要糊，没必要渲染清晰的镜像。
 */
function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[HALL.width, HALL.depth]} />
      <MeshReflectorMaterial
        resolution={512}
        mixBlur={1.15}
        mixStrength={2.0}
        blur={[420, 120]}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.35}
        depthToBlurRatioBias={0.28}
        mirror={0.3}
        color="#221a15"
        roughness={0.92}
        metalness={0.26}
      />
    </mesh>
  )
}

/** 四面墙 + 天花板。开放场景会漏光，氛围立刻垮 */
function Shell() {
  const { width: w, depth: d, height: h } = HALL
  const walls: {
    pos: [number, number, number]
    rot: [number, number, number]
    size: [number, number]
  }[] = [
    { pos: [0, h / 2, -d / 2], rot: [0, 0, 0], size: [w, h] },
    { pos: [0, h / 2, d / 2], rot: [0, Math.PI, 0], size: [w, h] },
    { pos: [-w / 2, h / 2, 0], rot: [0, Math.PI / 2, 0], size: [d, h] },
    { pos: [w / 2, h / 2, 0], rot: [0, -Math.PI / 2, 0], size: [d, h] },
  ]
  return (
    <group>
      {walls.map((wl, i) => (
        <mesh key={i} position={wl.pos} rotation={wl.rot} receiveShadow>
          <planeGeometry args={wl.size} />
          <meshStandardMaterial color="#2b1e17" roughness={0.98} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#120d0a" roughness={1} />
      </mesh>
      {/* 一层墙裙：深色木饰面，把墙面切成两段，避免大片平坦色块 */}
      {walls.map((wl, i) => (
        <mesh
          key={`w${i}`}
          position={[wl.pos[0], 0.55, wl.pos[2]]}
          rotation={wl.rot}
          receiveShadow
        >
          <planeGeometry args={[wl.size[0], 1.1]} />
          <meshStandardMaterial color="#1b120d" roughness={0.7} metalness={0.12} />
        </mesh>
      ))}
      {/* 二层腰线，横向拉一条把长墙断开 */}
      {walls.map((wl, i) => (
        <mesh
          key={`b${i}`}
          position={[wl.pos[0], FLOOR2_Y + 0.9, wl.pos[2]]}
          rotation={wl.rot}
        >
          <planeGeometry args={[wl.size[0], 0.14]} />
          <meshStandardMaterial color="#3a2618" roughness={0.6} metalness={0.2} />
        </mesh>
      ))}
      {/* 天花板横梁，给通高的中庭一点结构 */}
      {[-12, -7, -2, 3, 8, 13].map((z, i) => (
        <mesh key={i} position={[0, h - 0.16, z]} castShadow>
          <boxGeometry args={[w, 0.26, 0.3]} />
          <meshStandardMaterial color="#160f0b" roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- 吧台 ---------------- */

/**
 * 吧台。贴西墙纵向铺开，藏在二楼挑台底下 —— 挑台压低了这里的天花，
 * 天然形成一个比中庭更暗、更私密的角落，是长条空间里最容易做出层次的地方。
 *
 * 几何体按"沿局部 X 铺开、正面朝局部 +Z"来建，整组再旋转摆位。
 * 这样这里一行坐标都不用改，摆到哪面墙只是改 BAR.rot。
 */
function BarCounter() {
  const w = BAR.length
  return (
    <group position={[BAR.center[0], 0, BAR.center[1]]} rotation={[0, BAR.rot, 0]}>
      <CounterBody width={w} />
      <BackBar width={w} />
      <BarStools />
      <GlassRack />
    </group>
  )
}

function CounterBody({ width }: { width: number }) {
  const slats = useMemo(() => {
    const n = Math.floor(width / 0.34)
    return Array.from({ length: n }, (_, i) => -width / 2 + 0.17 + i * 0.34)
  }, [width])

  return (
    <group>
      <mesh position={[0, BAR.counterH / 2, BAR.counterZ]} castShadow receiveShadow>
        <boxGeometry args={[width, BAR.counterH, 0.72]} />
        <meshStandardMaterial color="#20150f" roughness={0.88} />
      </mesh>
      {slats.map((x, i) => (
        <mesh key={i} position={[x, BAR.counterH / 2, BAR.counterZ + 0.375]} castShadow>
          <boxGeometry args={[0.07, BAR.counterH - 0.14, 0.04]} />
          <meshStandardMaterial color="#332116" roughness={0.7} metalness={0.15} />
        </mesh>
      ))}
      {/* 台面：比台身宽出一圈，形成能接光的边沿 */}
      <mesh position={[0, BAR.counterH + 0.03, BAR.counterZ]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.16, 0.07, 0.92]} />
        <meshStandardMaterial color="#4a3120" roughness={0.22} metalness={0.28} />
      </mesh>
      {/* 台面下缘的暖色灯带 —— 吧台"发亮"的来源 */}
      <mesh position={[0, BAR.counterH - 0.04, BAR.counterZ + 0.44]}>
        <boxGeometry args={[width - 0.2, 0.018, 0.02]} />
        <meshBasicMaterial color="#ff9d4a" toneMapped={false} />
      </mesh>
      <pointLight
        userData={{ budget: 'point' }}
        position={[0, BAR.counterH - 0.1, BAR.counterZ + 0.6]}
        intensity={4}
        color="#ff9d4a"
        distance={4}
        decay={2}
      />
      {/* 脚踏铜杆 */}
      <mesh
        position={[0, 0.19, BAR.counterZ + 0.5]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.035, 0.035, width - 0.3, 12]} />
        <meshStandardMaterial color="#8a6a32" roughness={0.28} metalness={0.85} />
      </mesh>
      {[-width / 2 + 0.5, 0, width / 2 - 0.5].map((x, i) => (
        <mesh key={i} position={[x, 0.1, BAR.counterZ + 0.5]} castShadow>
          <boxGeometry args={[0.05, 0.2, 0.05]} />
          <meshStandardMaterial color="#6b5227" roughness={0.4} metalness={0.7} />
        </mesh>
      ))}
      <BeerTaps x={width / 2 - 0.9} />
      {[-2.6, -1.2, 1.6].map((x, i) => (
        <mesh
          key={i}
          position={[x, BAR.counterH + 0.13, BAR.counterZ + 0.12]}
          castShadow
        >
          <cylinderGeometry args={[0.048, 0.038, 0.13, 14]} />
          <meshStandardMaterial
            color="#d0a054"
            roughness={0.08}
            metalness={0.15}
            transparent
            opacity={0.72}
          />
        </mesh>
      ))}
    </group>
  )
}

function BeerTaps({ x }: { x: number }) {
  return (
    <group position={[x, BAR.counterH + 0.07, BAR.counterZ - 0.16]}>
      <mesh castShadow>
        <boxGeometry args={[0.42, 0.05, 0.14]} />
        <meshStandardMaterial color="#5c4a28" roughness={0.3} metalness={0.75} />
      </mesh>
      {[-0.14, 0, 0.14].map((dx, i) => (
        <group key={i} position={[dx, 0, 0]}>
          <mesh position={[0, 0.14, 0]} castShadow>
            <cylinderGeometry args={[0.017, 0.017, 0.28, 10]} />
            <meshStandardMaterial color="#8a6a32" roughness={0.22} metalness={0.9} />
          </mesh>
          <mesh position={[0, 0.31, 0.03]} rotation={[0.3, 0, 0]} castShadow>
            <capsuleGeometry args={[0.022, 0.09, 3, 8]} />
            <meshStandardMaterial
              color={['#7d1f1f', '#1f4a2e', '#2b3d6b'][i]}
              roughness={0.45}
            />
          </mesh>
          <mesh position={[0, 0.05, 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.011, 0.011, 0.1, 8]} />
            <meshStandardMaterial color="#8a6a32" roughness={0.2} metalness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** 酒柜：背板 + 三层层板 + 站在层板上的酒瓶 + 每层的背光灯带 */
function BackBar({ width }: { width: number }) {
  const shelfY = [1.16, 1.63, 2.1]
  const group = useRef<THREE.Group>(null)

  const bottles = useMemo(() => {
    // 深、脏、低饱和。高饱和亮色在近距离配合 Bloom 会糊成一排发光的糖果 ——
    // 酒瓶是**被照亮的玻璃**，不是光源本身。
    const palette = [
      '#3f6b5e', '#8a5a26', '#6b2f3c', '#39496b',
      '#7a6a2c', '#41603a', '#7a3f22', '#4a3a63',
    ]
    const out: {
      x: number; y: number; profile: THREE.Vector2[]; color: string
    }[] = []
    shelfY.forEach((y, si) => {
      // 每层瓶距略有差别，整齐等距看起来像货架不像酒吧
      const gap = 0.26 + si * 0.03
      const n = Math.floor((width - 0.5) / gap)
      for (let i = 0; i < n; i++) {
        // 用确定性的伪随机，避免每次渲染瓶子乱跳
        const seed = Math.sin((si * 37 + i * 11.7) * 1.7) * 0.5 + 0.5
        const seed2 = Math.sin((si * 13 + i * 5.3) * 3.1) * 0.5 + 0.5
        const h = 0.19 + seed * 0.13
        const r = 0.033 + seed2 * 0.016
        out.push({
          x: -width / 2 + 0.26 + i * gap + (seed - 0.5) * 0.03,
          y: y + 0.03,
          profile: bottleProfile(r, h),
          color: palette[(si * 3 + i) % palette.length],
        })
      }
    })
    return out
  }, [width])

  // 离得远就整柜关掉。酒柜在挑台阴影里，隔着十几米加上雾，
  // 有没有酒瓶根本看不出来，但它是全场 mesh 数量的大头。
  useFrame(({ camera }) => {
    if (!group.current) return
    const p = group.current.parent
    if (!p) return
    const d = camera.position.distanceTo(p.getWorldPosition(tmpVec))
    const on = d < 16
    if (group.current.visible !== on) group.current.visible = on
  })

  return (
    <group>
      <mesh position={[0, 1.65, BAR.backZ - 0.12]} receiveShadow>
        <boxGeometry args={[width + 0.3, 3.3, 0.12]} />
        <meshStandardMaterial color="#150e0a" roughness={0.95} />
      </mesh>
      {/* 深色镜面：低粗糙度 + 一点金属度，能映到酒瓶和霓虹的色块 */}
      <mesh position={[0, 1.68, BAR.backZ - 0.05]}>
        <planeGeometry args={[width - 0.2, 2.5]} />
        <meshStandardMaterial color="#0e1418" roughness={0.16} metalness={0.85} />
      </mesh>

      {shelfY.map((y, i) => (
        <group key={i}>
          <mesh position={[0, y, BAR.backZ]} castShadow receiveShadow>
            <boxGeometry args={[width - 0.1, 0.05, 0.26]} />
            <meshStandardMaterial color="#2b1c12" roughness={0.75} />
          </mesh>
          <mesh position={[0, y - 0.035, BAR.backZ - 0.09]}>
            <boxGeometry args={[width - 0.5, 0.012, 0.015]} />
            <meshBasicMaterial color={i === 1 ? '#5ad6c0' : '#ffb257'} toneMapped={false} />
          </mesh>
          <pointLight
            userData={{ budget: 'point' }}
            position={[0, y + 0.12, BAR.backZ + 0.12]}
            intensity={i === 1 ? 1.4 : 1.0}
            color={i === 1 ? '#5ad6c0' : '#ffb257'}
            distance={2.4}
            decay={2}
          />
        </group>
      ))}

      <group ref={group}>
        {bottles.map((b, i) => (
          <mesh key={i} position={[b.x, b.y, BAR.backZ]} castShadow>
            <latheGeometry args={[b.profile, 10]} />
            <meshStandardMaterial
              color={b.color}
              roughness={0.28}
              metalness={0.1}
              transparent
              opacity={0.88}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}

const tmpVec = new THREE.Vector3()

/**
 * 一整只酒瓶的车削截面：瓶身 → 收肩 → 瓶颈 → 瓶盖，一次成型。
 *
 * 之前每只瓶子是五个 mesh 叠出来的，111 只就是 555 个 mesh，
 * 占了全场的三分之一，实测隐藏它们能从 55 FPS 涨到 76。
 * 车削不但把它压成一个 mesh，收肩还是平滑的曲面，比堆圆柱更像瓶子。
 */
function bottleProfile(r: number, h: number): THREE.Vector2[] {
  return [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r, 0),
    new THREE.Vector2(r, h * 0.9),
    new THREE.Vector2(r * 0.72, h + 0.03),
    new THREE.Vector2(r * 0.4, h + 0.07),
    new THREE.Vector2(r * 0.34, h + 0.11),
    new THREE.Vector2(r * 0.34, h + 0.2),
    new THREE.Vector2(r * 0.4, h + 0.21),
    new THREE.Vector2(r * 0.4, h + 0.235),
    new THREE.Vector2(0, h + 0.235),
  ]
}

/** 吧凳：圆座 + 立柱 + 底盘 + 脚环 */
function BarStools() {
  const z = BAR.counterZ + BAR.stoolOffset
  return (
    <group>
      {[-2.6, -0.6, 1.4].map((x, i) => (
        <group key={i} position={[x, 0, z + (i === 1 ? 0.12 : 0)]}>
          <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.19, 0.19, 0.08, 20]} />
            <meshStandardMaterial color="#3a2417" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.38, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.05, 0.72, 12]} />
            <meshStandardMaterial color="#5c4a28" roughness={0.35} metalness={0.75} />
          </mesh>
          <mesh position={[0, 0.24, 0]} castShadow>
            <torusGeometry args={[0.14, 0.014, 8, 20]} />
            <meshStandardMaterial color="#8a6a32" roughness={0.3} metalness={0.85} />
          </mesh>
          <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.21, 0.23, 0.04, 20]} />
            <meshStandardMaterial color="#2a2018" roughness={0.5} metalness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** 吧台上方倒挂的玻璃杯架。玻璃接光后会有一圈高光，很提质感 */
function GlassRack() {
  const y = 2.32
  const glasses = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        x: -2.2 + (i % 5) * 1.0,
        z: BAR.counterZ - 0.16 + Math.floor(i / 5) * 0.32,
      })),
    [],
  )
  const glassMat = {
    color: '#cfe4e8',
    roughness: 0.05,
    metalness: 0.12,
    transparent: true,
    opacity: 0.42,
  }
  return (
    <group>
      {[-0.16, 0.16].map((dz, i) => (
        <mesh key={i} position={[0, y, BAR.counterZ + dz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.014, 0.014, 6.2, 8]} />
          <meshStandardMaterial color="#6b5227" roughness={0.35} metalness={0.8} />
        </mesh>
      ))}
      {[-3.0, 0, 3.0].map((dx, i) => (
        <mesh key={i} position={[dx, y + 0.34, BAR.counterZ]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.68, 8]} />
          <meshStandardMaterial color="#6b5227" roughness={0.4} metalness={0.8} />
        </mesh>
      ))}
      {glasses.map((g, i) => (
        <group key={i} position={[g.x, y - 0.03, g.z]}>
          <mesh position={[0, -0.02, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.012, 14]} />
            <meshStandardMaterial {...glassMat} />
          </mesh>
          <mesh position={[0, -0.08, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.11, 8]} />
            <meshStandardMaterial {...glassMat} />
          </mesh>
          <mesh position={[0, -0.175, 0]}>
            <coneGeometry args={[0.062, 0.16, 16, 1, true]} />
            <meshStandardMaterial {...glassMat} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ---------------- 壁炉 ---------------- */

/**
 * 北端尽头的壁炉。长条空间需要一个尽端的落点，
 * 否则玩家走到底会觉得"这里什么都没有"。跳动的火光也是免费的动态光源。
 */
function Fireplace() {
  const light = useRef<THREE.PointLight>(null)
  const flames = useRef<THREE.Group>(null)

  useFrame(() => {
    const t = performance.now() / 1000
    // 三个不同频率叠加，避免看出周期
    const n =
      Math.sin(t * 5.1) * 0.5 + Math.sin(t * 11.7) * 0.3 + Math.sin(t * 23.3) * 0.2
    if (light.current) light.current.intensity = 11 + n * 4
    if (flames.current) {
      // 每簇火苗用不同相位各跳各的，整团一起缩放会像在呼吸而不是在烧
      flames.current.children.forEach((c, i) => {
        const p = t * (6 + i * 1.7) + i * 2.1
        const s = 1 + Math.sin(p) * 0.16 + Math.sin(p * 2.3) * 0.07
        c.scale.set(1 + s * 0.06, s, 1 + s * 0.06)
      })
    }
  })

  const z = -14.4
  const brick = { color: '#2a201a', roughness: 0.97 }
  // 炉膛内壁：三面 + 底，做成真的凹进去的盒子而不是一张黑纸
  const openW = 1.7
  const openH = 1.15
  const depth = 0.55

  return (
    <group position={[0, 0, z]}>
      {/* 壁炉体拆成左右垛 + 上方过梁，中间自然留出炉膛开口 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (openW / 2 + 0.42), 1.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.84, 2.2, 0.95]} />
          <meshStandardMaterial {...brick} />
        </mesh>
      ))}
      <mesh position={[0, 1.1 + openH / 2 + 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[openW, 2.2 - openH, 0.95]} />
        <meshStandardMaterial {...brick} />
      </mesh>

      {/* 炉膛内壁 —— 被火光照亮的那几个面是"有深度"的关键 */}
      <mesh position={[0, openH / 2, -depth]} receiveShadow>
        <planeGeometry args={[openW, openH]} />
        <meshStandardMaterial color="#120b08" roughness={1} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (openW / 2), openH / 2, -depth / 2]}
          rotation={[0, -s * Math.PI / 2, 0]}
          receiveShadow
        >
          <planeGeometry args={[depth, openH]} />
          <meshStandardMaterial color="#1a110c" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.01, -depth / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[openW, depth]} />
        <meshStandardMaterial color="#171008" roughness={1} />
      </mesh>

      {/* 柴火 */}
      {[
        { p: [-0.3, 0.11, -0.24] as const, r: 0.3 },
        { p: [0.26, 0.11, -0.3] as const, r: -0.5 },
        { p: [-0.02, 0.24, -0.27] as const, r: 0.12 },
      ].map((l, i) => (
        <mesh key={i} position={[...l.p]} rotation={[0, l.r, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.075, 0.085, 0.85, 8]} />
          <meshStandardMaterial color="#2b1c14" roughness={0.95} />
        </mesh>
      ))}
      {/* 炭火：柴堆底下一层暗红，火苗熄下去时它还在 */}
      <mesh position={[0, 0.06, -0.26]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.46, 20]} />
        <meshBasicMaterial color="#e03a10" toneMapped={false} transparent opacity={0.55} />
      </mesh>

      {/* 火苗：几簇大小不一的锥体互相叠加，比单个锥体像火得多 */}
      <group ref={flames} position={[0, 0.16, -0.26]}>
        {[
          { x: -0.22, h: 0.42, r: 0.15, c: '#ff5a12', o: 0.7 },
          { x: 0.2, h: 0.5, r: 0.16, c: '#ff6f1a', o: 0.7 },
          { x: -0.02, h: 0.72, r: 0.21, c: '#ff8a26', o: 0.78 },
          { x: 0.06, h: 0.4, r: 0.12, c: '#ffd08a', o: 0.95 },
        ].map((f, i) => (
          <mesh key={i} position={[f.x, f.h / 2, 0]}>
            <coneGeometry args={[f.r, f.h, 10]} />
            <meshBasicMaterial
              color={f.c}
              toneMapped={false}
              transparent
              opacity={f.o}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* 壁炉台 */}
      <mesh position={[0, 2.26, 0.06]} castShadow>
        <boxGeometry args={[3.7, 0.16, 1.15]} />
        <meshStandardMaterial color="#4a3120" roughness={0.4} metalness={0.2} />
      </mesh>
      {/* 台上摆两支蜡烛，把壁炉台这条水平线点亮 */}
      {[-1.2, 1.25].map((x, i) => (
        <group key={i} position={[x, 2.34, 0.12]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.04, 0.045, 0.22, 8]} />
            <meshStandardMaterial color="#d8cbb0" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.15, 0]}>
            <sphereGeometry args={[0.03, 8, 6]} />
            <meshBasicMaterial color="#ffd08a" toneMapped={false} />
          </mesh>
          <pointLight userData={{ budget: 'point' }} position={[0, 0.16, 0]} intensity={1.6} color="#ffb257" distance={3} decay={2} />
        </group>
      ))}

      {/* 烟囱 */}
      <mesh position={[0, 4.2, -0.1]} castShadow>
        <boxGeometry args={[2.0, 3.7, 0.75]} />
        <meshStandardMaterial color="#241b16" roughness={0.95} />
      </mesh>

      <pointLight ref={light} userData={{ budget: 'point' }} position={[0, 0.55, 0.2]} color="#ff8a3d" distance={12} decay={2} />
      {/* 溢到炉外地面上的那摊光 */}
      <pointLight userData={{ budget: 'point' }} position={[0, 0.3, 1.5]} intensity={3} color="#ff7a2e" distance={6} decay={2} />
    </group>
  )
}

/* ---------------- 壁灯 ---------------- */

/**
 * 沿长墙等距排布的壁灯。
 *
 * 长条空间最怕中段是一片死黑 —— 一串重复的小光源既能照亮路径，
 * 又能靠透视产生"往深处延伸"的节奏感，这是纵深感的主要来源。
 */
function Sconces() {
  const zs = [-12.5, -8.5, -4.5, -0.5, 3.5, 7.5, 11.5]
  const x = HALL.width / 2 - 0.12
  return (
    <group>
      {zs.flatMap((z) =>
        [-1, 1].map((side) => {
          // 西墙下半段被吧台和挑台占了，跳过那几盏
          if (side === -1 && z > -4.5 && z < 6) return null
          return (
            <group key={`${z}:${side}`} position={[x * side, 2.15, z]}>
              <mesh castShadow>
                <boxGeometry args={[0.1, 0.3, 0.16]} />
                <meshStandardMaterial color="#241811" roughness={0.8} />
              </mesh>
              <mesh position={[side * -0.1, 0.06, 0]}>
                <sphereGeometry args={[0.075, 12, 10]} />
                <meshBasicMaterial color="#ffcf8a" toneMapped={false} />
              </mesh>
              <pointLight
                userData={{ budget: 'point' }}
                position={[side * -0.35, 0.06, 0]}
                intensity={2.6}
                color="#ffb257"
                distance={5}
                decay={2}
              />
            </group>
          )
        }),
      )}
    </group>
  )
}

/* ---------------- 霓虹 ---------------- */

/**
 * 霓虹。自发光材质 + Bloom = 最省事的"这是个酒吧"信号。
 * toneMapped={false} 很关键：不关掉色调映射，亮度会被压回去，
 * Bloom 就抓不到它了。
 */
function Neon() {
  const { width: w, depth: d } = HALL
  return (
    <group>
      {/* 南墙（入口背后）的粉色横条，回头才看得见 */}
      <mesh position={[3.4, 2.6, d / 2 - 0.06]} rotation={[0, Math.PI, 0]}>
        <boxGeometry args={[4.6, 0.055, 0.03]} />
        <meshBasicMaterial color="#ff3d7f" toneMapped={false} />
      </mesh>
      <pointLight userData={{ budget: 'point' }} position={[3.4, 2.6, d / 2 - 0.6]} intensity={7} color="#ff3d7f" distance={8} decay={2} />

      {/* 东墙靠南，青色竖条，走进来第一眼就能看到 */}
      <mesh position={[w / 2 - 0.06, 2.2, 9.5]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[3.2, 0.05, 0.03]} />
        <meshBasicMaterial color="#2ee0c0" toneMapped={false} />
      </mesh>
      <pointLight userData={{ budget: 'point' }} position={[w / 2 - 0.7, 2.2, 9.5]} intensity={6} color="#2ee0c0" distance={7} decay={2} />

      {/* 二层挑台内侧的一圈暗红灯带，从楼下抬头能看到，勾出上层轮廓 */}
      {[-5.0, 5.0].map((x, i) => (
        <mesh key={i} position={[x, FLOOR2_Y - 0.32, -3.3]}>
          <boxGeometry args={[0.04, 0.03, 14.4]} />
          <meshBasicMaterial color="#ff5a2e" toneMapped={false} />
        </mesh>
      ))}
      {/* 长灯带用三盏分段代表，只有一盏时中间亮两头黑，条就断了 */}
      {[-5.0, 5.0].flatMap((x) =>
        [-9.5, -3.3, 2.9].map((z) => (
          <pointLight
            key={`${x}:${z}`}
            userData={{ budget: 'point' }}
            position={[x, FLOOR2_Y - 0.5, z]}
            intensity={3.2}
            color="#ff5a2e"
            distance={6.5}
            decay={2}
          />
        )),
      )}

      {/* 吧台上方的环形招牌 */}
      <mesh position={[-9.6, 2.95, 0.5]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.46, 0.026, 12, 40]} />
        <meshBasicMaterial color="#ffb257" toneMapped={false} />
      </mesh>
      <pointLight userData={{ budget: 'point' }} position={[-8.9, 2.95, 0.5]} intensity={5} color="#ffb257" distance={6} decay={2} />
    </group>
  )
}
