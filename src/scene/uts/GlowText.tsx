import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * 发光的字。用来把 UTS 铺满整个酒馆：墙上、天花板、地面、挑台边缘、楼梯踏面。
 *
 * 实现是一张**背景透明**的 canvas 贴图 + 加色混合，所以只有笔画发光，
 * 底完全看不见 —— 贴在任何颜色的表面上都不会出现一块方形的底板。
 * 靠已有的 Bloom 起辉，**不占光源预算**（见 LightBudget）。
 *
 * 两条从前面踩坑里带出来的纪律：
 *
 * 1. **笔画要粗。** 细笔画在远处会被 mipmap 平均掉，表现是"走近才看得见"。
 *    所以这里默认加了描边，并且字重拉满。
 * 2. **永远不要和贴附的表面共面。** 调用方必须给一点偏移（`offset`），
 *    共面会 z-fighting，而且伪装成"贴图没生效"，极难查。
 */

type GlowOpts = {
  text: string
  color: string
  /** 重复几次，用来做长条灯带 */
  repeat?: number
  /** 字间距倍率 */
  tracking?: number
  /** 斜体，霓虹招牌常用 */
  italic?: boolean
}

function makeTextTexture({
  text,
  color,
  repeat = 1,
  tracking = 1,
  italic = false,
}: GlowOpts): THREE.CanvasTexture {
  const label = Array.from({ length: repeat }, () => text).join('   ·   ')
  const fontPx = 128
  const c = document.createElement('canvas')
  const probe = c.getContext('2d')!
  const font = `${italic ? 'italic ' : ''}900 ${fontPx}px "Helvetica Neue", Arial, sans-serif`
  probe.font = font
  const spaced = tracking !== 1 ? label.split('').join(' '.repeat(Math.round(tracking))) : label
  /*
    留白必须大于最大模糊半径（下面用到 0.55 × fontPx）。
    留窄了，光晕会在贴图边缘被硬切，画面上就是发光字周围浮着一个方框 ——
    而且那个方框只在暗背景上看得见，白天调的时候根本发现不了。
  */
  const pad = Math.ceil(fontPx * 0.9)
  const w = Math.ceil(probe.measureText(spaced).width) + pad * 2
  c.width = Math.max(64, w)
  c.height = Math.ceil(fontPx + pad * 2)

  const g = c.getContext('2d')!
  g.clearRect(0, 0, c.width, c.height)
  g.font = font
  g.textAlign = 'center'
  g.textBaseline = 'middle'

  const cx = c.width / 2
  const cy = c.height / 2

  // 外发光：由粗到细叠几层，模拟霓虹管周围的光晕
  g.shadowColor = color
  for (const [blur, alpha] of [
    [fontPx * 0.55, 0.5],
    [fontPx * 0.3, 0.7],
    [fontPx * 0.12, 0.95],
  ] as const) {
    g.shadowBlur = blur
    g.globalAlpha = alpha
    g.fillStyle = color
    g.fillText(spaced, cx, cy)
  }

  // 管芯：接近白色，霓虹灯管的中心总是过曝的
  g.shadowBlur = fontPx * 0.08
  g.globalAlpha = 1
  g.fillStyle = '#ffffff'
  g.lineWidth = fontPx * 0.06
  g.strokeStyle = color
  g.strokeText(spaced, cx, cy)
  g.fillText(spaced, cx, cy)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export function GlowText({
  text = 'UTS',
  color = '#3ef2a0',
  width,
  position,
  rotation = [0, 0, 0],
  repeat = 1,
  tracking = 1,
  italic = false,
  opacity = 1,
}: {
  text?: string
  color?: string
  /** 世界尺寸的宽度（米）。高度按贴图比例自动算 */
  width: number
  position: [number, number, number]
  rotation?: [number, number, number]
  repeat?: number
  tracking?: number
  italic?: boolean
  opacity?: number
}) {
  const tex = useMemo(
    () => makeTextTexture({ text, color, repeat, tracking, italic }),
    [text, color, repeat, tracking, italic],
  )
  const img = tex.image as HTMLCanvasElement
  const height = (width * img.height) / img.width

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={opacity}
        // 加色混合：只有笔画会亮，底完全透明，贴在任何表面上都不会露出方框
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
