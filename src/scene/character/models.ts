import { useGLTF } from '@react-three/drei'

/**
 * 角色模型清单 + 加载配置。
 *
 * **现在这个清单是空的，这是有意的。** 项目里没有任何美术资源，
 * 也不该塞来路不明的模型进仓库 —— 授权问题比省下的那点时间贵得多。
 *
 * 想接模型时只要两步：
 *   1. 把 .glb 放进 public/models/
 *   2. 在 MODELS 里加一行
 * 场景代码一个字都不用动。清单为空时全体退回程序化角色。
 *
 * 找免费资源的方向（都允许商用，看清各自的署名要求）：
 *   Quaternius / Kenney —— 低多边形，风格和现在的几何体接近
 *   Mixamo             —— 骨骼动画库，可以只取动作套到自己的模型上
 */

export type ModelDef = {
  /** public 下的路径 */
  url: string
  /** 整体缩放。glTF 的单位没有统一约定，几乎每个模型都要调 */
  scale: number
  /** 模型自身朝向和我们的约定（朝 -Z）差多少弧度 */
  yawOffset: number
  /**
   * 动画片段名映射：我们的手势 → glTF 里的 clip 名。
   * Mixamo 导出的 clip 常叫 "mixamo.com" 或 "Armature|Idle"，
   * 所以匹配是模糊的，见 findClip。
   */
  clips: Partial<Record<string, string>>
}

/** 空 = 全部用程序化角色。加模型时往这里加 */
export const MODELS: Record<string, ModelDef> = {}

export const hasModels = () => Object.keys(MODELS).length > 0

/**
 * 按名字模糊找 clip。
 *
 * glTF 里的 clip 名极不规范：可能是 "Idle"、"Armature|Idle"、
 * "mixamo.com"、"CharacterArmature|Idle"。精确匹配几乎必然失败，
 * 而失败的表现是"模型加载了但一动不动"—— 很难查。
 * 所以这里做大小写无关的包含匹配，找不到就返回 null 让上层退回程序化动作。
 */
export function findClip(names: string[], want: string): string | null {
  const w = want.toLowerCase()
  const exact = names.find((n) => n.toLowerCase() === w)
  if (exact) return exact
  const partial = names.find((n) => n.toLowerCase().includes(w))
  return partial ?? null
}

/**
 * 预加载。
 *
 * 必须在进大厅**之前**做完：坐下的瞬间才开始下载模型的话，
 * 玩家会看着空椅子等好几秒 —— 那是整个体验里最糟的一刻，
 * 因为它正好发生在期待值最高的时候。
 */
export function preloadModels() {
  for (const m of Object.values(MODELS)) useGLTF.preload(m.url)
}

/**
 * 按座位挑模型。同一桌不能撞脸，所以按座位号轮换而不是随机 ——
 * 随机会有生日悖论，5 个人里撞脸的概率意外地高。
 */
export function modelForSeat(seat: number): ModelDef | null {
  const keys = Object.keys(MODELS)
  if (keys.length === 0) return null
  return MODELS[keys[seat % keys.length]]
}
