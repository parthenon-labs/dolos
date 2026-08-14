import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { seatMeshes, seatOf } from './seatRegistry'
import { usePlayerStore } from '../state/usePlayerStore'
import { useGameStore } from '../state/useGameStore'

/** 超过这个距离就算够不着，不给坐 */
const REACH = 3.4

/**
 * 从屏幕中心发射线找空位，并处理坐下 / 起身按键。
 *
 * 射线检测每 3 帧做一次 —— 60fps 下等于 20Hz，人眼完全感知不到延迟，
 * 但省掉三分之二的 raycast 开销。这类"够用就好"的降频在
 * 每帧遍历场景的逻辑里非常值得做。
 */
export function SeatPicker() {
  const { camera } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const center = useMemo(() => new THREE.Vector2(0, 0), [])
  const frame = useRef(0)

  const mode = usePlayerStore((s) => s.mode)
  const hovered = usePlayerStore((s) => s.hovered)
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const setHovered = usePlayerStore((s) => s.setHovered)
  const beginSit = usePlayerStore((s) => s.beginSit)
  const beginStand = usePlayerStore((s) => s.beginStand)
  const claimSeat = useGameStore((s) => s.claimSeat)

  const modeRef = useRef(mode)
  modeRef.current = mode
  const hoveredRef = useRef(hovered)
  hoveredRef.current = hovered
  const seatedRef = useRef(seatedAt)
  seatedRef.current = seatedAt

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

  useFrame(() => {
    if (mode !== 'walking') {
      if (hoveredRef.current) setHovered(null)
      return
    }
    frame.current++
    if (frame.current % 3 !== 0) return

    raycaster.setFromCamera(center, camera)
    raycaster.far = REACH
    const hits = raycaster.intersectObjects(seatMeshes(), false)
    if (hits.length === 0) {
      setHovered(null)
      return
    }
    const found = seatOf(hits[0].object)
    setHovered(found ? { tableId: found.tableId, seat: found.seat } : null)
  })

  return null
}
