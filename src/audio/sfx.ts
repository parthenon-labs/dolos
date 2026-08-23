/**
 * 音效。
 *
 * **全部是现场合成的，一个音频文件都没有。** 理由和整个项目零美术资源
 * 是同一条：一套音效是资源、加载和授权三重麻烦，而 UI 音效本来就是
 * 几十毫秒的包络问题 —— 一段噪声加一条衰减曲线，比找素材快得多，
 * 也不会让首屏多背几百 KB。
 *
 * 设计上只守两条：
 * - **短**。UI 音效超过 120ms 就会盖住下一次点击，连点时糊成一片
 * - **轻**。默认音量压得很低。音效是给操作加确认感的，不是内容
 */

type Kind =
  | 'click'
  | 'back'
  | 'card'
  | 'deal'
  | 'chip'
  | 'place'
  | 'dice'
  | 'win'
  | 'lose'
  | 'error'
  | 'join'

const KEY = 'dolos.muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
})()

/** 噪声源要复用。每次 new 一个 buffer 在连点时会明显卡 */
let noiseBuf: AudioBuffer | null = null

function ensure(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.32
    master.connect(ctx.destination)
  }
  // 浏览器要求先有用户手势。进场页那一下就是为这个留的
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

/** 一个带包络的正弦/方波音 */
function tone(
  c: AudioContext,
  freq: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
  slideTo?: number,
  delay = 0,
) {
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  // 起音留 4ms，不然会有"咔"的爆音
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(master!)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** 一段过滤过的噪声。纸牌、筹码、骰子全是它加不同的滤波 */
function burst(
  c: AudioContext,
  dur: number,
  gain: number,
  freq: number,
  q = 1,
  type: BiquadFilterType = 'bandpass',
  delay = 0,
) {
  const t0 = c.currentTime + delay
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f).connect(g).connect(master!)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

export function sfx(kind: Kind) {
  const c = ensure()
  if (!c) return
  switch (kind) {
    case 'click':
      // 木头敲一下：一个短促的中频加一点噪声尾巴
      tone(c, 620, 0.05, 0.22, 'triangle', 420)
      burst(c, 0.03, 0.06, 2600, 0.8)
      break
    case 'back':
      tone(c, 400, 0.07, 0.18, 'triangle', 260)
      break
    case 'card':
      // 一张牌摩擦出去
      burst(c, 0.07, 0.2, 3200, 0.6, 'highpass')
      break
    case 'deal':
      // 连续发牌，三下错开
      for (let i = 0; i < 3; i++) burst(c, 0.06, 0.14, 3000, 0.6, 'highpass', i * 0.055)
      break
    case 'chip':
      // 筹码相碰：两个高频点，稍微错开才像两片塑料
      tone(c, 1750, 0.045, 0.13, 'sine')
      tone(c, 2300, 0.04, 0.1, 'sine', undefined, 0.02)
      break
    case 'place':
      // 木头件放到板子上
      tone(c, 300, 0.09, 0.24, 'triangle', 170)
      burst(c, 0.05, 0.09, 900, 1.2)
      break
    case 'dice':
      for (let i = 0; i < 5; i++)
        burst(c, 0.045, 0.11, 1400 + Math.random() * 1400, 2, 'bandpass', i * 0.042)
      break
    case 'join':
      tone(c, 560, 0.08, 0.16, 'sine')
      tone(c, 840, 0.1, 0.14, 'sine', undefined, 0.07)
      break
    case 'win':
      // 一个上行的小三和弦
      ;[523, 659, 784, 1047].forEach((f, i) => tone(c, f, 0.24, 0.16, 'triangle', undefined, i * 0.075))
      break
    case 'lose':
      ;[392, 330, 262].forEach((f, i) => tone(c, f, 0.26, 0.14, 'triangle', undefined, i * 0.085))
      break
    case 'error':
      tone(c, 190, 0.14, 0.2, 'square', 140)
      break
  }
}

export const isMuted = () => muted

export function setMuted(v: boolean) {
  muted = v
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    // 隐私模式下写不了 localStorage。静音状态丢了不影响用，不用管
  }
  if (master && ctx) master.gain.value = v ? 0 : 0.32
}
