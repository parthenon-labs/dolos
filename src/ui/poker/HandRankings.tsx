import { parseCards } from '../../poker/cards'
import { PlayingCard } from './PlayingCard'

/**
 * 牌型速查。
 *
 * 新手在牌桌上最常问的一句就是"同花和顺子谁大"。
 * 这个问题**不应该逼人去开浏览器搜**，也不该只写一行文字 ——
 * 直接把牌摆出来，一眼就能对上号。
 *
 * 顺序从大到小，和引擎里的 category 编号一致（8 → 0）。
 * 两边如果哪天不一致，是这里错，不是引擎错。
 */
const RANKINGS: { name: string; cards: string; note: string }[] = [
  { name: '同花顺', cards: 'Ts Js Qs Ks As', note: '同一花色的五张连牌。最大的叫皇家同花顺' },
  { name: '四条', cards: '9s 9h 9d 9c 2s', note: '四张同点数' },
  { name: '葫芦', cards: 'Ks Kh Kd 2s 2h', note: '三条 + 一对' },
  { name: '同花', cards: '2s 5s 9s Js Ks', note: '五张同花色，不必连续' },
  { name: '顺子', cards: '5h 6d 7s 8c 9h', note: '五张连续，花色不限。A 可当 1 也可当最大' },
  { name: '三条', cards: '7s 7h 7d 2s 5h', note: '三张同点数' },
  { name: '两对', cards: 'Js Jh 4d 4c 9s', note: '两个对子' },
  { name: '一对', cards: 'As Ah 2d 5c 9s', note: '两张同点数' },
  { name: '高牌', cards: 'As Kh 9d 7c 4s', note: '什么都没成，比最大的那张' },
]

export function HandRankings({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>牌型大小</h2>
          <span className="sub">从大到小 · 五张牌里取最好的组合</span>
          <button className="ghost-btn" onClick={onClose}>
            关闭
          </button>
        </header>

        <ol className="rank-list">
          {RANKINGS.map((r, i) => (
            <li key={r.name}>
              <span className="no">{i + 1}</span>
              <div className="cards">
                {parseCards(r.cards).map((c, k) => (
                  <PlayingCard key={k} card={c} size="xs" />
                ))}
              </div>
              <div className="meta">
                <b>{r.name}</b>
                <span>{r.note}</span>
              </div>
            </li>
          ))}
        </ol>

        <footer>
          <p>
            <b>同样牌型怎么比？</b>先比主要点数，再比剩下的牌（叫「踢脚」）。
            比如两家都是一对 A，就看第三张谁大；全部一样才平分底池。
          </p>
          <p>
            <b>你的七张牌</b>是两张底牌 + 五张公共牌，
            系统会自动从中挑出最好的五张，不用你自己选。
          </p>
        </footer>
      </div>
    </div>
  )
}

/**
 * 一局的流程说明。和牌型分开，因为它们解决的是两个不同的困惑：
 * "谁大" 和 "现在该干嘛"。
 */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>一手牌怎么打</h2>
          <span className="sub">德州扑克 · 无上限下注</span>
          <button className="ghost-btn" onClick={onClose}>
            关闭
          </button>
        </header>

        <ol className="flow">
          <li>
            <b>发底牌</b>
            <span>每人两张，只有自己看得见。庄家左手两位先交小盲、大盲（强制下注）</span>
          </li>
          <li>
            <b>翻牌前</b>
            <span>第一轮下注。想继续就至少跟到大盲，不想玩就弃牌</span>
          </li>
          <li>
            <b>翻牌</b>
            <span>桌面翻开三张公共牌，所有人共用。第二轮下注</span>
          </li>
          <li>
            <b>转牌 / 河牌</b>
            <span>各再翻一张，各一轮下注。公共牌一共五张</span>
          </li>
          <li>
            <b>摊牌</b>
            <span>没弃牌的人亮牌，七张里取最好的五张，最大的赢走底池</span>
          </li>
        </ol>

        <footer>
          <p>
            <b>弃牌 / 过牌 / 跟注 / 加注</b>——
            没人下注时可以「过牌」免费看下一张；有人下注了，就只能跟、加，或者弃牌认输。
          </p>
          <p>
            <b>全下</b>是把手上全部筹码推出去。筹码不够跟注时也算全下，
            这时你只能赢走对手中和你投入等额的那部分，多出来的会形成「边池」。
          </p>
        </footer>
      </div>
    </div>
  )
}
