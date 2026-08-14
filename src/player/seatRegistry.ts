import type * as THREE from 'three'

/**
 * 座位命中体的注册表。
 *
 * 为什么不用 R3F 自带的 onPointerOver：走动模式下指针是锁定的，
 * 没有真实的鼠标移动事件，R3F 的事件系统收不到任何东西。
 * 必须自己从屏幕中心（准心）发射线。
 */
export type SeatHit = {
  tableId: string
  seat: number
  mesh: THREE.Object3D
}

const registry: SeatHit[] = []

export function registerSeat(entry: SeatHit): () => void {
  registry.push(entry)
  return () => {
    const i = registry.indexOf(entry)
    if (i >= 0) registry.splice(i, 1)
  }
}

export function seatMeshes(): THREE.Object3D[] {
  return registry.map((r) => r.mesh)
}

export function seatOf(obj: THREE.Object3D): SeatHit | undefined {
  return registry.find((r) => r.mesh === obj)
}
