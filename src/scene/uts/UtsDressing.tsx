import { FLOOR2_Y, HALL, SLAB, STAIRS, stairHeightAt } from '../hallLayout'
import { GlowEmblem } from './GlowEmblem'
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

      {/* ---- 三面挑台边缘：一排徽记。
             原来是 `UTS · UTS · UTS` 的字带，密密麻麻反而像贴纸；
             徽记有轮廓、间隔开，远看是一串灯，近看认得出图案 ---- */}
      <EmblemRail axis="x" at={-4.9} from={-14.2} to={3.2} facing={1} />
      <EmblemRail axis="x" at={4.9} from={-14.2} to={3.2} facing={-1} />
      <EmblemRail axis="z" at={-10.5} from={-4.2} to={4.2} facing={1} />

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
      <GlowEmblem
        key={i}
        color={GREEN}
        size={0.5}
        /*
          **平躺在踏面上**，不是贴在踢面上。

          试过贴踢面，结果被踏面挡得几乎看不见：楼梯是一级级离散的台阶，
          而 `stairHeightAt` 是一条连续斜坡函数，两者对不齐 ——
          按斜坡算出来的高度落不到实际那块踢面上。
          平躺在踏面上就没有这个问题，而且上楼时视线本来就朝下，反而更显眼。
        */
        position={[(STAIRS.x0 + STAIRS.x1) / 2, y + 0.025, z]}
        rotation={[-Math.PI / 2, 0, 0]}
        opacity={0.9}
      />,
    )
  }
  return <>{marks}</>
}

/**
 * 挑台边缘等距排一列徽记。
 *
 * 间距 2 米：太密会连成一条光带、看不出是图案，太疏就撑不起"围了一圈"的感觉。
 */
function EmblemRail({
  axis,
  at,
  from,
  to,
  facing,
}: {
  /** 沿哪个轴铺开 */
  axis: 'x' | 'z'
  /** 另一个轴上的固定坐标 */
  at: number
  from: number
  to: number
  /** 朝向：+1 面向正方向，-1 面向负方向 */
  facing: 1 | -1
}) {
  const step = 2.0
  const n = Math.max(1, Math.floor((to - from) / step))
  const rot: [number, number, number] =
    axis === 'x'
      ? [0, (Math.PI / 2) * facing, 0]
      : [0, facing === 1 ? 0 : Math.PI, 0]

  return (
    <>
      {Array.from({ length: n + 1 }, (_, i) => {
        const t = from + ((to - from) / n) * i
        const pos: [number, number, number] =
          axis === 'x'
            ? [at + 0.02 * facing, FLOOR2_Y - SLAB / 2, t]
            : [t, FLOOR2_Y - SLAB / 2, at + 0.02 * facing]
        return (
          <GlowEmblem key={i} color={GREEN} size={0.34} position={pos} rotation={rot} opacity={0.85} />
        )
      })}
    </>
  )
}
