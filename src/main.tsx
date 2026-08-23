import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { usePlayerStore } from './state/usePlayerStore'
import { useGameStore } from './state/useGameStore'
import { useLobby } from './lobby/useLobby'
import { useCatan } from './catan/useCatan'
import { useDdz } from './ddz/useDdz'

/**
 * 开发期状态句柄。控制台里可以直接驱动和检查状态，比如：
 *   __dolos.player.getState().setEntered(true)
 *   __dolos.lobby.getState().createRoom({ name: '测试', game: 'ddz', password: null })
 *   __dolos.lobby.getState().start()
 * import.meta.env.DEV 保证它不会进生产包。
 */
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__dolos = {
    player: usePlayerStore,
    game: useGameStore,
    lobby: useLobby,
    catan: useCatan,
    ddz: useDdz,
    /** 一步跳进某个游戏。手动点四五下才能到牌桌，验证界面时太慢了 */
    play: (game: 'poker' | 'ddz' | 'catan') => {
      usePlayerStore.getState().setEntered(true)
      useLobby.getState().createRoom({ name: '调试房', game, password: null })
      useLobby.getState().start()
      return game
    },
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
