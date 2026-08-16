import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { usePlayerStore } from '../state/usePlayerStore'
import { useGameStore } from '../state/useGameStore'
import { TABLES, seatWorld } from '../scene/hallLayout'

/** 走到这个距离内才算够得着 */
const REACH = 2.6
/** 身后的椅子不选。dot 低于这个值判定为"在背后" */
const BEHIND = -0.25

/**
 * 选座：走近就自动选中最近那把空椅子，按 E 坐下。
 *
 * 对齐撒谎酒馆的做法 —— 它也是站到桌边按 E，**完全不需要瞄**。
 *
 * 前面试过两版都不理想：屏幕中心一个准心去瞄椅子（要瞄，累），
 * 以及光标 hover 椅子（为了留住光标只能放弃锁指针，把移动手感搭进去了）。
 * 距离判定两个问题都没有：不用瞄，也不占用鼠标，
 * 于是鼠标可以专心做它在 FPS 里唯一该做的事——转视角。
 */
export function SeatPicker() {
  const mode = usePlayerStore((s) => s.mode)
  const hovered = usePlayerStore((s) => s.hovered)
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const setHovered = usePlayerStore((s) => s.setHovered)
  const beginSit = usePlayerStore((s) => s.beginSit)
  const beginStand = usePlayerStore((s) => s.beginStand)
  const occupancy = useGameStore((s) => s.occupancy)
  const claimSeat = useGameStore((s) => s.claimSeat)

  // 用 ref 读最新值，避免每次选中变化都重新绑定键盘监听
  const modeRef = useRef(mode)
  modeRef.current = mode
  const hoveredRef = useRef(hovered)
  hoveredRef.current = hovered
  const seatedRef = useRef(seatedAt)
  seatedRef.current = seatedAt

  const frame = useRef(0)
  const seatPos = useRef(new THREE.Vector3())
  const fwd = useRef(new THREE.Vector3())
  const toSeat = useRef(new THREE.Vector3())

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
        // 起身要把指针重新锁回去。必须在按键这个用户手势里直接调，
        // 浏览器不接受没有手势的 requestPointerLock。
        document.querySelector('canvas')?.requestPointerLock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [beginSit, beginStand, claimSeat])

  useFrame(({ camera }) => {
    if (mode !== 'walking') {
      if (hoveredRef.current) setHovered(null)
      return
    }
    // 每 5 帧算一次，玩家 1/12 秒最多走 0.25 米
    frame.current++
    if (frame.current % 5 !== 0) return

    camera.getWorldDirection(fwd.current)
    fwd.current.y = 0
    fwd.current.normalize()

    let best: { tableId: string; seat: number } | null = null
    let bestD = REACH

    for (const t of TABLES) {
      const seats = occupancy[t.id]
      if (!seats) continue
      // 先用桌心快速排除整张桌子，省掉逐座位的开销
      const dxT = t.pos[0] - camera.position.x
      const dzT = t.pos[1] - camera.position.z
      if (dxT * dxT + dzT * dzT > 36) continue

      for (let i = 0; i < t.seats; i++) {
        if (seats[i]) continue // 有人
        const w = seatWorld(t, i)
        seatPos.current.set(w[0], w[1], w[2])
        const d = camera.position.distanceTo(seatPos.current)
        if (d >= bestD) continue
        // 背后的椅子不选，否则贴着桌子转身时选中项会乱跳
        toSeat.current.copy(seatPos.current).sub(camera.position)
        toSeat.current.y = 0
        toSeat.current.normalize()
        if (toSeat.current.dot(fwd.current) < BEHIND) continue
        best = { tableId: t.id, seat: i }
        bestD = d
      }
    }

    setHovered(best)
  })

  return null
}
