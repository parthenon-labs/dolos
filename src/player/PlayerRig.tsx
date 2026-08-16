import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  BOX_OBSTACLES,
  CIRCLE_OBSTACLES,
  HALL,
  PLAYER_RADIUS,
  STAND_HEIGHT,
  STEP_LIMIT,
  floorHeightAt,
  levelFromHeight,
  seatedCamera,
  standingSpot,
  tableById,
  tableFloorY,
} from '../scene/hallLayout'
import { usePlayerStore } from '../state/usePlayerStore'

const WALK_SPEED = 3.1
const ACCEL = 14
const SIT_DURATION = 1.15
const STAND_DURATION = 0.85

/**
 * 走动和落座用不同的 FOV。走动时视野宽（FPS 惯例，空间感强），
 * 坐下后收窄（人像更饱满，注意力集中在对面的脸上）。
 * 转场时平滑过渡，那一下"镜头收拢"是坐下动作里很关键的一半。
 */
const FOV_WALK = 72
const FOV_SEATED = 60

// 落座后视角夹在朝向桌心的 ±78° 内 —— 你是坐着的，不该能转 360°。
// 走动时 yaw 不设限，pitch 仍然要夹，否则能翻到脑后。
const SEATED_YAW_LIMIT = THREE.MathUtils.degToRad(78)
const SEATED_PITCH_UP = THREE.MathUtils.degToRad(20)
const SEATED_PITCH_DOWN = THREE.MathUtils.degToRad(34)
const WALK_PITCH = THREE.MathUtils.degToRad(72)

const LOOK_SPEED = 0.0026

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

/**
 * 相机的唯一所有者。
 *
 * 走动、坐下转场、落座环视三种行为都在这里，而不是拆成三个组件 ——
 * 多个组件同时写 camera.position/rotation 会互相打架，而且 bug 极难查。
 * 谁拥有相机，必须是明确的一个地方。
 *
 * 输入方案：**不锁指针**，按住拖拽转视角，光标始终可见。
 * 代价是转视角要按住鼠标，不如 FPS 顺手；换来的是光标能去 hover 椅子、
 * 点牌、点按钮 —— 对一个牌桌游戏这笔交易是划算的。
 */
