import { type Card, RANK_CHARS, SUIT_CHARS, isRed, rankOf, suitOf } from '../../poker/cards'

/**
 * 一张牌。
 *
 * 用 DOM 而不是图片：52 张牌的图集是资源、加载和授权三重麻烦，
 * 而扑克牌本来就是排版问题 —— 字号和位置对了就好看。
 * 缺点是不能做花哨的牌背花纹，值得。
 */
export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  dim = false,
  highlight = false,
}: {
  card?: Card
  faceDown?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** 弃牌/未参与，压暗 */
  dim?: boolean
  /** 摊牌时构成最佳五张的牌 */
  highlight?: boolean
}) {
  if (faceDown || card === undefined) {
    return <div className={`pcard back ${size}${dim ? ' dim' : ''}`} />
  }
  const r = RANK_CHARS[rankOf(card) - 2]
  const s = SUIT_CHARS[suitOf(card)]
  return (
    <div
      className={
        `pcard ${size}` +
        (isRed(card) ? ' red' : '') +
        (dim ? ' dim' : '') +
        (highlight ? ' hi' : '')
      }
    >
      <span className="r">{r}</span>
      <span className="s">{s}</span>
    </div>
  )
}
