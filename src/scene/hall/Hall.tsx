import { useMemo } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { BAR, BAR_STOOL_X, HALL } from '../hallLayout'
import { DustMotes } from './DustMotes'

/**
 * 酒吧大厅：地板、墙、天花板、吧台、酒架、霓虹。
 *
 * 全是静态几何体 —— 真做美术时，这些东西的光照可以在 Blender 里
 * 一次性烤进贴图，运行时零成本，效果比实时阴影还好。
 */
export function Hall() {
  return (
    <group>
      <Floor />
      <Shell />
      <BarCounter />
      <Neon />
      <CeilingBeams />
      <DustMotes />
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
        mixStrength={2.2}
        blur={[420, 120]}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.35}
        depthToBlurRatioBias={0.28}
        mirror={0.32}
        color="#221a15"
        roughness={0.92}
        metalness={0.28}
      />
    </mesh>
  )
}

/** 四面墙 + 天花板。开放场景会漏光，氛围立刻垮 */
function Shell() {
  const { width: w, depth: d, height: h } = HALL
  const walls: { pos: [number, number, number]; rot: [number, number, number]; size: [number, number] }[] =
    [
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
      {/* 墙裙：深色木饰面，把墙面切成两段，避免大片平坦色块 */}
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
    </group>
  )
}

/* ---------------- 吧台 ---------------- */

/**
 * 吧台。之前那版是个纯色方盒 + 一排悬空的小方块，离得近了非常穿帮。
 *
 * 现在拆成六件东西：带竖向木条的台身、有包边的台面、脚踏铜杆、
 * 三张吧凳、带层板和背光的酒柜、以及倒挂的玻璃杯架。
 * 关键不在于多，而在于**每样东西都要有厚度和落脚点** ——
 * 悬空的物体是"这是个 demo"最强的信号。
 */
function BarCounter() {
  const width = BAR.x1 - BAR.x0
  const cx = (BAR.x0 + BAR.x1) / 2

  return (
    <group>
      <CounterBody cx={cx} width={width} />
      <BackBar cx={cx} width={width} />
      <BarStools />
      <GlassRack cx={cx} />
    </group>
  )
}

