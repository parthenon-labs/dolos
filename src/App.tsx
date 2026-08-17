import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import * as THREE from 'three'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { MatchView } from './ui/match/MatchView'

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
      <Hud />
      {/*
        对局界面盖在 3D 上面，而不是替换掉它。
        3D 继续渲染是有意的：离席时能直接切回大厅，不用重建整个场景；
        将来刺杀揭晓要切回桌上，也只是把这一层淡出。
      */}
      <MatchView />
    </>
  )
}
