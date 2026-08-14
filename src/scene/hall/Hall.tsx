import { useMemo } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { HALL } from '../hallLayout'
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

/** 吧台 + 后面的酒架。酒瓶用来接霓虹，是很便宜的高光来源 */
function BarCounter() {
  const bottles = useMemo(() => {
    const colors = ['#8ad3c0', '#d99a4e', '#b5546a', '#6f8fd0', '#c9b05a', '#7fbf6a']
    return Array.from({ length: 26 }, (_, i) => ({
      x: -9.1 + (i % 13) * 0.26,
      y: i < 13 ? 1.32 : 1.78,
      color: colors[i % colors.length],
      h: 0.2 + (i % 4) * 0.045,
    }))
  }, [])

  return (
    <group>
      {/* 台面 */}
      <mesh position={[-7.6, 0.55, -5.7]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 1.1, 2.6]} />
        <meshStandardMaterial color="#241812" roughness={0.75} />
      </mesh>
      <mesh position={[-7.6, 1.13, -5.7]} castShadow>
        <boxGeometry args={[3.0, 0.08, 2.8]} />
        <meshStandardMaterial color="#3a2618" roughness={0.32} metalness={0.2} />
      </mesh>
      {/* 后面的酒架 */}
      <mesh position={[-8.6, 1.6, -7.15]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 3.2, 0.4]} />
        <meshStandardMaterial color="#1a110c" roughness={0.9} />
      </mesh>
      {bottles.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, -6.9]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, b.h, 10]} />
          <meshStandardMaterial
            color={b.color}
            roughness={0.12}
            metalness={0.35}
            transparent
            opacity={0.82}
          />
        </mesh>
      ))}
      {/* 酒架下的灯带，把酒瓶从背后打亮 */}
      <pointLight position={[-8.4, 1.2, -6.8]} intensity={3.5} color="#5ad6c0" distance={4.5} decay={2} />
      <pointLight position={[-7.0, 1.7, -6.8]} intensity={2.8} color="#d98b4e" distance={4} decay={2} />
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

      {/* 吧台上方的环形招牌 */}
      <mesh position={[-7.6, 2.55, -7.0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.62, 0.028, 12, 40]} />
        <meshBasicMaterial color="#ffb257" toneMapped={false} />
      </mesh>
      <pointLight position={[-7.6, 2.55, -6.4]} intensity={5} color="#ffb257" distance={6} decay={2} />

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
