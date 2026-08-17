import { FLOOR2_Y, SLAB, STAIRS } from '../hallLayout'
import { GlowEmblem } from './GlowEmblem'
import { GlowText } from './GlowText'

/**
 * 把 UTS 铺满整个酒馆。
 *
 * 位置是按**走位**挑的，不是按墙面挑的：
 * 进门先踩到地面那个，走向吧台看见招牌，站在中庭看见三面挑台边缘各一个徽记，
 * 上楼梯每隔四级踏面亮一次。分散在动线上，才是"充满"而不是"贴了几张海报"。
 *
 * **第二版做的是减法。** 天花板那个去掉了（抬头才看得见，存在感和占的面积不匹配），
 * 挑台从等距一整圈收成一边一个。铺得越满，眼睛越没有落点 ——
 * "充满"靠的是分散在动线上，不是靠密度。
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

/** 挑台边缘的中线高度 */
const EDGE_Y = FLOOR2_Y - SLAB / 2

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

      {/* ---- 吧台上方的霓虹招牌，斜体，像真的酒吧灯箱 ---- */}
      <GlowText
        text="UTS"
        color={AMBER}
        width={3.0}
        italic
        position={[-9.86, 2.75, 0.5]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/*
        三面挑台边缘各**一个**徽记，摆在正中。

        试过等距排一列（间距 2 米），结果整圈十几个，眼睛没有落点，
        只剩"这里有一堆绿色的东西"。一边一个反而像正经的标识：
        有主次，也留出了让墙面呼吸的地方。
      */}
      <GlowEmblem color={GREEN} size={0.46} position={[-4.88, EDGE_Y, -5.5]} rotation={[0, Math.PI / 2, 0]} opacity={0.9} />
      <GlowEmblem color={GREEN} size={0.46} position={[4.88, EDGE_Y, -5.5]} rotation={[0, -Math.PI / 2, 0]} opacity={0.9} />
      <GlowEmblem color={GREEN} size={0.46} position={[0, EDGE_Y, -10.48]} rotation={[0, 0, 0]} opacity={0.9} />

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
  /*
    用**台阶自己的几何**算位置，不要用 stairHeightAt。

    那个函数是一条连续斜坡，而楼梯是一级级离散的盒子，两者对不齐。
    这里直接抄 Mezzanine 里画台阶的那两行：
      第 i 级踏面中心 z = zBottom - i*run - run/2
      踏面顶      y = (i+1)*rise
  */
  const run = (STAIRS.zBottom - STAIRS.zTop) / STAIRS.steps
  const rise = FLOOR2_Y / STAIRS.steps
  const cx = (STAIRS.x0 + STAIRS.x1) / 2

  const marks = []
  for (let i = 2; i < STAIRS.steps; i += 4) {
    marks.push(
      <GlowEmblem
        key={i}
        color={GREEN}
        // 踏面进深只有 0.4 米。之前用 0.5，比踏面还深，
        // 于是被下一级挡掉一半 —— 就是"logo 只露出来一半"
        size={0.26}
        position={[cx, (i + 1) * rise + 0.02, STAIRS.zBottom - i * run - run / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        opacity={0.9}
      />,
    )
  }
  return <>{marks}</>
}
