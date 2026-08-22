import { Canvas } from '@react-three/fiber'
import { Leva } from 'leva'
import { Suspense } from 'react'
import * as THREE from 'three'
import { Scene } from './scene/Scene'
import { Shell } from './ui/Shell'

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
      {/*
        大厅、房间、牌桌全部盖在 3D 上面，而不是替换掉它。
        3D 一直在背后渲染是有意的：那座酒馆现在是**背景**，
        它把一个网页棋牌室和一个有地方感的产品分开。
        切屏只是换这一层里挂的是谁，场景不重建。
      */}
      <Shell />
    </>
  )
}
