/**
 * 假音量驱动 —— 零配置就能看到效果，不用开麦克风。
 *
 * 模拟真人说话的包络：一个人连续说 2~6 秒，中间有音节起伏和短停顿，
 * 说完之后停 0.4~1.2 秒再换下一个人。每张桌子**独立**排班，
 * 因为大厅里几桌是同时在聊的。上线前整个文件删掉即可。
 */
import { TABLES } from '../scene/hallLayout'
import { ampKey, setAmpByKey } from './amplitudes'

type TableSchedule = {
  tableId: string
  seats: number
  speaker: number
  until: number
  seed: number[]
  smooth: number[]
}

export function startFakeDriver(): () => void {
  let raf = 0
  const t0 = performance.now()

  const schedules: TableSchedule[] = TABLES.map((t, ti) => ({
    tableId: t.id,
    seats: t.seats,
    speaker: ti % t.seats,
    // 错开各桌的初始节奏，否则全场同时开口同时安静，非常假
    until: 1500 + ti * 900,
    seed: Array.from({ length: t.seats }, () => Math.random() * 100),
    smooth: Array.from({ length: t.seats }, () => 0),
  }))

  const tick = () => {
    const t = (performance.now() - t0) / 1000
    const ms = t * 1000

    for (const sc of schedules) {
      if (ms > sc.until) {
        if (sc.speaker >= 0) {
          sc.speaker = -1
          sc.until = ms + 400 + Math.random() * 800
        } else {
          sc.speaker = Math.floor(Math.random() * sc.seats)
          sc.until = ms + 2000 + Math.random() * 4000
        }
      }

      for (let i = 0; i < sc.seats; i++) {
        let target = 0
        if (i === sc.speaker) {
          const s = sc.seed[i]
          // 三个不同频率的正弦叠加 → 类似音节的起伏
          const syllable =
            0.5 + 0.5 * Math.sin(t * 11 + s) * Math.sin(t * 3.7 + s * 1.7)
          // 偶尔的换气停顿
          const breath = Math.sin(t * 1.3 + s) > -0.85 ? 1 : 0
          target = Math.max(0, syllable) * breath
        }
        // 攻击快、释放慢 —— 和真实 AnalyserNode 的观感一致
        const k = target > sc.smooth[i] ? 0.35 : 0.12
        sc.smooth[i] += (target - sc.smooth[i]) * k
        setAmpByKey(ampKey(sc.tableId, i), sc.smooth[i])
      }
    }

    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}
