import { useMemo } from 'react'
import * as THREE from 'three'
import { GlowEmblem } from './GlowEmblem'

/**
 * 点阵招牌墙 —— 向 UTS Building 11（工程与 IT 学院楼）那片穿孔铝板致敬。
 *
 * 真楼上那片孔是二进制编码，夜里由绿色 LED 从背后打亮。
 * 这里保留"一格一格的穿孔铝板 + 绿色背光"这个形式，
 * 但**点亮的格子拼出 UTS 三个字**，而不是一片看不懂的噪点。
 *
 * 之前那版把二进制铺满整墙、再把校徽和字压在上面，两层叠在一起谁也看不清。
 * 现在只有一层内容：左边校徽，右边点阵字，其余格子熄灭当肌理。
 *
 * 哪些格子该亮不是手工排的 —— 把 "UTS" 画进一张 COLS×ROWS 的小画布，
 * 再逐格取样。**字形交给字体渲染，我只负责取样**，
 * 手排点阵改一次字号就要重排一遍。
 */

/** 网格密度。别调密：格子越小越容易被 mipmap 平均掉，远看会糊成一片 */
const COLS = 52
const ROWS = 18

/**
 * 字占的列区间，左边空出来给校徽。
 * 右边留 4 列余量 —— 顶到最后一列的话，S 的右半会贴着边框，
 * 看起来像被切掉了。
 */
const TEXT_FROM = 20
const TEXT_TO = 48

function litMask(): boolean[][] {
  const m = document.createElement('canvas')
  m.width = COLS
  m.height = ROWS
  const g = m.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, COLS, ROWS)

  const w = TEXT_TO - TEXT_FROM
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // 字号按行数来定，留出上下各两格余量
  const size = ROWS - 4
  g.font = `900 ${size}px "Helvetica Neue", Arial, sans-serif`
  // 横向压扁一点，让三个字母填满分配到的列宽
  const measured = g.measureText('UTS').width
  g.save()
  g.translate(TEXT_FROM + w / 2, ROWS / 2)
  // 横向拉伸封顶 1.3：再宽字形就明显变形，"U" 会看起来像个碗
  g.scale(Math.min(1.3, (w * 0.94) / measured), 1)
  g.fillText('UTS', 0, 0)
  g.restore()

  const px = g.getImageData(0, 0, COLS, ROWS).data
  const out: boolean[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: boolean[] = []
    for (let c = 0; c < COLS; c++) {
      // 覆盖过半才算这一格亮 —— 阈值低了字会糊，高了笔画会断
      row.push(px[(r * COLS + c) * 4] > 118)
    }
    out.push(row)
  }
  return out
}

function makeTexture(): THREE.CanvasTexture {
  const lit = litMask()
  const cell = 20
  const c = document.createElement('canvas')
  c.width = COLS * cell
  c.height = ROWS * cell
  const g = c.getContext('2d')!

  g.fillStyle = '#0d1012'
  g.fillRect(0, 0, c.width, c.height)

  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * cell
      const y = r * cell
      // 熄灭的格子也要画出来：没有它们就不是一块穿孔板，只是几个飘着的方块
      g.fillStyle = '#151a1d'
      g.fillRect(x + 1, y + 1, cell - 2, cell - 2)

      if (!lit[r][col]) continue

      // 亮格填满，不画小圆点 —— 小点在远处会被 mipmap 平均没
      const pad = cell * 0.12
      const grad = g.createLinearGradient(x, y, x, y + cell)
      grad.addColorStop(0, '#7dffc0')
      grad.addColorStop(1, '#25b877')
      g.fillStyle = grad
      g.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2)
      g.fillStyle = '#e6fff2'
      g.fillRect(x + cell * 0.36, y + cell * 0.36, cell * 0.28, cell * 0.28)
    }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export function SignWall({
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
  // 校徽摆在文字左边那片空列的中间
  const emblemX = -width / 2 + (width * (TEXT_FROM / 2)) / COLS

  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          emissive="#ffffff"
          emissiveIntensity={0.9}
          roughness={0.7}
          // metalness 必须低：没有环境贴图时金属面在 three 里几乎全黑，
          // 这块墙的亮度全靠 emissive
          metalness={0.15}
          toneMapped={false}
        />
      </mesh>

      {/* 校徽保持清晰的矢量感，不进点阵 —— 它的细节在 52×18 的格子里会碎掉 */}
      <GlowEmblem color="#5cf2a4" size={height * 0.72} position={[emblemX, 0, 0.09]} />

      {/* 铝板的「鳃」。只在最两侧留两道，中间让给内容 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * width) / 2 - s * 0.12, 0, 0.035]}>
          <boxGeometry args={[0.035, height * 0.96, 0.05]} />
          <meshStandardMaterial color="#2a3035" roughness={0.4} metalness={0.85} />
        </mesh>
      ))}

      {/*
        边框整体退到面板后面。前表面绝不能和面板共面 ——
        共面会 z-fighting，远处边框赢、整块墙变黑，而且它伪装成
        "贴图没生效"，查起来非常费劲（NOTES 里记过两次）。
      */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[width + 0.16, height + 0.16, 0.06]} />
        <meshStandardMaterial color="#0e1113" roughness={0.8} metalness={0.3} />
      </mesh>
    </group>
  )
}
