import { useEffect } from 'react'

/**
 * 全局键盘。
 *
 * 弹窗必须能用 Esc 关、Enter 确认 —— 这不是给高手用的快捷键，
 * **是所有人都会下意识去按的两个键**，按了没反应就会觉得这东西"不跟手"。
 *
 * 挂在 window 上而不是弹窗本身：弹窗里的输入框会抢焦点，
 * 挂在容器上时点了别处就失效了。
 */
export function useKeys(map: Record<string, (() => void) | undefined>) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const fn = map[e.key]
      if (!fn) return
      // 正在输入框里打字时，一个键都不抢。
      // 少了这条，房间聊天里打个空格就把牌打出去了
      const t = e.target as HTMLElement | null
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return
      e.preventDefault()
      fn()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })
}
