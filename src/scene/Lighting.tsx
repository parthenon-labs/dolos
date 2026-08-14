import { useControls } from 'leva'

/**
 * 全局光照。每张桌子的吊灯在 TableUnit 里，这里只管大厅级别的东西。
 *
 * 布光原则：主光（吊灯）和环境光的**比值要大**。新手最常见的错误是
 * 环境光给太亮，结果整个场景灰蒙蒙的，没有任何戏剧性。
 * 宁可暗，不要平 —— 暗部由霓虹的彩色补光去填，而不是靠白色环境光。
 */
export function Lighting() {
  const c = useControls('大厅光照', {
    ambient: { value: 0.1, min: 0, max: 1, step: 0.01, label: '环境光' },
    ambientColor: { value: '#4a6a8c', label: '环境光色' },
    fogDensity: { value: 0.052, min: 0, max: 0.2, step: 0.002, label: '雾浓度' },
    fogColor: { value: '#0b0806', label: '雾色' },
  })

  return (
    <>
      <fogExp2 attach="fog" args={[c.fogColor, c.fogDensity]} />
      <color attach="background" args={[c.fogColor]} />
      <ambientLight intensity={c.ambient} color={c.ambientColor} />
      {/* 极弱的顶部补光，防止天花板和墙的上半部分完全消失 */}
      <hemisphereLight args={['#3a4a5c', '#1a1008', 0.16]} />
    </>
  )
}
