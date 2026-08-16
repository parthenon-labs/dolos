import { useEffect, useState } from 'react'
import { RuleBot } from '../game/bots'
import { runGame } from '../game/runner'
import type { GameEvent } from '../game/types'

/**
 * 开发期的事件源：本地跑一整局规则 bot 对局，然后**按固定间隔**把事件喂给动画层，
 * 模拟服务端推送。
 *
 * 间隔刻意设得比动画总时长短 —— 这样队列会真的积压，
 * 加速和瞬时结算的逻辑在开发时就能看到，而不是等上线遇到网络抖动才发现。
 *
 * 接了 WebSocket 之后整个文件删掉，`useEventBridge` 那边一行都不用改。
 */
export function useDemoGame(enabled: boolean, playerCount = 5, intervalMs = 1600) {
  const [events, setEvents] = useState<GameEvent[]>([])

  useEffect(() => {
    if (!enabled) {
      setEvents([])
      return
    }
    let timer: ReturnType<typeof setInterval> | undefined
    let cancelled = false

    ;(async () => {
      const r = await runGame(
        {
          playerCount,
          optionalRoles: ['percival', 'morgana'],
          seed: Date.now() % 9973,
        },
        (roles) => roles.map((_, i) => new RuleBot(`P${i}`, 900 + i)),
      )
      if (cancelled) return

      let i = 0
      timer = setInterval(() => {
        if (i >= r.events.length) {
          clearInterval(timer)
          return
        }
        // 累积推送，和真实服务端一样：客户端拿到的是"到目前为止的全部事件"
        setEvents(r.events.slice(0, ++i))
      }, intervalMs)
    })()

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [enabled, playerCount, intervalMs])

  return events
}
