import * as THREE from 'three'

/**
 * 角色的**动作词汇表** —— 游戏逻辑和美术之间唯一的契约。
 *
 * 关键判断：上层永远不许碰 mesh、骨骼、材质。它只会说
 * "3 号在说话"、"2 号指向 4 号"、"发牌了"。
 * 至于这动作是靠程序化几何体摆出来的，还是播一段 glTF 里的骨骼动画，
 * 由实现自己决定。
 *
 * 这样换模型时改动是**替换一个实现**，不是满项目找 rotation.x。
 * 反过来（先做模型再补接口）是单人 3D 项目最常见的死法：
 * 美术一改，代码全烂。
 */

/** 一次性的手势。持续状态（说话、呼吸）不走这里，走 RigState */
export type Gesture =
  /** 指向某人 —— 提名、指认 */
  | 'point'
  /** 前倾 —— 发言开始、注意力集中 */
  | 'lean'
  /** 摊手 —— 否认、无奈 */
  | 'shrug'
  /** 出牌 —— 手伸向桌心 */
  | 'place'
  /** 靠回椅背 —— 发言结束、放弃 */
  | 'recline'

/** 每帧写进来的连续状态。不走 React —— 每帧 setState 会炸性能 */
export type RigState = {
  /** 说话音量 0..1，驱动点头和面具自发光 */
  amp: number
  /** 头看向哪（世界坐标）。null = 看桌心 */
  lookAt: THREE.Vector3 | null
  /** 坐着还是站着。大厅里走动的人是 standing */
  posture: 'seated' | 'standing'
  /** 移动速度，站姿时驱动走路循环 */
  speed: number
}

export function makeRigState(): RigState {
  return { amp: 0, lookAt: null, posture: 'seated', speed: 0 }
}

/**
 * 一个角色实现必须提供的东西。
 * 程序化角色和 glTF 角色都实现它，上层分不出区别。
 */
export type RigHandle = {
  /** 触发一次手势。实现可以忽略自己做不出的手势 —— 缺动作不该崩 */
  play: (g: Gesture) => void
  /** 每帧调用。dt 已 clamp 过 */
  update: (state: RigState, dt: number) => void
}

/* ---------------- 共享的动作数学 ---------------- */

/**
 * 手势的时间包络：0 → 1 → 0。
 * 出手快、收手慢，符合真实肢体：发力短促，回位松弛。
 */
export function gestureEnvelope(t: number): number {
  if (t <= 0 || t >= 1) return 0
  const attack = 0.22
  if (t < attack) {
    const k = t / attack
    return 1 - (1 - k) * (1 - k) // easeOutQuad
  }
  const k = (t - attack) / (1 - attack)
  return (1 - k) * (1 - k) // easeInQuad，回位更慢
}

/** 每个手势的时长（秒）。指认要够久让人看清，出牌要干脆 */
export const GESTURE_DURATION: Record<Gesture, number> = {
  point: 1.4,
  lean: 1.1,
  shrug: 1.0,
  place: 0.8,
  recline: 1.2,
}

/**
 * 说话时的头部运动。
 *
 * 不是随机抖动 —— 用两个不同频率的正弦叠加，
 * 快的那层是音节节奏，慢的那层是语句起伏。
 * 单一频率看起来像机械玩具。
 */
export function speechMotion(t: number, amp: number) {
  const syllable = Math.sin(t * 13) * 0.022
  const phrase = Math.sin(t * 2.3) * 0.012
  return {
    bob: (syllable + phrase) * amp,
    nod: Math.sin(t * 9.5) * amp * 0.05,
    tilt: Math.sin(t * 5) * amp * 0.04,
  }
}

/** 常态呼吸。极轻微，但没有它角色就是雕像 */
export function breathe(t: number): number {
  return Math.sin(t * 1.15) * 0.006
}

/**
 * 头部朝向一个世界坐标，但**限制在人类颈部能转的范围内**。
 *
 * 不加限制的话，看向身后的人会把头拧 180 度 —— 恐怖谷的经典触发点。
 * 超出范围时头转到极限，剩下的交给身体（如果实现支持转身）。
 */
const YAW_LIMIT = Math.PI * 0.42 // ±75°
const PITCH_LIMIT = Math.PI * 0.22 // ±40°

const _local = new THREE.Vector3()

export function aimHead(
  head: THREE.Object3D,
  target: THREE.Vector3 | null,
  parent: THREE.Object3D,
  dt: number,
): { yaw: number; pitch: number } {
  if (!target) return { yaw: 0, pitch: 0 }
  _local.copy(target)
  parent.worldToLocal(_local)
  // 角色朝 -Z（朝桌心），所以 atan2 的参数按这个基准来
  const yaw = THREE.MathUtils.clamp(Math.atan2(-_local.x, -_local.z), -YAW_LIMIT, YAW_LIMIT)
  const dist = Math.hypot(_local.x, _local.z)
  const pitch = THREE.MathUtils.clamp(-Math.atan2(_local.y, dist), -PITCH_LIMIT, PITCH_LIMIT)
  void head
  void dt
  return { yaw, pitch }
}
