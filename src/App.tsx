import { Canvas } from '@react-three/fiber'
import { Leva } from 'leva'
import { Suspense } from 'react'
import * as THREE from 'three'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { PokerTable } from './ui/poker/PokerTable'

export default function App() {
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 72, near: 0.08, far: 60 }}
        gl={{
          antialias: false, // 交给 EffectComposer 的 multisampling
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      {/*
        leva 面板只在开发时显示。
        不显式挂 <Leva> 的话它会自己创建一个面板 —— 线上 demo 右上角
        挂着一排调试滑块，看起来像没做完。
      */}
      <Leva hidden={!import.meta.env.DEV} />
      <Hud />
      {/*
        牌桌界面盖在 3D 上面，而不是替换掉它。
        3D 继续渲染是有意的：离席时能直接切回大厅，不用重建整个场景；
        将来摊牌要切回 3D 桌上，也只是把这一层淡出。
      */}
      <PokerTable />
    </>
  )
}
