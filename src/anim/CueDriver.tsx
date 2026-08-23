import { useFrame } from '@react-three/fiber'
import { useCues } from './cues'

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
