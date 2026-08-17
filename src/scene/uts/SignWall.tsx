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
 * **字形是手排的点阵，不是把字体渲染下来再阈值化。**
 * 试过取样：18 行的分辨率下 S 的曲线必然断成几截，
 * 换字号、换阈值都救不回来 —— 低分辨率点阵里，
 * "让字体来决定形状"这个偷懒的做法本身就是错的。
 * 三个字母手排一次，字形从此确定。
 */

/** 网格密度。别调密：格子越小越容易被 mipmap 平均掉，远看会糊成一片 */
const COLS = 52
const ROWS = 18

/**
 * 手排的 9×11 点阵字形。`#` = 亮。
 *
 * 笔画统一 2 格宽（T 的竖笔 3 格，否则在 9 格宽里看着太细）。
 * S 的关键是**上半只留左边、下半只留右边**，中间横笔把两段接起来 ——
 * 两边都画就会变成 8。
 */
const GLYPHS: Record<string, string[]> = {
  U: [
    '##.....##',
    '##.....##',
    '##.....##',
    '##.....##',
    '##.....##',
    '##.....##',
    '##.....##',
    '##.....##',
    '##.....##',
    '.#######.',
    '..#####..',
  ],
  T: [
    '#########',
    '#########',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
  ],
  S: [
    '.#######.',
    '##.....##',
    '##.......',
    '##.......',
    '##.......',
    '.#######.',
    '.......##',
    '.......##',
    '.......##',
    '##.....##',
    '.#######.',
  ],
}

const GLYPH_W = 9
const GLYPH_H = 11
const GAP = 3
const WORD = 'UTS'

/**
 * 字块在网格里的位置：左边留给校徽，右边留余量。
 * 字块宽 33 列（3×9 + 2×3），起 17 结 49，右边空 2 列 ——
 * 顶到最后一列会紧贴边框上那道「鳃」，看起来像被切了。
 */
const TEXT_COL = 17
const TEXT_ROW = Math.floor((ROWS - GLYPH_H) / 2)

function litMask(): boolean[][] {
  const lit = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false))
  let col = TEXT_COL
  for (const ch of WORD) {
    const g = GLYPHS[ch]
    for (let r = 0; r < GLYPH_H; r++) {
      for (let c = 0; c < GLYPH_W; c++) {
        if (g[r][c] === '#') lit[TEXT_ROW + r][col + c] = true
      }
    }
    col += GLYPH_W + GAP
  }
  return lit
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
      const pad = cell * 0.1
      const grad = g.createLinearGradient(x, y, x, y + cell)
      grad.addColorStop(0, '#7dffc0')
      grad.addColorStop(1, '#25b877')
      g.fillStyle = grad
      g.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2)
      g.fillStyle = '#e6fff2'
      g.fillRect(x + cell * 0.34, y + cell * 0.34, cell * 0.32, cell * 0.32)
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

  /*
    校徽要和字**一样高、上下居中对齐**。

    两处换算不能省：
      1. 字块在网格里占 TEXT_ROW..TEXT_ROW+GLYPH_H 行，
         换成世界高度是 height × GLYPH_H / ROWS
      2. GlowEmblem 的 size 是**平面边长**，平面里还有一圈留白，
         图案只占 EMBLEM_ART_FRACTION。直接把 size 设成字高，
         画出来会明显偏小 —— 这就是上一版"logo 小了"的原因
  */
  const letterH = (height * GLYPH_H) / ROWS
  const emblemSize = letterH / EMBLEM_ART_FRACTION
  // 字块中心在网格里的行位置 → 平面局部坐标（y 向上，中心为 0）
  const letterCenterY = height * (0.5 - (TEXT_ROW + GLYPH_H / 2) / ROWS)
  // 校徽横向摆在字块左边那片空列的中间
  const emblemX = -width / 2 + (width * (TEXT_COL / 2)) / COLS

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
