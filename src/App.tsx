import { Suspense, lazy } from 'react'
import { Shell } from './ui/Shell'
import { useClickSound } from './audio/useSound'

/**
 * 3D 背景懒加载。
 *
 * three.js + 后处理是这个包里最大的一坨，而它画的是装饰。
 * 让进场页等它下完再出现，等于把首屏押在一件可有可无的事情上。
 * fallback 给 null —— 背景晚零点几秒淡进来没人会注意到。
 */
const Backdrop = lazy(() => import('./scene/Backdrop'))

export default function App() {
  useClickSound()
  return (
    <>
      <Suspense fallback={null}>
        <Backdrop />
      </Suspense>
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
