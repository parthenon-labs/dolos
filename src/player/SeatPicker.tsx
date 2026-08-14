import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../state/usePlayerStore'
import { useGameStore } from '../state/useGameStore'

/**
 * 坐下 / 起身的键盘处理。
 *
 * 选座本身已经交给 Seat 组件上的 R3F 指针事件了 —— 有了自由光标就不再需要
 * 手动从屏幕中心发射线，那套 registry + raycast 全部删掉了。
 * 这里只剩下键盘：hover 着按 E 坐下，坐着按 Q / Esc 起身。
 */
export function SeatPicker() {
  const mode = usePlayerStore((s) => s.mode)
  const hovered = usePlayerStore((s) => s.hovered)
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const beginSit = usePlayerStore((s) => s.beginSit)
  const beginStand = usePlayerStore((s) => s.beginStand)
  const claimSeat = useGameStore((s) => s.claimSeat)

  // 用 ref 读最新值，避免每次 hover 变化都重新绑定键盘监听
  const modeRef = useRef(mode)
  modeRef.current = mode
  const hoveredRef = useRef(hovered)
  hoveredRef.current = hovered
  const seatedRef = useRef(seatedAt)
  seatedRef.current = seatedAt

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return

      if (e.code === 'KeyE' && modeRef.current === 'walking' && hoveredRef.current) {
        const h = hoveredRef.current
        claimSeat(h.tableId, h.seat, { name: '你', color: '#c9a227', isAI: false })
        beginSit(h)
      }

      if (
        (e.code === 'KeyQ' || e.code === 'Escape') &&
        modeRef.current === 'seated' &&
        seatedRef.current
      ) {
        const s = seatedRef.current
        claimSeat(s.tableId, s.seat, null)
        beginStand()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [beginSit, beginStand, claimSeat])

  return null
}
