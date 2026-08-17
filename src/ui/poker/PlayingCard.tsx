import { type Card, RANK_CHARS, SUIT_CHARS, isRed, rankOf, suitOf } from '../../poker/cards'

/**
 * 一张牌。
 *
 * 用 DOM 而不是图片：52 张牌的图集是资源、加载和授权三重麻烦，
 * 而扑克牌本来就是排版问题。
 *
 * 排版按真牌来：**信息在左上角**，中间那个大花色只是让人一眼认出花色。
 * 之前那版把点数放正中，看起来像字母卡片而不是扑克牌 ——
 * 差别听起来很小，但正是"像不像真东西"的全部。
 */
export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  dim = false,
  highlight = false,
  /** 轻微歪一点，摆在桌上才不像贴上去的 */
  tilt = 0,
}: {
  card?: Card
  faceDown?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  dim?: boolean
  highlight?: boolean
  tilt?: number
}) {
  const style = tilt ? { transform: `rotate(${tilt}deg)` } : undefined

  if (faceDown || card === undefined) {
    return <div className={`pcard back ${size}${dim ? ' dim' : ''}`} style={style} />
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
      style={style}
    >
      <span className="corner tl">
        <b>{r}</b>
        <i>{s}</i>
      </span>
      <span className="pip">{s}</span>
      <span className="corner br">
        <b>{r}</b>
        <i>{s}</i>
      </span>
    </div>
  )
}
