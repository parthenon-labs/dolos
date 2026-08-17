import type { PlayerView, Role } from '../../game/types'
import { isEvil } from '../../game/types'
import type { Seat } from './types'

const ROLE_CN: Record<Role, string> = {
  merlin: '梅林',
  percival: '派西维尔',
  servant: '忠臣',
  assassin: '刺客',
  morgana: '莫甘娜',
  mordred: '莫德雷德',
  oberon: '奥伯伦',
  minion: '爪牙',
}

/**
 * 你自己的身份牌。
 *
 * 内容全部来自 `PlayerView.knowledge` —— 界面**没有**完整状态可读，
 * 所以就算写错也漏不出别人的身份。隐藏信息是靠投影在服务端就切干净的，
 * 不是靠前端克制。
 */
export function RoleCard({ view, seats }: { view: PlayerView | null; seats: Seat[] }) {
  if (!view) return null
  const evil = isEvil(view.myRole)
  const name = (i: number) => `${i + 1} 号 ${seats[i]?.name ?? ''}`

  return (
    <div className={'role-card ' + (evil ? 'evil' : 'good')}>
      <div className="role-head">
        <span className="side">{evil ? '坏人阵营' : '好人阵营'}</span>
        <b>{ROLE_CN[view.myRole]}</b>
      </div>

      {view.knowledge.seesEvil.length > 0 && (
        <div className="know">
          <span>{evil ? '你的同伙' : '你看到的坏人'}</span>
          <ul>
            {view.knowledge.seesEvil.map((i) => (
              <li key={i}>{name(i)}</li>
            ))}
          </ul>
        </div>
      )}

      {view.knowledge.seesMerlinOrMorgana.length > 0 && (
        <div className="know">
          {/* 派西维尔看到两个人但分不清谁是谁 —— 这个"分不清"是规则的一部分，
              界面必须原样传达，不能替玩家猜 */}
          <span>其中一个是梅林，另一个是莫甘娜</span>
          <ul>
            {view.knowledge.seesMerlinOrMorgana.map((i) => (
              <li key={i}>{name(i)}</li>
            ))}
          </ul>
        </div>
      )}

      {view.myRole === 'merlin' && (
        <p className="warn">别暴露自己 —— 好人赢三轮后刺客还有一次指认机会</p>
      )}
    </div>
  )
}