export function PlayerRig() {
  const { camera, gl } = useThree()

  const mode = usePlayerStore((s) => s.mode)
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const finishSit = usePlayerStore((s) => s.finishSit)
  const finishStand = usePlayerStore((s) => s.finishStand)

  // 位置只维护水平分量，脚下标高单独算
  // 出生在南端入口，yaw=0 面朝 -Z，也就是望穿整条大厅。
  const pos = useRef(new THREE.Vector2(0, 13.2))
  const vel = useRef(new THREE.Vector2())
  /** 脚下地面标高 */
  const groundY = useRef(0)
  /** 平滑后的标高，上下楼梯时不至于一格一格顿 */
  const smoothY = useRef(0)
  const level = useRef<0 | 1>(0)

  const yaw = useRef(0)
  const pitch = useRef(-0.04)
  const targetYaw = useRef(0)
  const targetPitch = useRef(-0.04)
  const bobPhase = useRef(0)

  const keys = useRef<Record<string, boolean>>({})
  const dragging = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  /** 落座时朝向桌心的基准 yaw，环视限制以它为中心 */
  const seatedBaseYaw = useRef(0)

  const tween = useRef<{
    t: number
    dur: number
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromYaw: number
    toYaw: number
    fromPitch: number
    toPitch: number
    kind: 'sit' | 'stand'
  } | null>(null)

  const modeRef = useRef(mode)
  modeRef.current = mode

  /* ---------------- 键盘 ---------------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }
    const onBlur = () => {
      // 切走窗口时按键的 keyup 收不到，回来会一直往前飘
      keys.current = {}
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  /* ---------------- 拖拽转视角 ---------------- */

  useEffect(() => {
    const el = gl.domElement

    const onDown = (e: PointerEvent) => {
      if (modeRef.current !== 'walking' && modeRef.current !== 'seated') return
      dragging.current = true
      lastPointer.current = { x: e.clientX, y: e.clientY }
    }

    // move/up 挂在 window 而不是 canvas，也不用 setPointerCapture ——
    // 捕获会干扰 R3F 自己的事件系统，而 hover 选座正依赖它。
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      const m = modeRef.current
      if (m !== 'walking' && m !== 'seated') return

      const dx = e.clientX - lastPointer.current.x
      const dy = e.clientY - lastPointer.current.y
      lastPointer.current = { x: e.clientX, y: e.clientY }

      if (m === 'seated') {
        const base = seatedBaseYaw.current
        targetYaw.current = THREE.MathUtils.clamp(
          targetYaw.current - dx * LOOK_SPEED,
          base - SEATED_YAW_LIMIT,
          base + SEATED_YAW_LIMIT,
        )
        targetPitch.current = THREE.MathUtils.clamp(
          targetPitch.current - dy * LOOK_SPEED,
          -SEATED_PITCH_DOWN,
          SEATED_PITCH_UP,
        )
      } else {
        targetYaw.current -= dx * LOOK_SPEED
        targetPitch.current = THREE.MathUtils.clamp(
          targetPitch.current - dy * LOOK_SPEED,
          -WALK_PITCH,
          WALK_PITCH,
        )
      }
    }

    const onUp = () => {
      dragging.current = false
    }

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [gl])

  /* ---------------- 模式切换时启动转场 ---------------- */

  useEffect(() => {
    if (mode === 'sitting-down' && seatedAt) {
      const table = tableById(seatedAt.tableId)
      if (!table) return
      const target = seatedCamera(table, seatedAt.seat)
      seatedBaseYaw.current = nearestAngle(yaw.current, target.yaw)
      tween.current = {
        t: 0,
        dur: SIT_DURATION,
        fromPos: camera.position.clone(),
        toPos: new THREE.Vector3(...target.position),
        fromYaw: yaw.current,
        // 取和当前 yaw 最近的等价角，避免绕远路转一整圈
        toYaw: seatedBaseYaw.current,
        fromPitch: pitch.current,
        toPitch: -0.06,
        kind: 'sit',
      }
    }

    if (mode === 'standing-up' && seatedAt) {
      const table = tableById(seatedAt.tableId)
      if (!table) return
      const spot = standingSpot(table, seatedAt.seat)
      const fy = tableFloorY(table)
      // 起身要落回桌子所在的那一层，否则在二楼站起来会掉到一楼标高
      groundY.current = fy
      smoothY.current = fy
      level.current = table.floor
      tween.current = {
        t: 0,
        dur: STAND_DURATION,
        fromPos: camera.position.clone(),
        toPos: new THREE.Vector3(spot[0], fy + STAND_HEIGHT, spot[1]),
        fromYaw: yaw.current,
        toYaw: yaw.current,
        fromPitch: pitch.current,
        toPitch: -0.02,
        kind: 'stand',
      }
    }
  }, [mode, seatedAt, camera])

  /* ---------------- 每帧 ---------------- */

  const tmp = useMemo(() => new THREE.Vector2(), [])

  useFrame((_, rawDt) => {
    // 切标签页回来时 dt 会是个巨大值，夹一下，否则玩家会瞬移穿墙
    const dt = Math.min(rawDt, 0.05)
    camera.rotation.order = 'YXZ'
    const cam = camera as THREE.PerspectiveCamera

    if (tween.current) {
      const tw = tween.current
      tw.t = Math.min(1, tw.t + dt / tw.dur)
      const k = easeInOutCubic(tw.t)
      camera.position.lerpVectors(tw.fromPos, tw.toPos, k)
      const fovFrom = tw.kind === 'sit' ? FOV_WALK : FOV_SEATED
      const fovTo = tw.kind === 'sit' ? FOV_SEATED : FOV_WALK
      cam.fov = THREE.MathUtils.lerp(fovFrom, fovTo, k)
      cam.updateProjectionMatrix()

      yaw.current = THREE.MathUtils.lerp(tw.fromYaw, tw.toYaw, k)
      pitch.current = THREE.MathUtils.lerp(tw.fromPitch, tw.toPitch, k)
      camera.rotation.set(pitch.current, yaw.current, 0)

      if (tw.t >= 1) {
        targetYaw.current = yaw.current
        targetPitch.current = pitch.current
        if (tw.kind === 'sit') {
          finishSit()
        } else {
          pos.current.set(tw.toPos.x, tw.toPos.z)
          vel.current.set(0, 0)
          finishStand()
        }
        tween.current = null
      }
      return
    }

    if (mode === 'walking') {
      stepWalking(dt)
      return
    }

    if (mode === 'seated') {
      yaw.current = THREE.MathUtils.damp(yaw.current, targetYaw.current, 8, dt)
      pitch.current = THREE.MathUtils.damp(pitch.current, targetPitch.current, 8, dt)
      // 极轻微的呼吸摇晃。没有它画面会"死"成一张静态图；幅度必须很小，大了会晕
      const t = performance.now() / 1000
      camera.rotation.set(
        pitch.current + Math.sin(t * 0.62) * 0.0032,
        yaw.current + Math.sin(t * 0.47 + 1.3) * 0.0022,
        0,
      )
    }
  })

  function stepWalking(dt: number) {
    yaw.current = THREE.MathUtils.damp(yaw.current, targetYaw.current, 22, dt)
    pitch.current = THREE.MathUtils.damp(pitch.current, targetPitch.current, 22, dt)

    const k = keys.current
    let ix = 0
    let iz = 0
    if (k['KeyW'] || k['ArrowUp']) iz -= 1
    if (k['KeyS'] || k['ArrowDown']) iz += 1
    if (k['KeyA'] || k['ArrowLeft']) ix -= 1
    if (k['KeyD'] || k['ArrowRight']) ix += 1

    // 输入向量绕 yaw 旋转到世界方向。
    //
    // 绕 Y 轴旋转 (vx, vz) 的正确形式是：
    //   x' = vx*cos + vz*sin
    //   z' = -vx*sin + vz*cos
    // 校验：W 给 (0,-1) → (-sin, -cos)，正是 yaw 对应的前方（three 里 -Z 为前）。
    // A 给 (-1,0) → (-cos, sin)，正是左方。
    tmp.set(0, 0)
    if (ix !== 0 || iz !== 0) {
      const len = Math.hypot(ix, iz)
      const nx = ix / len
      const nz = iz / len
      const c = Math.cos(yaw.current)
      const s = Math.sin(yaw.current)
      tmp.set(nx * c + nz * s, -nx * s + nz * c)
      tmp.multiplyScalar(WALK_SPEED)
    }

    // 加速度而不是直接赋值 —— 瞬间启停的移动手感很廉价
    vel.current.x = THREE.MathUtils.damp(vel.current.x, tmp.x, ACCEL, dt)
    vel.current.y = THREE.MathUtils.damp(vel.current.y, tmp.y, ACCEL, dt)

    const dx = vel.current.x * dt
    const dz = vel.current.y * dt

    // 先整体走，被拦住就退化成只走一个轴 —— 这样贴着墙和栏杆走会"滑"过去，
    // 而不是整个人黏住不动。分轴回退是最省事的滑动碰撞。
    if (!attemptMove(dx, dz)) {
      const okX = attemptMove(dx, 0)
      const okZ = attemptMove(0, dz)
      if (okX) vel.current.y = 0
      else if (okZ) vel.current.x = 0
      else vel.current.set(0, 0)
    }

    // 上下楼梯时把标高做平滑，否则每级台阶都会顿一下
    smoothY.current = THREE.MathUtils.damp(smoothY.current, groundY.current, 16, dt)

    // 走路头部起伏，速度越快越明显
    const speed = vel.current.length()
    bobPhase.current += dt * speed * 3.4
    const ratio = Math.min(1, speed / WALK_SPEED)
    const bob = Math.sin(bobPhase.current) * 0.028 * ratio
    const roll = Math.cos(bobPhase.current * 0.5) * 0.007 * ratio

    camera.position.set(
      pos.current.x,
      smoothY.current + STAND_HEIGHT + bob,
      pos.current.y,
    )
    camera.rotation.set(pitch.current, yaw.current, roll)
  }

  /**
   * 尝试位移。返回是否成功。
   * 失败的唯一原因是脚下高度跨度超过一步 —— 墙和家具由 resolveCollisions
   * 直接推开，不算失败。
   */
  function attemptMove(dx: number, dz: number): boolean {
    if (dx === 0 && dz === 0) return true
    const next = new THREE.Vector2(pos.current.x + dx, pos.current.y + dz)
    resolveCollisions(next, level.current)
    const h = floorHeightAt(next.x, next.y, level.current)
    if (Math.abs(h - groundY.current) > STEP_LIMIT) return false
    pos.current.copy(next)
    groundY.current = h
    level.current = levelFromHeight(h)
    return true
  }

  return null
}

