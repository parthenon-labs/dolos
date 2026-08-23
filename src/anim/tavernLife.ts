import { useEffect } from 'react'
import { useCues } from './cues'
import { gestureAt } from '../scene/character/rigRegistry'

/**
 * 让背景里那桌人动起来。
 *
 * 这里以前跑的是**一整局阿瓦隆** —— 本地开一局规则 bot 对局，
 * 把事件翻成动画 cue 喂给场景。那套东西在"走进 3D 酒馆坐下"的年代
 * 是有意义的：玩家真的会坐到那张桌子上看这局牌。
 *
 * 大厅改成 2D 之后它剩下的**唯一可见效果是角色前倾**：
 * 提名高亮、投票筹码、任务牌、刺杀聚焦全都写进了 `TableChoreography`，
 * 而那个组件只在"玩家坐在这张桌子上"时渲染 —— 也就是永远不渲染。
 * 为了一个前倾动作养着两千多行阿瓦隆规则引擎，不划算。
 *
 * 所以换成这个：随机挑个座位做个动作，间隔带抖动。
 * **背景需要的是"有人在动"，不是"在打一局什么"** ——
 * 隔着一层暖纱、在几十米外，谁也分不出那桌人在打阿瓦隆还是在聊天。
 */
export function useTavernLife(seats: number) {
  const enqueue = useCues((s) => s.enqueue)

  useEffect(() => {
    if (seats <= 0) return
    let timer: ReturnType<typeof setTimeout>
    let last = -1

    const loop = () => {
      // 间隔带随机。等距的动作一眼就能看出是脚本在跑
      timer = setTimeout(
        () => {
          let seat = Math.floor(Math.random() * seats)
          // 别连着两次都是同一个人 —— 那看起来像那个人在抽搐
          if (seat === last && seats > 1) seat = (seat + 1) % seats
          last = seat
          // 走 cue 队列而不是直接调 gestureAt：队列保证两个动作不会叠在一起，
          // 而这正是 cues.ts 存在的理由，不该因为事件源换了就绕开它
          enqueue({
            label: `ambient:${seat}`,
            duration: 1.1,
            onStart: () => gestureAt(seat, Math.random() < 0.35 ? 'point' : 'lean'),
          })
          loop()
        },
        2200 + Math.random() * 3400,
      )
    }
    loop()
    return () => clearTimeout(timer)
  }, [seats, enqueue])
}
