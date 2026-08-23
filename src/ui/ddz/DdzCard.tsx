import { RANK_LABELS, SUIT_CHARS, isRed, isJoker, rankOf, suitOf, type Card } from '../../ddz/cards'

/**
 * 一张斗地主的牌。
 *
 * 沿用德州那边的 `.pcard`：**同一个酒馆里的牌应该长一样**，
 * 换个游戏换一套牌面会让人觉得进了另一个网站。
 *
 * 只有两处不同：
 * - 牌面多了 10 和双王，10 是两位数，角标要单独缩一号，不然会顶出去
 * - 斗地主的花色**不参与任何判定**，所以中间那个大花色改成小的、压暗，
 *   信息全部收进角标。捏成扇形时本来也只看得见角
 */
export function DdzCard({
  card,
  faceDown = false,
  size = 'md',
  selected = false,
  dim = false,
  onClick,
}: {
  card?: Card
  faceDown?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  selected?: boolean
  dim?: boolean
  onClick?: () => void
}) {
  if (faceDown || card === undefined)
    return <div className={`pcard back ${size}${dim ? ' dim' : ''}`} />

  const joker = isJoker(card)
  const label = joker ? (card === 53 ? '大' : '小') : RANK_LABELS[rankOf(card)]
  const cls =
    `pcard ddzcard ${size}` +
    (isRed(card) ? ' red' : '') +
    (joker ? ' joker' : '') +
    (label === '10' ? ' wide' : '') +
    (selected ? ' sel' : '') +
    (dim ? ' dim' : '') +
    (onClick ? ' clickable' : '')

  return (
    <div className={cls} onClick={onClick}>
      <span className="corner tl">
        <b>{label}</b>
        <i>{joker ? '王' : SUIT_CHARS[suitOf(card)]}</i>
      </span>
      <span className="pip">{joker ? '王' : SUIT_CHARS[suitOf(card)]}</span>
    </div>
  )
}

/** 一叠横排的牌，用在"某家刚出的牌"和底牌上 */
export function CardRow({
  cards,
  size = 'sm',
  overlap = 0.55,
}: {
  cards: Card[]
  size?: 'xs' | 'sm' | 'md' | 'lg'
  overlap?: number
}) {
  const w = { xs: 27, sm: 34, md: 42, lg: 54 }[size]
  return (
    <div className="cardrow" style={{ width: cards.length ? w + (cards.length - 1) * w * (1 - overlap) : 0 }}>
      {cards.map((c, i) => (
        <div
          key={c}
          // 逐张错开落下。整叠一起出现看不出"打了几张"，
          // 而张数正是斗地主里最要紧的信息
          style={{ left: i * w * (1 - overlap), animationDelay: `${i * 34}ms` }}
          className="cardrow-slot"
        >
          <DdzCard card={c} size={size} />
        </div>
      ))}
    </div>
  )
}
