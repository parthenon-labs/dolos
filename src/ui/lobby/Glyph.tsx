import type { GameId } from '../../games/registry'

/**
 * 三个游戏各一个手画的标记。
 *
 * 用 SVG 而不是 emoji 或图片：三个标记必须是同一套线宽和同一种画法，
 * 否则摆在一起会像从三个地方抄来的。大厅里它们要在 22px 见方的
 * 小方块里认得出来，所以形体比细节重要。
 */
export function Glyph({ id, size = 22 }: { id: GameId; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  }
  if (id === 'poker')
    return (
      <svg {...common}>
        <rect x="6" y="8" width="12" height="17" rx="2.5" transform="rotate(-10 12 16)" />
        <rect x="14" y="7" width="12" height="17" rx="2.5" transform="rotate(10 20 15)" />
        <path d="M20 12.5l2.6 3.3-2.6 3.3-2.6-3.3z" fill="currentColor" stroke="none" />
      </svg>
    )
  if (id === 'ddz')
    return (
      <svg {...common}>
        <rect x="3" y="10" width="9" height="14" rx="2" transform="rotate(-14 7.5 17)" />
        <rect x="11.5" y="8" width="9" height="14" rx="2" />
        <rect x="20" y="10" width="9" height="14" rx="2" transform="rotate(14 24.5 17)" />
        <circle cx="16" cy="14" r="1.9" fill="currentColor" stroke="none" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M16 4l9 5.2v10.4L16 25l-9-5.4V9.2z" />
      <path d="M7 19.6L7 24l9 5 9-5v-4.4" />
      <path d="M16 14.6V29" />
      <path d="M7 9.2l9 5.4 9-5.4" />
    </svg>
  )
}
