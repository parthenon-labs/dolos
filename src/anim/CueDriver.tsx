import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useCues } from './cues'
import { cuesFor } from './gameCues'
import type { GameEvent } from '../game/types'

/**
 * 每帧推进动画队列。
 *
 * 单独一个组件是因为**队列必须只有一个推进者** —— 两处都在 tick 的话
 * 动画会跑两倍速，而且这类 bug 只在特定页面组合下出现，极难复现。
 * 和相机只有一个所有者是同一条纪律。
 */
export function CueDriver() {
  const tick = useCues((s) => s.tick)
  useFrame((_, dt) => tick(Math.min(dt, 0.05)))
  return null
}

/**
 * 事件源 → 动画队列的桥。
 *
 * **事件一到就立刻入队，不等动画播完**：网络层不该被 UI 帧率绑架。
 * 队列自己保证顺序，长了会自动加速，堆到阈值直接瞬时结算 ——
 * 这正是断线重连一次性重放几十个事件时需要的行为。
 */
export function useEventBridge(events: GameEvent[], playerCount: number) {
  const enqueue = useCues((s) => s.enqueue)
  // 只处理新增的部分，避免重复入队
  const consumed = useRef(0)

  useEffect(() => {
    if (events.length < consumed.current) {
      // 事件流被换掉了（换局 / 重连），重来
      consumed.current = 0
      useCues.getState().clear()
    }
    for (let i = consumed.current; i < events.length; i++) {
      const cues = cuesFor(events[i], playerCount)
      if (cues.length > 0) enqueue(...cues)
    }
    consumed.current = events.length
  }, [events, playerCount, enqueue])
}
