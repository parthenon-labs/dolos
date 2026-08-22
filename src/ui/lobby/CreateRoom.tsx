import { useState } from 'react'
import { GAMES, type GameId } from '../../games/registry'
import { useLobby } from '../../lobby/useLobby'
import { Glyph } from './Glyph'

/**
 * 建房间。
 *
 * 游戏在**建房的时候就定死**，而不是进了房再选 —— 大厅里那一行必须
 * 告诉别人这间打什么，不然点进去才发现不是自己想玩的，
 * 这是棋牌室大厅最讨人厌的一种体验。
 *
 * 只有三个字段：打什么、叫什么、要不要密码。人数由游戏决定，不给选。
 */
export function CreateRoom({ onClose }: { onClose: () => void }) {
  const create = useLobby((s) => s.createRoom)
  const [game, setGame] = useState<GameId>('ddz')
  const [name, setName] = useState('')
  const [locked, setLocked] = useState(false)
  const [password, setPassword] = useState('')

  const g = GAMES.find((x) => x.id === game)!
  const ok = !locked || password.length >= 1

  return (
    <div className="lb-modal-back" onClick={onClose}>
      <div className="lb-modal" onClick={(e) => e.stopPropagation()}>
        <h3>开一间房</h3>

        <div className="lb-field">
          <label>打什么</label>
          <div className="lb-gamepick">
            {GAMES.map((x) => (
              <button
                key={x.id}
                className={`lb-gamecard${game === x.id ? ' on' : ''}`}
                style={{ '--accent': x.accent } as React.CSSProperties}
                onClick={() => setGame(x.id)}
              >
                <span className="ic">
                  <Glyph id={x.id} size={30} />
                </span>
                <b>{x.name}</b>
                <em>
                  {x.players.min === x.players.max
                    ? `${x.players.max} 人`
                    : `${x.players.min}–${x.players.max} 人`}
                </em>
              </button>
            ))}
          </div>
          <p className="lb-tagline">{g.tagline}</p>
        </div>

        <div className="lb-field">
          <label>房间名</label>
          <input
            className="lb-input"
            maxLength={16}
            value={name}
            placeholder="你的房间"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="lb-field row">
          <label className="lb-check">
            <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
            <span>设个密码</span>
          </label>
          {locked && (
            <input
              className="lb-input short"
              maxLength={8}
              value={password}
              placeholder="四位数字"
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </div>

        <div className="lb-modal-foot">
          <button className="lb-btn lb-btn-ghost" onClick={onClose}>
            算了
          </button>
          <button
            className="lb-btn lb-btn-go"
            disabled={!ok}
            onClick={() => {
              create({ name, game, password: locked ? password : null })
              onClose()
            }}
          >
            开好了
          </button>
        </div>
      </div>
    </div>
  )
}
