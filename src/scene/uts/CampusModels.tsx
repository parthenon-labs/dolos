import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * 三栋楼的建筑模型，摆在酒馆里当陈列 —— 像校园旁边一家酒吧会有的东西。
 *
 * 都是程序化生成的，没有一个外部资源。选这三栋是因为它们在同一条 Broadway 上
 * 却完全不讲和：一栋粗野主义混凝土、一栋手砌砖的"纸袋"、一栋扭转的玻璃塔。
 * 摆在一起本身就是个笑话，而 UTS 的人一眼认得出。
 */

/* ---------------------------------------------------------------
   Building 1 · UTS Tower
   1960 年代设计、1979 年启用的粗野主义塔楼，Michael Dysart 作品。
   特征是外露混凝土 + 一层层深深缩进的窗带 —— 所以这里靠"厚楼板 + 凹窗"
   的交替来做，而不是给盒子贴窗户贴图。
   --------------------------------------------------------------- */
function Tower({ h = 1.15 }: { h?: number }) {
  const floors = 13
  const fh = h / floors
  return (
    <group>
      {Array.from({ length: floors }, (_, i) => (
        <group key={i} position={[0, fh * (i + 0.5), 0]}>
          {/* 楼板：向外挑出，是这栋楼最强的水平线条 */}
          <mesh castShadow>
            <boxGeometry args={[0.34, fh * 0.62, 0.28]} />
            <meshStandardMaterial color="#8d8375" roughness={0.95} />
          </mesh>
          {/* 窗带：深深缩进，白天在立面上留下一道道阴影 */}
          <mesh position={[0, fh * 0.3, 0]}>
            <boxGeometry args={[0.305, fh * 0.44, 0.243]} />
            <meshStandardMaterial
              color="#20262b"
              roughness={0.35}
              emissive="#c9a227"
              emissiveIntensity={0.18}
            />
          </mesh>
        </group>
      ))}
      {/* 基座 */}
      <mesh position={[0, 0.02, 0]} castShadow>
        <boxGeometry args={[0.46, 0.05, 0.4]} />
        <meshStandardMaterial color="#7c7365" roughness={0.95} />
      </mesh>
    </group>
  )
}

/* ---------------------------------------------------------------
   Building 8 · Dr Chau Chak Wing Building
   Frank Gehry 在澳洲的第一栋楼，32 万块定制砖全部手工砌成，
   东立面是起伏、层层叠涩的砖幕墙，被叫做"皱纸袋"。

   做法：每一皮砖是一个薄盒子，宽度和左右偏移都跟着两个不同频率的正弦走。
   **两个频率是关键** —— 单一正弦会得到规整的波浪，看起来像瓦楞板，
   而不是被捏皱的纸。
   --------------------------------------------------------------- */
function PaperBag({ h = 0.95 }: { h?: number }) {
  const courses = useMemo(() => {
    const n = 34
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1)
      const y = t * h
      const bulge =
        Math.sin(t * Math.PI * 3.1) * 0.035 + Math.sin(t * Math.PI * 7.7 + 1.2) * 0.018
      const sway =
        Math.sin(t * Math.PI * 2.3 + 0.6) * 0.05 + Math.sin(t * Math.PI * 5.1) * 0.02
      return {
        y,
        w: 0.34 + bulge,
        d: 0.3 + bulge * 0.6,
        x: sway,
        rot: Math.sin(t * Math.PI * 1.7) * 0.09,
      }
    })
  }, [h])

  return (
    <group>
      {courses.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, 0]} rotation={[0, c.rot, 0]} castShadow>
          <boxGeometry args={[c.w, h / courses.length + 0.004, c.d]} />
          <meshStandardMaterial
            // 砂岩色的砖。粗糙度拉满，砖不该有任何高光
            color={i % 3 === 0 ? '#9c6a4a' : i % 3 === 1 ? '#a87a56' : '#916145'}
            roughness={1}
          />
        </mesh>
      ))}
      {/* 西立面那片折线玻璃 */}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={`g${i}`}
          position={[-0.2, h * (0.12 + i * 0.12), 0.17]}
          rotation={[0, 0, i % 2 ? 0.22 : -0.22]}
        >
          <planeGeometry args={[0.12, h * 0.11]} />
          <meshStandardMaterial
            color="#6f93a8"
            roughness={0.15}
            metalness={0.6}
            emissive="#4a7a96"
            emissiveIntensity={0.25}
          />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------------
   Building 2 · UTS Central
   2019 年启用，10 层扭转塔楼架在 5 层裙楼上，FJMT 设计。
   扭转靠每层递增一点旋转角实现 —— 这也是真楼的做法。
   --------------------------------------------------------------- */
function TwistTower({ h = 1.0 }: { h?: number }) {
  const podium = h * 0.34
  const floors = 10
  const fh = (h - podium) / floors
  return (
    <group>
      {/* 裙楼 */}
      <mesh position={[0, podium / 2, 0]} castShadow>
        <boxGeometry args={[0.44, podium, 0.4]} />
        <meshStandardMaterial
          color="#2b3540"
          roughness={0.18}
          metalness={0.55}
          emissive="#7fb0cc"
          emissiveIntensity={0.22}
        />
      </mesh>
      {/* 扭转塔身 */}
      {Array.from({ length: floors }, (_, i) => (
        <mesh
          key={i}
          position={[0, podium + fh * (i + 0.5), 0]}
          rotation={[0, (i / floors) * 1.05, 0]}
          castShadow
        >
          <boxGeometry args={[0.3, fh * 0.92, 0.28]} />
          <meshStandardMaterial
            color="#33414e"
            roughness={0.14}
            metalness={0.6}
            emissive="#8fc4de"
            emissiveIntensity={0.2}
          />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------------
   陈列台
   --------------------------------------------------------------- */

const PLAQUES = [
  { label: 'B1 · TOWER', sub: '1979' },
  { label: 'B8 · PAPER BAG', sub: '2015' },
  { label: 'B2 · CENTRAL', sub: '2019' },
]

/** 铭牌：用 canvas 画文字，免去加载字体 */
function plaqueTexture(label: string, sub: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#1a1410'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#c9a227'
  g.font = '600 24px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText(label, 128, 30)
  g.fillStyle = '#8a7663'
  g.font = '18px system-ui, sans-serif'
  g.fillText(sub, 128, 52)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function CampusModels({
  position,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  const plaques = useMemo(() => PLAQUES.map((p) => plaqueTexture(p.label, p.sub)), [])
  const models = [<Tower key="t" />, <PaperBag key="p" />, <TwistTower key="w" />]

  return (
    <group position={position} rotation={rotation}>
      {/* 台面 */}
      <mesh position={[0, 0.5, 0]} receiveShadow castShadow>
        <boxGeometry args={[2.5, 0.08, 0.7]} />
        <meshStandardMaterial color="#2c1d12" roughness={0.85} />
      </mesh>
      {/* 台脚 */}
      {[-1.05, 1.05].map((x) => (
        <mesh key={x} position={[x, 0.25, 0]} castShadow>
          <boxGeometry args={[0.14, 0.5, 0.5]} />
          <meshStandardMaterial color="#241710" roughness={0.9} />
        </mesh>
      ))}

      {models.map((m, i) => (
        <group key={i} position={[-0.82 + i * 0.82, 0.54, 0]}>
          {m}
          <mesh position={[0, -0.005, 0.3]} rotation={[-Math.PI / 2.6, 0, 0]}>
            <planeGeometry args={[0.42, 0.11]} />
            <meshBasicMaterial map={plaques[i]} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
