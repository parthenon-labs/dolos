import { useMemo } from 'react'
import * as THREE from 'three'
import { EMBLEM_ART_FRACTION, GlowEmblem } from './GlowEmblem'

/**
 * 点阵招牌墙 —— 向 UTS Building 11（工程与 IT 学院楼）那片穿孔铝板致敬。
 *
 * 真楼上那片孔是二进制编码，夜里由绿色 LED 从背后打亮。
 * 这里保留"一格一格的穿孔铝板 + 绿色背光"这个形式，
 * 点亮的格子拼出 UTS，其余熄灭当肌理，校徽单独放在左边。
 *
 * **亮格填满、板缝最后统一压一层。**
 * 每格留白 + 中间点白芯的做法凑近看就是一串互不相连的小方块，
 * 那是"很多颗 LED"，不是"一块背光的板"。真实的背光穿孔板是
 * 连续的光源在背后、网格盖在光上面 —— 这里按这个顺序画。
 */

/**
 * 网格密度。
 *
 * 第一版用 52×18，格子太大：凑近看每一格都是独立的小方块，
 * 笔画连不起来，读成一串珠子而不是一笔。这个分辨率下 S 尤其惨。
 * 现在细到 104×36，单格约 7 厘米 —— 和真穿孔板的孔距是一个量级，
 * 字的边缘阶梯也小到看不出来。
 */
const COLS = 104
const ROWS = 36

/** 字块占的列区间，左边留给校徽 */
const TEXT_FROM = 34
const TEXT_TO = 100
/** 字块占的行区间 */
const TEXT_TOP = 5
const TEXT_BOTTOM = 31

function litMask(): boolean[][] {
  const m = document.createElement('canvas')
  m.width = COLS
  m.height = ROWS
  const g = m.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, COLS, ROWS)

  /*
    36 行的分辨率下可以放心让字体来画字形了。
    上一版是 18 行，那个高度上 S 的曲线必然断成几截，只能手排点阵；
    行数翻倍之后这个问题自己就没了。
  */
  const size = TEXT_BOTTOM - TEXT_TOP
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `900 ${size}px "Helvetica Neue", Arial, sans-serif`
  const w = TEXT_TO - TEXT_FROM
  const measured = g.measureText('UTS').width
  g.save()
  g.translate((TEXT_FROM + TEXT_TO) / 2, (TEXT_TOP + TEXT_BOTTOM) / 2)
  g.scale(Math.min(1.25, (w * 0.96) / measured), 1)
  g.fillText('UTS', 0, 0)
  g.restore()

  const px = g.getImageData(0, 0, COLS, ROWS).data
  const out: boolean[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: boolean[] = []
    for (let c = 0; c < COLS; c++) row.push(px[(r * COLS + c) * 4] > 110)
    out.push(row)
  }
  return out
}

function makeTexture(): THREE.CanvasTexture {
  const lit = litMask()
  const cell = 12
  const c = document.createElement('canvas')
  c.width = COLS * cell
  c.height = ROWS * cell
  const g = c.getContext('2d')!

  g.fillStyle = '#101416'
  g.fillRect(0, 0, c.width, c.height)

  /*
    亮格**填满整格、不留内边距**，相邻的格子于是连成一片连续的笔画。
    上一版每格四周留白、中间还点一个白芯，凑近看就是一串互不相连的小方块 ——
    那是"很多颗 LED"，不是"一块背光的板"。

    真实的背光穿孔板是反过来的：光源在背后是连续的，
    网格是**盖在光上面的缝**。所以这里先铺连续的光，最后再统一压一层缝。
  */
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      if (!lit[r][col]) continue
      const x = col * cell
      const y = r * cell
      const t = r / ROWS
      // 上浅下深的渐变，让整块字有体积，而不是一片纯色
      g.fillStyle = `rgb(${Math.round(90 - t * 40)}, ${Math.round(255 - t * 60)}, ${Math.round(180 - t * 60)})`
      g.fillRect(x, y, cell, cell)
    }
  }

  // 板缝：整块板统一压一层，亮的暗的一视同仁 —— 这才是"同一块板"
  g.strokeStyle = 'rgba(0, 0, 0, 0.5)'
  g.lineWidth = Math.max(1, cell * 0.13)
  g.beginPath()
  for (let col = 0; col <= COLS; col++) {
    g.moveTo(col * cell, 0)
    g.lineTo(col * cell, c.height)
  }
  for (let r = 0; r <= ROWS; r++) {
    g.moveTo(0, r * cell)
    g.lineTo(c.width, r * cell)
  }
  g.stroke()

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

  /*
    校徽要和字**一样高、上下居中对齐**。

    两处换算不能省：
      1. 字块在网格里占 TEXT_ROW..TEXT_ROW+GLYPH_H 行，
         换成世界高度是 height × GLYPH_H / ROWS
      2. GlowEmblem 的 size 是**平面边长**，平面里还有一圈留白，
         图案只占 EMBLEM_ART_FRACTION。直接把 size 设成字高，
         画出来会明显偏小 —— 这就是上一版"logo 小了"的原因
  */
  const letterH = (height * (TEXT_BOTTOM - TEXT_TOP)) / ROWS
  const emblemSize = letterH / EMBLEM_ART_FRACTION
  // 字块中心在网格里的行位置 → 平面局部坐标（y 向上，中心为 0）
  const letterCenterY = height * (0.5 - (TEXT_TOP + TEXT_BOTTOM) / 2 / ROWS)
  // 校徽横向摆在字块左边那片空列的中间
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

      {/* 校徽保持矢量的清晰度，不进点阵 —— 它的细节在 52×18 的格子里会碎掉 */}
      <GlowEmblem
        color="#5cf2a4"
        size={emblemSize}
        position={[emblemX, letterCenterY, 0.09]}
        // 0.78：满亮度时 Bloom 会把盾牌糊成一整块绿，
        // 内部镂空的图案完全看不见 —— 而那个图案才是要给人看的东西
        opacity={0.78}
      />

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
