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
    // 删掉八盏桌下反弹光之后，靠环境光把下半身的死黑补回来 —— 一盏抵八盏
    /**
     * 环境光。
     *
     * 这个值原来是 0.16，那是**按"玩家走进去、离桌子两米"定的** ——
     * 近处有吊灯的主光，环境光只负责把暗部从死黑里拉出来一点。
     * 现在相机退到中庭当背景，画面里九成是远处，主光照不到，
     * 于是整张背景只剩轮廓。远景需要更多的环境光，这不是"调亮一点"，
     * 是场景的用途变了。
     */
    ambient: { value: 0.26, min: 0, max: 1, step: 0.01, label: '环境光' },
    ambientColor: { value: '#4a6a8c', label: '环境光色' },
    // 空间拉长后雾要减淡，否则大厅深处直接糊成一片黑，纵深感反而没了。
    // 雾的作用是分层，不是遮挡。
    fogDensity: { value: 0.034, min: 0, max: 0.2, step: 0.002, label: '雾浓度' },
    fogColor: { value: '#0b0806', label: '雾色' },
  })

  return (
    <>
      <fogExp2 attach="fog" args={[c.fogColor, c.fogDensity]} />
      <color attach="background" args={[c.fogColor]} />
      <ambientLight intensity={c.ambient} color={c.ambientColor} />
      {/* 极弱的顶部补光，防止天花板和墙的上半部分完全消失 */}
      <hemisphereLight args={['#3a4a5c', '#1a1008', 0.24]} />
    </>
  )
}
