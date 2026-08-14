/**
 * 假音量驱动 —— 零配置就能看到效果，不用开麦克风。
 *
 * 模拟真人说话的包络：一个人连续说 2~6 秒，中间有音节起伏和短停顿，
 * 说完之后停 0.4~1.2 秒再换下一个人。上线前整个文件删掉即可。
 */
import { NUM_SEATS, setAmp } from './amplitudes'

type Phase = { speaker: number; until: number }

export function startFakeDriver(): () => void {
  let raf = 0
  const t0 = performance.now()
  let phase: Phase = { speaker: 1, until: 2500 }
  // 每个座位一个独立相位，避免所有人音节同步（那样会很假）
  const seed = Array.from({ length: NUM_SEATS }, () => Math.random() * 100)
  // 平滑后的音量，模拟 AnalyserNode 的时间常数
  const smooth = new Float32Array(NUM_SEATS)

  const tick = () => {
    const t = (performance.now() - t0) / 1000
    const ms = t * 1000

    if (ms > phase.until) {
      const speaking = phase.speaker >= 0
      if (speaking) {
        // 说完了，静默一小会儿
        phase = { speaker: -1, until: ms + 400 + Math.random() * 800 }
      } else {
        // 换个人开口。座位 0 是本地玩家，也让他偶尔"说话"
        phase = {
          speaker: Math.floor(Math.random() * NUM_SEATS),
          until: ms + 2000 + Math.random() * 4000,
        }
      }
    }

    for (let i = 0; i < NUM_SEATS; i++) {
      let target = 0
      if (i === phase.speaker) {
        const s = seed[i]
        // 三个不同频率的正弦叠加 → 类似音节的起伏
        const syllable =
          0.5 + 0.5 * Math.sin(t * 11 + s) * Math.sin(t * 3.7 + s * 1.7)
        // 偶尔的换气停顿
        const breath = Math.sin(t * 1.3 + s) > -0.85 ? 1 : 0
        target = Math.max(0, syllable) * breath
      }
      // 攻击快、释放慢 —— 和真实 AnalyserNode 的观感一致
      const k = target > smooth[i] ? 0.35 : 0.12
      smooth[i] += (target - smooth[i]) * k
      setAmp(i, smooth[i])
    }

    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}
