import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CAMERA_PULLBACK, EYE_HEIGHT, seatPosition } from './seats'
import { NUM_SEATS } from '../audio/amplitudes'

const YAW_LIMIT = THREE.MathUtils.degToRad(75)
const PITCH_LIMIT_UP = THREE.MathUtils.degToRad(18)
const PITCH_LIMIT_DOWN = THREE.MathUtils.degToRad(32)

/**
 * 坐姿第一人称相机。
 *
 * 关键设计：**不用 PointerLock**。这是牌桌游戏，鼠标要点牌、点按钮、
 * 点玩家，锁指针会让 UI 完全没法用。改成"按住拖拽环视"，
 * 松手后指针还是指针。
 *
 * 视角被夹住（左右 ±75°，上 18° 下 32°）—— 你是坐着的，
 * 不该能转 360°。这个限制反而强化了"被困在这张桌子上"的感觉。
 */
export function CameraRig() {
  const { camera, gl } = useThree()
  const yaw = useRef(0)
  const pitch = useRef(-0.06)
  const targetYaw = useRef(0)
  const targetPitch = useRef(-0.06)
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const el = gl.domElement
    const seat0 = seatPosition(0, NUM_SEATS)
    camera.position.set(
      seat0[0] * CAMERA_PULLBACK,
      EYE_HEIGHT,
      seat0[2] * CAMERA_PULLBACK,
    )
    camera.rotation.order = 'YXZ'

    const onDown = (e: PointerEvent) => {
      dragging.current = true
      last.current = { x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - last.current.x
      const dy = e.clientY - last.current.y
      last.current = { x: e.clientX, y: e.clientY }
      targetYaw.current = THREE.MathUtils.clamp(
        targetYaw.current - dx * 0.0026,
        -YAW_LIMIT,
        YAW_LIMIT,
      )
      targetPitch.current = THREE.MathUtils.clamp(
        targetPitch.current - dy * 0.0026,
        -PITCH_LIMIT_DOWN,
        PITCH_LIMIT_UP,
      )
    }
    const onUp = (e: PointerEvent) => {
      dragging.current = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      el.style.cursor = 'grab'
    }

    el.style.cursor = 'grab'
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [camera, gl])

  useFrame((_, dt) => {
    yaw.current = THREE.MathUtils.damp(yaw.current, targetYaw.current, 8, dt)
    pitch.current = THREE.MathUtils.damp(pitch.current, targetPitch.current, 8, dt)

    // 极轻微的呼吸摇晃。没有它，画面会"死"在那里像张静态图；
    // 幅度必须非常小，大了就晕。
    const t = performance.now() / 1000
    const swayY = Math.sin(t * 0.62) * 0.0032
    const swayX = Math.sin(t * 0.47 + 1.3) * 0.0022

    camera.rotation.y = yaw.current + swayX
    camera.rotation.x = pitch.current + swayY
    camera.position.y = EYE_HEIGHT + Math.sin(t * 0.9) * 0.004
  })

  return null
}
