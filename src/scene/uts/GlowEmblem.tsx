import { useEffect, useState } from 'react'
import * as THREE from 'three'
import emblemUrl from './emblem.png'

/**
 * 发光的徽记。和 GlowText 是同一套处理，只是形状来自一张图而不是文字。
 *
 * 源图是白底 + 黑色盾形 + 盾内白色图案。这里把它变成
 * **发光的盾牌、内部图案镂空** —— 像一块背光灯箱。
 * 反过来（只让白色图案发光）会得到一堆互不相连的碎片，远看认不出是什么。
 *
 * 透明度算法：`alpha = 原alpha × (1 - 亮度)`。
 * 这样不管源图的背景是白色还是已经透明，结果都一样 ——
 * 不用先去确认源图到底是哪种，也就少了一个会静默出错的前提。
 *
 * 和场景里其他发光件一样：加色混合、不占光源预算、靠已有的 Bloom 起辉。
 */

const CACHE = new Map<string, THREE.CanvasTexture>()

function buildTexture(img: HTMLImageElement, color: string): THREE.CanvasTexture {
  const key = color
  const hit = CACHE.get(key)
  if (hit) return hit

  const size = 512
  // 留白必须大于最大模糊半径，否则光晕会在贴图边缘被硬切，
  // 表现是徽记周围浮着一个方框（见 GlowText 里同一条注释）
  const pad = Math.round(size * 0.22)
  const w = size + pad * 2

  // 第一步：把源图变成"盾形不透明、其余全透明"，并染成发光色
  const a = document.createElement('canvas')
  a.width = size
  a.height = size
  const ga = a.getContext('2d')!
  ga.drawImage(img, 0, 0, size, size)
  const data = ga.getImageData(0, 0, size, size)
  const px = data.data
  const c = new THREE.Color(color)
  const cr = Math.round(c.r * 255)
  const cg = Math.round(c.g * 255)
  const cb = Math.round(c.b * 255)
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255
    const alpha = (px[i + 3] / 255) * (1 - lum)
    px[i] = cr
    px[i + 1] = cg
    px[i + 2] = cb
    px[i + 3] = Math.round(alpha * 255)
  }
  ga.putImageData(data, 0, 0)

  // 第二步：在带留白的画布上叠几层光晕，再把清晰的一层压在最上面
  const b = document.createElement('canvas')
  b.width = w
  b.height = w
  const gb = b.getContext('2d')!
  gb.shadowColor = color
  for (const [blur, alpha] of [
    [size * 0.16, 0.55],
    [size * 0.07, 0.75],
  ] as const) {
    gb.shadowBlur = blur
    gb.globalAlpha = alpha
    gb.drawImage(a, pad, pad)
  }
  gb.shadowBlur = 0
  gb.globalAlpha = 1
  gb.drawImage(a, pad, pad)

  const tex = new THREE.CanvasTexture(b)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  CACHE.set(key, tex)
  return tex
}

export function GlowEmblem({
  color = '#3ef2a0',
  size,
  position,
  rotation = [0, 0, 0],
  opacity = 1,
}: {
  color?: string
  /** 世界尺寸（米），正方形 */
  size: number
  position: [number, number, number]
  rotation?: [number, number, number]
  opacity?: number
}) {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    let alive = true
    const img = new Image()
    img.src = emblemUrl
    const done = () => {
      if (alive) setTex(buildTexture(img, color))
    }
    if (img.complete) done()
    else img.onload = done
    return () => {
      alive = false
    }
  }, [color])

  // 图还没解码完就什么都不画。徽记是装饰，晚一帧出现没有代价
  if (!tex) return null

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
