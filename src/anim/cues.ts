import { create } from 'zustand'

/**
 * 动画编排层。
 *
 * 这一层要解决的是整个前端最容易做错的问题：
 * **服务端事件到了，但上一个动画还没播完怎么办。**
 *
 * 三种常见的错误做法：
 *   直接改状态  → 动画播到一半被抢走，画面跳变
 *   丢掉新事件  → 状态和服务端不一致，之后全错
 *   等动画播完再收 → 网络层被 UI 帧率绑架
 *
 * 正确做法是把"逻辑状态"和"呈现状态"分开：
 * 事件一到立刻进入队列（永不丢弃、永不打断），呈现状态由队列按顺序推进。
 * **画面允许落后于真相，但不允许和真相冲突。**
 */

export type Cue = {
  /** 调试用的名字，会出现在开发面板里 */
  readonly label: string
  /** 时长（秒）。0 表示瞬时，用于纯状态跳变 */
  readonly duration: number
  /** 进入时调用一次 */
  readonly onStart?: () => void
  /** 每帧调用，t 是 0→1 的归一化进度 */
  readonly onUpdate?: (t: number) => void
  /** 结束时调用一次。**必须在这里落定最终状态** —— 见下方说明 */
  readonly onEnd?: () => void
}

type CueState = {
  queue: Cue[]
  current: Cue | null
  elapsed: number
  /**
   * 追帧倍率。重连时会一次性重放几十个事件，
   * 逐个原速播完要几分钟 —— 队列越长播得越快，堆到阈值就直接瞬时结算。
   */
  speed: number
  /** 已经播完的 cue 总数，测试和调试用 */
  completed: number

  enqueue: (...cues: Cue[]) => void
  /** 每帧推进。返回本帧是否有 cue 在播 */
  tick: (dt: number) => void
  /** 立刻结算所有排队的 cue（跳过动画，直接到最终状态） */
  flush: () => void
  clear: () => void
}

/** 队列长到这个数就不再逐个播，直接瞬时结算 */
const FLUSH_THRESHOLD = 12
/** 队列开始变长时的加速曲线 */
function speedFor(queueLength: number): number {
  if (queueLength <= 1) return 1
  if (queueLength >= FLUSH_THRESHOLD) return Number.POSITIVE_INFINITY
  // 2 个排队 → 1.3 倍，8 个 → 3 倍左右
  return 1 + (queueLength - 1) * 0.28
}

export const useCues = create<CueState>((set, get) => ({
  queue: [],
  current: null,
  elapsed: 0,
  speed: 1,
  completed: 0,

  enqueue: (...cues) => {
    if (cues.length === 0) return
    set((s) => ({ queue: [...s.queue, ...cues] }))
  },

  tick: (dt) => {
    const s = get()
    let { current, elapsed, completed } = s
    let queue = s.queue
    // 一帧内可能播完多个瞬时 cue，所以是循环而不是 if
    let guard = 0

    while (guard++ < 64) {
      if (!current) {
        if (queue.length === 0) break
        current = queue[0]
        queue = queue.slice(1)
        elapsed = 0
        current.onStart?.()
        // 瞬时 cue 直接结算，不占一帧
        if (current.duration <= 0) {
          current.onEnd?.()
          completed++
          current = null
          continue
        }
      }

      const speed = speedFor(queue.length)
      if (!Number.isFinite(speed)) {
        // 积压太多，剩下的全部瞬时结算
        current.onUpdate?.(1)
        current.onEnd?.()
        completed++
        current = null
        continue
      }

      elapsed += dt * speed
      const t = Math.min(1, elapsed / current.duration)
      current.onUpdate?.(t)
      if (t < 1) break

      current.onEnd?.()
      completed++
      current = null
    }

    set({ queue, current, elapsed, completed, speed: speedFor(queue.length) })
  },

  flush: () => {
    const { queue, current } = get()
    let n = 0
    if (current) {
      current.onUpdate?.(1)
      current.onEnd?.()
      n++
    }
    for (const c of queue) {
      c.onStart?.()
      c.onUpdate?.(1)
      c.onEnd?.()
      n++
    }
    set((s) => ({
      queue: [],
      current: null,
      elapsed: 0,
      speed: 1,
      completed: s.completed + n,
    }))
  },

  clear: () => set({ queue: [], current: null, elapsed: 0, speed: 1 }),
}))

/* ---------------- 构造 cue 的小工具 ---------------- */

/**
 * 瞬时状态跳变。没有动画，但仍然**按顺序**发生 ——
 * 这是它存在的意义：和有动画的 cue 混在一条队列里，顺序才不会乱。
 */
export const instant = (label: string, apply: () => void): Cue => ({
  label,
  duration: 0,
  onEnd: apply,
})

/** 纯等待，用来给节奏留白。刺杀前的那一下停顿全靠它 */
export const wait = (label: string, duration: number): Cue => ({
  label,
  duration,
})

/** 把一个 0→1 的插值包成 cue */
export const tween = (
  label: string,
  duration: number,
  onUpdate: (t: number) => void,
  onEnd?: () => void,
): Cue => ({ label, duration, onUpdate, onEnd })

/* ---------------- 缓动 ---------------- */

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
/** 轻微回弹，发牌落桌时用 */
export const easeOutBack = (t: number) => {
  const c = 1.70158
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}
