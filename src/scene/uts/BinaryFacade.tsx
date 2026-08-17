import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * 「刨丝器」幕墙 —— 向 UTS Building 11（工程与 IT 学院楼）致敬。
 *
 * 那栋楼的铝板上有一片穿孔，图案不是装饰：它是
 * "University of Technology Sydney Faculty of Engineering and Information Technology"
 * 这句话的**二进制编码**，夜里由绿色 LED 从背后打亮。
 *
 * 所以这里的每一个亮点都是真的一位。下面那串二进制不是随手编的，
 * 是把同一句话按 8 位 ASCII 展开的结果 —— 有人真的去数的话，数得出来。
 *
 * 实现用一张 CanvasTexture 而不是上千个 instanced mesh：
 * 一次 draw call，且亮点位置可以精确到像素。
 * 靠 emissive + 已有的 Bloom 发光，**不额外占光源预算**（见 LightBudget）。
 */

const PHRASE =
  'University of Technology Sydney Faculty of Engineering and Information Technology'

/** 按 8 位 ASCII 展开成 0/1 数组 */
function toBits(s: string): number[] {
  const bits: number[] = []
  for (const ch of s) {
    const code = ch.charCodeAt(0) & 0xff
    for (let i = 7; i >= 0; i--) bits.push((code >> i) & 1)
  }
  return bits
}

/**
 * 网格密度。
 *
 * **别调密。** 第一版用 72×26，结果远看整块墙是黑的、贴到脸上才发光 ——
 * 原因是 mipmap：远处贴图被逐级缩小，细小的亮点和深色底被平均掉了。
 * 网格越密，每个亮点占的像素越少，越早被平均没。
 *
 * 48×16 配合更大的孔径，能让「平均之后仍然是亮的」，
 * 于是从大厅另一头看过去它还是一面发光的墙。
 */
const COLS = 48
const ROWS = 16

function makeTexture(): THREE.CanvasTexture {
  const bits = toBits(PHRASE)
  const cell = 20
  const c = document.createElement('canvas')
  c.width = COLS * cell
  c.height = ROWS * cell
  const g = c.getContext('2d')!

  // 底：深色阳极氧化铝
  g.fillStyle = '#14171a'
  g.fillRect(0, 0, c.width, c.height)

  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * cell
      const y = r * cell
      // 板缝：每块板之间留一道暗线，远看才有"一片一片"的质感
      g.fillStyle = '#0d1012'
      g.fillRect(x, y, cell, cell)
      g.fillStyle = '#161a1e'
      g.fillRect(x + 0.5, y + 0.5, cell - 1.5, cell - 1.5)

      const bit = bits[(r * COLS + col) % bits.length]
      if (!bit) continue

      /*
        亮起的格子**填满**，而不是画一个小圆点。

        小圆点在远处会被 mipmap 平均掉 —— 第一版就是这么变成一面黑墙的：
        贴到脸上发光，退开三米就没了。填满的格子平均之后仍然是绿的，
        所以从大厅另一头看它还是一面发光的墙，凑近才分辨出一格一格。
        真楼上那片穿孔铝板在远处也正是这个观感。
      */
      const pad = cell * 0.13
      const grad = g.createLinearGradient(x, y, x, y + cell)
      grad.addColorStop(0, '#5cf2a4')
      grad.addColorStop(1, '#1fa868')
      g.fillStyle = grad
      g.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2)
      // 中间一点更亮的芯，模拟背后的 LED
      g.fillStyle = '#d8ffe9'
      g.fillRect(x + cell * 0.38, y + cell * 0.38, cell * 0.24, cell * 0.24)
    }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export function BinaryFacade({
  position,
  rotation = [0, 0, 0],
  width = 7.2,
  height = 2.6,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  width?: number
  height?: number
}) {
  const tex = useMemo(makeTexture, [])

  return (
    <group position={position} rotation={rotation}>
      {/* 面板本体 */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          emissive="#ffffff"
          emissiveIntensity={0.55}
          roughness={0.7}
          // metalness 必须低。没有环境贴图时金属面在 three 里几乎全黑，
          // 而这块墙的亮度全靠 emissive —— 金属度一高，底色就死了
          metalness={0.15}
          toneMapped={false}
        />
      </mesh>

      {/* 铝板的「鳃」—— 真楼上每块板都折出一道棱，让平面产生方向感 */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh
          key={i}
          position={[-width / 2 + (width / 9) * (i + 0.5), 0, 0.035]}
          rotation={[0, 0, 0.06]}
        >
          <boxGeometry args={[0.035, height * 0.96, 0.05]} />
          <meshStandardMaterial color="#2a3035" roughness={0.4} metalness={0.85} />
        </mesh>
      ))}

      {/*
        边框。**必须整体退到面板后面**，不能让它的前表面和面板共面。

        第一版写的是 position z = -0.03、厚 0.06 —— 前表面正好落在 z = 0，
        和面板同一个平面。远处深度精度不够时边框赢，整块墙就是黑的；
        贴到脸上精度够了才轮到面板显示。表现是"近看有、退开就没了"，
        非常像是材质或贴图的问题，其实是 z-fighting。
        （NOTES 里楼梯那节记过同一条坑，这里又踩了一次。）
      */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[width + 0.16, height + 0.16, 0.06]} />
        <meshStandardMaterial color="#0e1113" roughness={0.8} metalness={0.3} />
      </mesh>
    </group>
  )
}

/** 导出给调试用：这块墙上一共写了多少位 */
export const FACADE_BITS = toBits(PHRASE).length
export const FACADE_PHRASE = PHRASE