function CounterBody({ cx, width }: { cx: number; width: number }) {
  // 台身正面的竖木条，让大平面有节奏
  const slats = useMemo(() => {
    const n = Math.floor(width / 0.34)
    return Array.from({ length: n }, (_, i) => BAR.x0 + 0.17 + i * 0.34)
  }, [width])

  return (
    <group>
      {/* 台身 */}
      <mesh position={[cx, BAR.counterH / 2, BAR.counterZ]} castShadow receiveShadow>
        <boxGeometry args={[width, BAR.counterH, 0.72]} />
        <meshStandardMaterial color="#20150f" roughness={0.88} />
      </mesh>
      {/* 正面竖木条 */}
      {slats.map((x, i) => (
        <mesh key={i} position={[x, BAR.counterH / 2, BAR.counterZ + 0.375]} castShadow>
          <boxGeometry args={[0.07, BAR.counterH - 0.14, 0.04]} />
          <meshStandardMaterial color="#33211619" roughness={0.7} metalness={0.15} />
        </mesh>
      ))}
      {/* 台面：比台身宽出一圈，形成能接光的边沿 */}
      <mesh position={[cx, BAR.counterH + 0.03, BAR.counterZ]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.16, 0.07, 0.92]} />
        <meshStandardMaterial color="#4a3120" roughness={0.22} metalness={0.28} />
      </mesh>
      {/* 台面下缘的暖色灯带 —— 吧台"发亮"的来源 */}
      <mesh position={[cx, BAR.counterH - 0.04, BAR.counterZ + 0.44]}>
        <boxGeometry args={[width - 0.2, 0.018, 0.02]} />
        <meshBasicMaterial color="#ff9d4a" toneMapped={false} />
      </mesh>
      <pointLight
        position={[cx, BAR.counterH - 0.1, BAR.counterZ + 0.6]}
        intensity={4}
        color="#ff9d4a"
        distance={3.6}
        decay={2}
      />
      {/* 脚踏铜杆 */}
      <mesh
        position={[cx, 0.19, BAR.counterZ + 0.5]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.035, 0.035, width - 0.3, 12]} />
        <meshStandardMaterial color="#8a6a32" roughness={0.28} metalness={0.85} />
      </mesh>
      {[BAR.x0 + 0.5, cx, BAR.x1 - 0.5].map((x, i) => (
        <mesh key={i} position={[x, 0.1, BAR.counterZ + 0.5]} castShadow>
          <boxGeometry args={[0.05, 0.2, 0.05]} />
          <meshStandardMaterial color="#6b5227" roughness={0.4} metalness={0.7} />
        </mesh>
      ))}
      {/* 台面上的零碎：啤酒龙头 + 几个杯子 */}
      <BeerTaps x={BAR.x1 - 0.9} />
      {[0.6, 1.15, 2.4].map((d, i) => (
        <mesh
          key={i}
          position={[BAR.x0 + d, BAR.counterH + 0.13, BAR.counterZ + 0.12]}
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
      {/* 底座 */}
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
          {/* 龙头把手 */}
          <mesh position={[0, 0.31, 0.03]} rotation={[0.3, 0, 0]} castShadow>
            <capsuleGeometry args={[0.022, 0.09, 3, 8]} />
            <meshStandardMaterial
              color={['#7d1f1f', '#1f4a2e', '#2b3d6b'][i]}
              roughness={0.45}
            />
          </mesh>
          {/* 出酒口 */}
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
function BackBar({ cx, width }: { cx: number; width: number }) {
  const shelfY = [1.16, 1.63, 2.1]

  const bottles = useMemo(() => {
    // 深、脏、低饱和。第一版用的是高饱和亮色，在近距离配合 Bloom
    // 会糊成一排发光的糖果 —— 酒瓶是**被照亮的玻璃**，不是光源本身。
    const palette = [
      '#3f6b5e', '#8a5a26', '#6b2f3c', '#39496b',
      '#7a6a2c', '#41603a', '#7a3f22', '#4a3a63',
    ]
    const out: {
      x: number; y: number; h: number; r: number; color: string; slim: boolean
    }[] = []
    shelfY.forEach((y, si) => {
      // 每层瓶距略有差别，整齐等距看起来像货架不像酒吧
      const gap = 0.2 + si * 0.022
      const n = Math.floor((width - 0.5) / gap)
      for (let i = 0; i < n; i++) {
        // 用确定性的伪随机，避免每次渲染瓶子乱跳
        const seed = Math.sin((si * 37 + i * 11.7) * 1.7) * 0.5 + 0.5
        const seed2 = Math.sin((si * 13 + i * 5.3) * 3.1) * 0.5 + 0.5
        out.push({
          x: BAR.x0 + 0.26 + i * gap + (seed - 0.5) * 0.03,
          y: y + 0.03,
          h: 0.19 + seed * 0.13,
          r: 0.033 + seed2 * 0.016,
          color: palette[(si * 3 + i) % palette.length],
          slim: seed2 > 0.6,
        })
      }
    })
    return out
  }, [width])

  return (
    <group>
      {/* 背板 */}
      <mesh position={[cx, 1.65, BAR.backZ - 0.12]} receiveShadow>
        <boxGeometry args={[width + 0.3, 3.3, 0.12]} />
        <meshStandardMaterial color="#150e0a" roughness={0.95} />
      </mesh>
      {/* 深色镜面：低粗糙度 + 一点金属度，能映到酒瓶和霓虹的色块 */}
      <mesh position={[cx, 1.68, BAR.backZ - 0.05]}>
        <planeGeometry args={[width - 0.2, 2.5]} />
        <meshStandardMaterial color="#0e1418" roughness={0.16} metalness={0.85} />
      </mesh>

      {shelfY.map((y, i) => (
        <group key={i}>
          {/* 层板 */}
          <mesh position={[cx, y, BAR.backZ]} castShadow receiveShadow>
            <boxGeometry args={[width - 0.1, 0.05, 0.26]} />
            <meshStandardMaterial color="#2b1c12" roughness={0.75} />
          </mesh>
          {/* 层板下的背光灯带：把上一层的酒瓶从下方点亮 */}
          <mesh position={[cx, y - 0.035, BAR.backZ - 0.09]}>
            <boxGeometry args={[width - 0.5, 0.012, 0.015]} />
            <meshBasicMaterial
              color={i === 1 ? '#5ad6c0' : '#ffb257'}
              toneMapped={false}
            />
          </mesh>
          <pointLight
            position={[cx, y + 0.12, BAR.backZ + 0.12]}
            intensity={1.0}
            color={i === 1 ? '#5ad6c0' : '#ffb257'}
            distance={2.2}
            decay={2}
          />
        </group>
      ))}

      {bottles.map((b, i) => (
        <group key={i} position={[b.x, b.y, BAR.backZ]}>
          {/* 瓶身 */}
          <mesh position={[0, b.h / 2, 0]} castShadow>
            <cylinderGeometry args={[b.r, b.r * 1.04, b.h, 12]} />
            <meshStandardMaterial
              color={b.color}
              roughness={0.28}
              metalness={0.1}
              transparent
              opacity={0.88}
            />
          </mesh>
          {/* 肩部收口 */}
          <mesh position={[0, b.h + 0.025, 0]} castShadow>
            <cylinderGeometry args={[b.r * 0.42, b.r, 0.05, 12]} />
            <meshStandardMaterial
              color={b.color}
              roughness={0.28}
              metalness={0.1}
              transparent
              opacity={0.88}
            />
          </mesh>
          {/* 瓶颈 —— 有没有这一截，是"酒瓶"和"色块"的分界线 */}
          <mesh position={[0, b.h + 0.09, 0]} castShadow>
            <cylinderGeometry args={[b.r * 0.34, b.r * 0.34, 0.08, 10]} />
            <meshStandardMaterial
              color={b.color}
              roughness={0.28}
              metalness={0.1}
              transparent
              opacity={0.88}
            />
          </mesh>
          {/* 瓶盖 */}
          <mesh position={[0, b.h + 0.14, 0]}>
            <cylinderGeometry args={[b.r * 0.38, b.r * 0.38, 0.025, 10]} />
            <meshStandardMaterial color="#c9a227" roughness={0.35} metalness={0.7} />
          </mesh>
          {/* 酒标：一圈略暗的窄环，打破整只瓶子的纯色 */}
          {!b.slim && (
            <mesh position={[0, b.h * 0.45, 0]}>
              <cylinderGeometry args={[b.r * 1.02, b.r * 1.02, b.h * 0.3, 12]} />
              <meshStandardMaterial color="#e8dcc8" roughness={0.85} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

/** 吧凳：圆座 + 立柱 + 底盘 + 脚环 */
function BarStools() {
  const xs = BAR_STOOL_X
  const z = BAR.counterZ + BAR.stoolOffset
  return (
    <group>
      {xs.map((x, i) => (
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
function GlassRack({ cx }: { cx: number }) {
  const y = 2.32
  const glasses = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        x: cx - 1.05 + (i % 4) * 0.7,
        z: BAR.counterZ - 0.16 + Math.floor(i / 4) * 0.32,
      })),
    [cx],
  )
  return (
    <group>
      {/* 挂架 */}
      {[-0.16, 0.16].map((dz, i) => (
        <mesh key={i} position={[cx, y, BAR.counterZ + dz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.014, 0.014, 2.9, 8]} />
          <meshStandardMaterial color="#6b5227" roughness={0.35} metalness={0.8} />
        </mesh>
      ))}
      {[-1.4, 1.4].map((dx, i) => (
        <mesh key={i} position={[cx + dx, y + 0.34, BAR.counterZ]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.68, 8]} />
          <meshStandardMaterial color="#6b5227" roughness={0.4} metalness={0.8} />
        </mesh>
      ))}
      {glasses.map((g, i) => (
        <group key={i} position={[g.x, y - 0.03, g.z]}>
          {/* 杯脚朝上、杯口朝下 */}
          <mesh position={[0, -0.02, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.012, 14]} />
            <meshStandardMaterial
              color="#cfe4e8"
              roughness={0.05}
              metalness={0.1}
              transparent
              opacity={0.45}
            />
          </mesh>
          <mesh position={[0, -0.08, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.11, 8]} />
            <meshStandardMaterial
              color="#cfe4e8"
              roughness={0.05}
              transparent
              opacity={0.45}
            />
          </mesh>
          <mesh position={[0, -0.175, 0]}>
            <coneGeometry args={[0.062, 0.16, 16, 1, true]} />
            <meshStandardMaterial
              color="#cfe4e8"
              roughness={0.04}
              metalness={0.15}
              transparent
              opacity={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * 霓虹。自发光材质 + Bloom = 最省事的"这是个酒吧"信号。
 * toneMapped={false} 很关键：不关掉色调映射，亮度会被压回去，
 * Bloom 就抓不到它了。
 */
function Neon() {
  const { width: w, depth: d } = HALL
  return (
    <group>
      {/* 后墙的粉色横条 */}
      <mesh position={[3.2, 2.5, -d / 2 + 0.06]}>
        <boxGeometry args={[4.2, 0.055, 0.03]} />
        <meshBasicMaterial color="#ff3d7f" toneMapped={false} />
      </mesh>
      <pointLight position={[3.2, 2.5, -d / 2 + 0.5]} intensity={7} color="#ff3d7f" distance={7} decay={2} />

      {/* 右墙的青色竖条 */}
      <mesh position={[w / 2 - 0.06, 2.1, 1.5]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[3.0, 0.05, 0.03]} />
        <meshBasicMaterial color="#2ee0c0" toneMapped={false} />
      </mesh>
      <pointLight position={[w / 2 - 0.6, 2.1, 1.5]} intensity={6} color="#2ee0c0" distance={7} decay={2} />

      {/* 吧台上方的环形招牌。要抬到最高一层酒瓶之上，否则会插进酒柜里 */}
      <mesh position={[(BAR.x0 + BAR.x1) / 2, 2.92, BAR.backZ - 0.02]}>
        <torusGeometry args={[0.46, 0.026, 12, 40]} />
        <meshBasicMaterial color="#ffb257" toneMapped={false} />
      </mesh>
      <pointLight
        position={[(BAR.x0 + BAR.x1) / 2, 2.92, BAR.backZ + 0.5]}
        intensity={5}
        color="#ffb257"
        distance={6}
        decay={2}
      />

      {/* 左墙一条暗红，制造第三个色相 */}
      <mesh position={[-w / 2 + 0.06, 1.95, 3.4]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[2.4, 0.045, 0.03]} />
        <meshBasicMaterial color="#ff5a2e" toneMapped={false} />
      </mesh>
      <pointLight position={[-w / 2 + 0.6, 1.95, 3.4]} intensity={4.5} color="#ff5a2e" distance={6} decay={2} />
    </group>
  )
}

/** 天花板横梁。给顶部一点结构，也让吊灯有个挂的地方 */
function CeilingBeams() {
  const { width: w, depth: d, height: h } = HALL
  return (
    <group>
      {[-4.5, 0, 4.5].map((z, i) => (
        <mesh key={i} position={[0, h - 0.14, z]} castShadow>
          <boxGeometry args={[w, 0.22, 0.28]} />
          <meshStandardMaterial color="#160f0b" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, h - 0.14, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[d, 0.2, 0.24]} />
        <meshStandardMaterial color="#160f0b" roughness={0.95} />
      </mesh>
    </group>
  )
}

export const HALL_CENTER = new THREE.Vector3(0, 0, 0)
