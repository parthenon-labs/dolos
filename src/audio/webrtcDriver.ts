/**
 * 真实音轨驱动 —— 接 WebRTC 时用这个替换 fakeDriver。
 *
 * 用法（在你的 SFU / peer 连接拿到远端 track 之后）：
 *
 *   import { attachStream, startWebRTCDriver } from './audio/webrtcDriver'
 *   const stop = startWebRTCDriver()
 *   pc.ontrack = (e) => attachStream(seatOfPeer(e), e.streams[0])
 *
 * 画面那边一行都不用改 —— 两个 driver 写的是同一块 amplitudes 内存。
 */
import { setAmp } from './amplitudes'

// TS 5.7+ 给 TypedArray 加了 buffer 泛型（Uint8Array<ArrayBuffer>），
// getByteTimeDomainData 不接受 SharedArrayBuffer 背书的数组。
// 用 ReturnType 推导，新旧 TS 都能编过。
const makeBuf = (n: number) => new Uint8Array(new ArrayBuffer(n))

type Source = {
  analyser: AnalyserNode
  buf: ReturnType<typeof makeBuf>
  smooth: number
}

let ctx: AudioContext | null = null
const sources = new Map<number, Source>()

function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  // 浏览器自动播放策略：必须在一次用户手势之后 resume
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** 把某个座位的远端音轨挂上分析器 */
export function attachStream(seat: number, stream: MediaStream): void {
  const ac = audioContext()
  const src = ac.createMediaStreamSource(stream)
  const analyser = ac.createAnalyser()
  analyser.fftSize = 512
  // 时间常数越大越平滑，0.6 左右接近人眼舒适的口型跟随
  analyser.smoothingTimeConstant = 0.6
  src.connect(analyser)
  // 注意：不要 analyser.connect(ac.destination)，
  // 声音由 <audio> 元素或 SFU 客户端自己播，这里只做分析，否则会双份。
  sources.set(seat, {
    analyser,
    buf: makeBuf(analyser.fftSize),
    smooth: 0,
  })
}

export function detachStream(seat: number): void {
  sources.delete(seat)
  setAmp(seat, 0)
}

/** 每帧把所有音轨的 RMS 写进音量寄存器 */
export function startWebRTCDriver(): () => void {
  let raf = 0
  const tick = () => {
    for (const [seat, s] of sources) {
      s.analyser.getByteTimeDomainData(s.buf)
      let sum = 0
      for (let i = 0; i < s.buf.length; i++) {
        const v = (s.buf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / s.buf.length)
      // 语音 RMS 通常落在 0~0.3，放大到 0~1 再做一次软限幅
      const target = Math.min(1, rms * 3.5)
      const k = target > s.smooth ? 0.4 : 0.12
      s.smooth += (target - s.smooth) * k
      setAmp(seat, s.smooth)
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}
