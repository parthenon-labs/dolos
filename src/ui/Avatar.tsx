/**
 * 2D 动物面具头像。
 *
 * 刻意和 3D 里的角色用同一套造型语言（圆头 + 吻部 + 两只耳朵 + 深色眼窝）
 * 和同一个颜色 —— 玩家从大厅切进对局界面时，**认人靠的是颜色和轮廓**，
 * 两边对不上的话每局开头都要重新建立"谁是谁"。
 *
 * 用 SVG 而不是图片：零资源、任意尺寸不糊、颜色直接由数据驱动。
 */
export function Avatar({
  color,
  size = 40,
  speaking = false,
  dim = false,
}: {
  color: string
  size?: number
  /** 正在说话，描边亮起 */
  speaking?: boolean
  /** 出局/未参与，压暗 */
  dim?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={`avatar${speaking ? ' speaking' : ''}${dim ? ' dim' : ''}`}
      style={{ ['--mask' as string]: color }}
      aria-hidden
    >
      {/* 耳朵先画，被头挡住一部分，省掉描边计算 */}
      <path d="M9 12 L12 3 L18 10 Z" fill={color} opacity={0.85} />
      <path d="M31 12 L28 3 L22 10 Z" fill={color} opacity={0.85} />
      <circle cx="20" cy="21" r="14" fill={color} />
      {/* 吻部 */}
      <ellipse cx="20" cy="29" rx="6.5" ry="5" fill={color} />
      <ellipse cx="20" cy="29" rx="6.5" ry="5" fill="#000" opacity={0.16} />
      {/* 眼窝：深色凹陷，和 3D 里同样的处理 */}
      <circle cx="14.6" cy="19" r="2.4" fill="#0b0908" />
      <circle cx="25.4" cy="19" r="2.4" fill="#0b0908" />
      <circle cx="20" cy="26.5" r="1.5" fill="#0b0908" opacity={0.75} />
    </svg>
  )
}
