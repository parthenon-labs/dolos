import type { GameEvent } from '../game/types'
import { liveAnim, resetLiveAnim, useTableView } from '../state/useTableStore'
import { type Cue, easeInOutCubic, easeOutCubic, instant, tween, wait } from './cues'
import { gestureAll, gestureAt } from '../scene/character/rigRegistry'

/**
 * 把一条游戏事件翻译成一串动画 cue。
 *
 * 这个文件是**唯一**知道"某个事件长什么样"的地方。
 * 规则引擎不知道动画，动画不知道规则 —— 中间只有 GameEvent 这一层契约。
 * 将来事件从 WebSocket 来还是从本地引擎来，这里一行都不用改。
 *
 * 每条 cue 都必须在 onEnd 里把状态**落定到最终值**，
 * 而不是依赖 onUpdate 最后一帧刚好跑到 1 —— 队列加速或瞬时结算时
 * onUpdate 可能被跳过，只有 onEnd 保证执行。
 */
export function cuesFor(e: GameEvent, playerCount: number): Cue[] {
  const view = useTableView.getState()

  switch (e.t) {
    case 'started':
      return [instant('开局', () => { view.reset(); resetLiveAnim() })]

    case 'proposed':
      return [
        instant('清上一轮', () => {
          view.set({ votes: [], questReveal: null })
          liveAnim.voteFlip = 0
          liveAnim.questFlip = 0
        }),
        instant('记下提名', () => {
          view.set({ proposedBy: e.leader, proposedTeam: e.team, proposeReveal: 0 })
          // 队长指向被提名的人 —— 光靠桌面高亮，玩家得低头找是谁提的
          gestureAt(e.leader, 'point')
        }),
        // 队员逐个亮起而不是一起亮 —— 让人来得及看清是谁
        tween(
          '提名亮起',
          0.15 * e.team.length + 0.25,
          (t) => { liveAnim.proposeReveal = easeOutCubic(t) },
          () => { liveAnim.proposeReveal = 1; view.set({ proposeReveal: 1 }) },
        ),
        wait('看一眼', 0.5),
      ]

    case 'voted': {
      const votes = e.votes
      return [
        instant('发票', () =>
          view.set({ votes: votes.map(() => 'hidden' as const), voteFlip: 0 }),
        ),
        wait('屏息', 0.55),
        // 全部同时翻 —— 阿瓦隆的表决是公开且同时的，逐个翻会误导成有先后
        tween(
          '翻票',
          0.7,
          (t) => { liveAnim.voteFlip = easeInOutCubic(t) },
          () => {
            liveAnim.voteFlip = 1
            view.set({ votes: votes.slice(), voteFlip: 1 })
          },
        ),
        wait('看结果', 1.4),
      ]
    }

    case 'vote_failed':
      return [
        instant('收票', () => {
          view.set({ votes: [], proposedTeam: [], proposedBy: null, voteFlip: 0 })
          liveAnim.voteFlip = 0
          liveAnim.proposeReveal = 0
        }),
        wait('换队长', 0.35),
      ]

    case 'quest_played': {
      const team = useTableView.getState().proposedTeam.slice()
      return [
        instant('起飞', () => {
          gestureAll(team, 'place')
          liveAnim.flight.clear()
          for (const s of team) liveAnim.flight.set(s, 0)
          view.set({ questFlight: team.map((seat) => ({ seat, t: 0 })) })
        }),
        tween(
          '牌飞向中央',
          0.85,
          (t) => {
            const k = easeInOutCubic(t)
            for (const s of team) liveAnim.flight.set(s, k)
          },
          () => { for (const s of team) liveAnim.flight.set(s, 1) },
        ),
        wait('停顿', 0.45),
        instant('准备揭晓', () =>
          view.set({
            questReveal: { fails: e.fails, success: e.success },
            questFlip: 0,
          }),
        ),
        tween(
          '揭晓',
          0.6,
          (t) => { liveAnim.questFlip = easeOutCubic(t) },
          () => { liveAnim.questFlip = 1; view.set({ questFlip: 1 }) },
        ),
        wait('消化', 1.8),
        instant('收拾桌面', () => {
          liveAnim.flight.clear()
          view.set({
            questFlight: [],
            proposedTeam: [],
            proposedBy: null,
            votes: [],
          })
          liveAnim.proposeReveal = 0
          liveAnim.voteFlip = 0
        }),
      ]
    }

    case 'assassinated':
      return [
        // 刺杀是全局唯一的高潮，节奏要慢下来
        tween(
          '灯光压暗',
          0.9,
          (t) => { liveAnim.dim = easeInOutCubic(t) * 0.85 },
          () => { liveAnim.dim = 0.85; view.set({ dim: 0.85 }) },
        ),
        instant('锁定目标', () => {
          view.set({ assassinTarget: e.target, assassinResult: null, assassinFocus: 0 })
          gestureAt(e.target, 'recline')
        }),
        tween(
          '聚焦',
          0.7,
          (t) => { liveAnim.assassinFocus = easeOutCubic(t) },
          () => { liveAnim.assassinFocus = 1; view.set({ assassinFocus: 1 }) },
        ),
        wait('悬着', 1.3),
        instant('揭晓身份', () =>
          view.set({ assassinResult: e.wasMerlin ? 'hit' : 'miss' }),
        ),
        wait('定格', 2.2),
      ]

    case 'ended':
      return [
        wait('留白', 0.4),
        // 一定要把刺杀焦点也收掉。只清 dim 的话那道光柱会永远留在桌上 ——
        // 每个"进入某个戏剧状态"的 cue 都必须有对应的退出 cue，
        // 否则最后一幕会粘在屏幕上。
        tween(
          '收灯',
          0.8,
          (t) => {
            liveAnim.dim = 0.85 * (1 - t)
            liveAnim.assassinFocus = 1 - t
          },
          () => {
            liveAnim.dim = 0
            liveAnim.assassinFocus = 0
            view.set({
              dim: 0,
              assassinFocus: 0,
              assassinTarget: null,
              assassinResult: null,
            })
          },
        ),
      ]

    // 发言不占动画时间：它是 HUD 上的字幕，不该阻塞牌桌节奏。
    // 但身体动作要立刻发生 —— 排队等前一段动画播完再前倾，就对不上话了。
    case 'speech':
      gestureAt(e.player, 'lean')
      return []
  }

  // 穷尽了所有分支，但保留兜底，防止将来加事件时忘了这里
  void playerCount
  return []
}