/** 圆形推出 + 墙体夹取。够用了，不需要物理引擎 */
function resolveCollisions(p: THREE.Vector2, level: 0 | 1) {
  for (const o of CIRCLE_OBSTACLES) {
    if (o.level !== level) continue
    const dx = p.x - o.x
    const dz = p.y - o.z
    const d = Math.hypot(dx, dz)
    const min = o.r + PLAYER_RADIUS
    if (d < min && d > 1e-4) {
      p.x = o.x + (dx / d) * min
      p.y = o.z + (dz / d) * min
    }
  }

  for (const box of BOX_OBSTACLES) {
    if (box.level !== undefined && box.level !== level) continue
    const [minX, minZ] = box.min
    const [maxX, maxZ] = box.max
    const cx = THREE.MathUtils.clamp(p.x, minX, maxX)
    const cz = THREE.MathUtils.clamp(p.y, minZ, maxZ)
    const dx = p.x - cx
    const dz = p.y - cz
    const d = Math.hypot(dx, dz)
    if (d < PLAYER_RADIUS) {
      if (d > 1e-4) {
        p.x = cx + (dx / d) * PLAYER_RADIUS
        p.y = cz + (dz / d) * PLAYER_RADIUS
      } else {
        // 圆心落在盒子里：往最近的边推出去
        const toLeft = Math.abs(p.x - minX)
        const toRight = Math.abs(maxX - p.x)
        const toTop = Math.abs(p.y - minZ)
        const toBottom = Math.abs(maxZ - p.y)
        const m = Math.min(toLeft, toRight, toTop, toBottom)
        if (m === toLeft) p.x = minX - PLAYER_RADIUS
        else if (m === toRight) p.x = maxX + PLAYER_RADIUS
        else if (m === toTop) p.y = minZ - PLAYER_RADIUS
        else p.y = maxZ + PLAYER_RADIUS
      }
    }
  }

  const hw = HALL.width / 2 - PLAYER_RADIUS
  const hd = HALL.depth / 2 - PLAYER_RADIUS
  p.x = THREE.MathUtils.clamp(p.x, -hw, hw)
  p.y = THREE.MathUtils.clamp(p.y, -hd, hd)
}

/** 返回和 current 最接近的、与 target 等价的角度，避免转场绕远路 */
function nearestAngle(current: number, target: number): number {
  let d = (target - current) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return current + d
}
