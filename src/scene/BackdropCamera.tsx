import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { STAND_HEIGHT } from './hallLayout'

/**
 * 背景相机。
 *
 * 大厅改成 2D 页面之后，3D 酒馆只剩一个用途：**当背景**。
 * 所以这里不再有 PlayerRig 那套走动、落座、指针锁定的东西 ——
 * 相机自己在中庭里慢慢横移和呼吸，不吃任何输入。
 *
 * 慢是关键。这是一张要在屏幕上待很久的背景，
 * 动得稍微快一点就会从"氛围"变成"晃眼"，玩家看不进前面的房间列表。
 * 一个来回大概九十秒。
 */
export function BackdropCamera() {
  const { camera } = useThree()
  const t = useRef(Math.random() * 100)

  useFrame((_, dt) => {
    t.current += dt
    const k = t.current

    // 沿中庭南北向缓慢推拉，同时左右微幅横移 —— 两个周期互质，
    // 走出来的轨迹不会明显重复
    const z = 7.5 + Math.sin(k * 0.055) * 5.5
    const x = Math.sin(k * 0.037) * 2.4
    const y = STAND_HEIGHT + 0.25 + Math.sin(k * 0.043) * 0.16

    camera.position.set(x, y, z)
    // 始终望向大厅纵深处的壁炉方向，略微低头 —— 视线里有桌子和人
    const look = new THREE.Vector3(x * 0.35, STAND_HEIGHT - 0.35, -9)
    camera.lookAt(look)
    // 极轻的滚转，让画面有一点手持感，又不至于让人注意到
    camera.rotation.z = Math.sin(k * 0.031) * 0.006

    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== 62) {
      camera.fov = 62
      camera.updateProjectionMatrix()
    }
  })

  return null
}
