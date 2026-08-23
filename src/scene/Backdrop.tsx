import { Canvas } from '@react-three/fiber'
import { Leva } from 'leva'
import { Suspense } from 'react'
import * as THREE from 'three'
import { Scene } from './Scene'

/**
 * 3D 背景整块。
 *
 * 单独拆出来是为了**能被懒加载**：three.js 加上后处理是这个包里最大的一坨，
 * 而它渲染的东西是装饰 —— 让进场页和大厅等它下载完再出现，
 * 是把首屏押在一件可有可无的事情上。
 *
 * 所以外面用 `lazy` 包着，fallback 是 null：背景晚零点几秒淡进来，
 * 没人会注意到；首屏晚一秒出现，所有人都会注意到。
 */
export default function Backdrop() {
  return (
    <>
      {/*
        leva 面板跟着场景一起懒加载。
        它不能删 —— 场景里几个组件用了 useControls，而 leva 见到 useControls
        就会自己造一个面板出来，线上右上角挂一排调试滑块看起来像没做完。
        但它也没理由挡在首屏：需要它的东西（Lighting / Effects / LightBudget）
        本来就都在这一块里。
      */}
      <Leva hidden={!import.meta.env.DEV} />
      <Canvas
        className="backdrop"
        shadows
        dpr={[1, 2]}
        camera={{ fov: 72, near: 0.08, far: 60 }}
        gl={{
          antialias: false, // 交给 EffectComposer 的 multisampling
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.18,
        }}
    >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </>
  )
}
