import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

type Entry = { light: THREE.Light; d2: number }

/**
 * 光源预算：每次只点亮离玩家最近的若干盏，其余关掉。
 *
 * 起因是一次实测：整个大厅堆到 46 盏灯时只有 9.6 FPS，把 36 盏点光源
 * 关掉立刻回到 52.5 —— three 里每一盏动态光都要对每个像素算一遍，
 * 灯的数量是这类场景最容易失控、也最贵的一项。反射地板和后处理相比之下
 * 几乎不要钱（关掉只回收 1 FPS）。
 *
 * **有了这套之后，场景里挂多少盏灯几乎不影响帧率，只有上限值才要钱。**
 * 所以该往回加的氛围灯就大胆加 —— 尤其是霓虹那几盏，它们负责把颜色
 * 染到墙面和地板上，自发光条只是自己亮，不会给周围上色，缺了整个画面会发平。
 *
 * **关键细节：可见的盏数必须恒定。** three 是按灯的数量来编译着色器的，
 * 数量一变就要重编译，走动时会一顿一顿。所以这里永远点亮恰好 max 盏，
 * 只是换哪几盏 —— 换灯不换数量，就不会触发重编译。
 *
 * 远处那些灯本来也没用：它们都设了 distance 衰减范围，隔着十几米
 * 对画面的贡献基本是 0，关掉看不出来。
 */
export function LightBudget() {
  const c = useControls('光源预算', {
    maxPoint: { value: 14, min: 2, max: 40, step: 1, label: '点光源上限' },
    maxSpot: { value: 5, min: 1, max: 10, step: 1, label: '聚光灯上限' },
  })

  const frame = useRef(0)
  const points = useRef<THREE.Light[]>([])
  const spots = useRef<THREE.Light[]>([])
  const buf = useRef<Entry[]>([])
  const world = useRef(new THREE.Vector3())

  useFrame(({ scene, camera }) => {
    frame.current++
    // 每 10 帧重排一次。玩家 3.1 m/s，1/6 秒最多移动半米，
    // 不可能在这期间让"最近的若干盏"发生有意义的变化。
    if (frame.current % 10 !== 1) return

    // 灯是静态的，收集一次就够
    if (points.current.length + spots.current.length === 0) {
      scene.traverse((o) => {
        const l = o as THREE.Light
        if (!l.isLight) return
        if (o.userData.budget === 'point') points.current.push(l)
        else if (o.userData.budget === 'spot') spots.current.push(l)
      })
    }

    apply(points.current, c.maxPoint)
    apply(spots.current, c.maxSpot)

    function apply(list: THREE.Light[], max: number) {
      if (list.length <= max) {
        for (const l of list) l.visible = true
        return
      }
      const arr = buf.current
      arr.length = 0
      for (const l of list) {
        l.getWorldPosition(world.current)
        arr.push({ light: l, d2: world.current.distanceToSquared(camera.position) })
      }
      arr.sort((a, b) => a.d2 - b.d2)
      for (let i = 0; i < arr.length; i++) arr[i].light.visible = i < max
    }
  })

  return null
}
