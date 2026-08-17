import { FLOOR2_Y, HALL, SLAB, STAIRS, stairHeightAt } from '../hallLayout'
import { GlowText } from './GlowText'

/**
 * 把 UTS 铺满整个酒馆。
 *
 * 位置是按**走位**挑的，不是按墙面挑的：
 * 进门先踩到地面那个，抬头看见天花板那个，走向吧台看见招牌，
 * 站在中庭抬头看见三面挑台边缘的灯带，上楼梯每隔几级踏面亮一次。
 * 分散在动线上，才是"充满"而不是"贴了几张海报"。
 *
 * 全部是加色混合的透明贴图，**不占光源预算**，靠已有的 Bloom 起辉。
 *
 * 所有位置都刻意离开贴附面几厘米：共面会 z-fighting，
 * 而且它伪装成"贴图没生效"，查起来非常费劲（见 NOTES 里幕墙那节）。
 */

/** Building 11 幕墙那种绿。整个酒馆的 UTS 主色 */
const GREEN = '#3ef2a0'
/** 吧台招牌用暖色，和酒馆的烛光是一路的 */
const AMBER = '#ffb35a'
/** 中庭天花板用偏冷的青，抬头时和暖色的吊灯拉开层次 */
const CYAN = '#5ad6ff'

export function UtsDressing() {
  return (
    <group>
      {/* ---- 进门脚下：地面嵌字。玩家出生在 (0, 13.2)，第一眼就踩在上面 ---- */}
      <GlowText
        text="UTS"
        color={GREEN}
        width={3.4}
        tracking={2}
        position={[0, 0.035, 12.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        // 地面这块离玩家最近，全亮度会直接过曝成一块白
        opacity={0.6}
      />

      {/* ---- 中庭天花板：抬头才看得见，所以做大 ---- */}
      <GlowText
        text="UTS"
        color={CYAN}
        width={6.5}
        tracking={3}
        position={[0, HALL.height - 0.12, 2]}
        rotation={[Math.PI / 2, 0, 0]}
        opacity={0.7}
      />

      {/* ---- 吧台上方的霓虹招牌，斜体，像真的酒吧灯箱 ---- */}
      <GlowText
        text="UTS"
        color={AMBER}
        width={3.0}
        italic
        position={[-9.86, 2.75, 0.5]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* ---- 三面挑台边缘的灯带：站在一楼中庭抬头，围着你一圈 ---- */}
      <GlowText
        text="UTS"
        color={GREEN}
        width={11}
        repeat={5}
        position={[-4.92, FLOOR2_Y - SLAB / 2, -3]}
        rotation={[0, Math.PI / 2, 0]}
        opacity={0.8}
      />
      <GlowText
        text="UTS"
        color={GREEN}
        width={11}
        repeat={5}
        position={[4.92, FLOOR2_Y - SLAB / 2, -3]}
        rotation={[0, -Math.PI / 2, 0]}
        opacity={0.8}
      />
      <GlowText
        text="UTS"
        color={GREEN}
        width={8}
        repeat={4}
        position={[0, FLOOR2_Y - SLAB / 2, -10.52]}
        rotation={[0, 0, 0]}
        opacity={0.8}
      />

      {/* ---- 楼梯踏面：每隔几级亮一次，上楼时一级级点过去 ---- */}
      <StairMarks />

      {/* ---- 二楼挑台的地面，从下面走过时看不到，上去才发现 ---- */}
      <GlowText
        text="UTS"
        color={GREEN}
        width={2.2}
        tracking={2}
        position={[-7.4, FLOOR2_Y + 0.035, -6]}
        rotation={[-Math.PI / 2, 0, 0]}
        opacity={0.6}
      />
      <GlowText
        text="UTS"
        color={GREEN}
        width={2.2}
        tracking={2}
        position={[7.4, FLOOR2_Y + 0.035, -6]}
        rotation={[-Math.PI / 2, 0, 0]}
        opacity={0.6}
      />
    </group>
  )
}

/**
 * 楼梯踢面上的小字。
 *
 * 楼梯从南（低，z=12）往北（高，z=4）走，20 级。
 * 每 4 级放一个 —— 每级都放会糊成一片绿，反而看不出是字。
 */
function StairMarks() {
  const marks = []
  for (let i = 2; i < STAIRS.steps; i += 4) {
    const z = STAIRS.zBottom - ((STAIRS.zBottom - STAIRS.zTop) / STAIRS.steps) * i
    const y = stairHeightAt(z)
    marks.push(
      <GlowText
        key={i}
        text="UTS"
        color={GREEN}
        width={0.85}
        // 踢面朝南（+z）。往前挪 4 厘米，绝不和踢面共面
        position={[(STAIRS.x0 + STAIRS.x1) / 2, y + 0.085, z + 0.04]}
        rotation={[0, 0, 0]}
        opacity={0.9}
      />,
    )
  }
  return <>{marks}</>
}
