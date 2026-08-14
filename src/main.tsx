import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { usePlayerStore } from './state/usePlayerStore'
import { useGameStore } from './state/useGameStore'

/**
 * 开发期状态句柄。控制台里可以直接驱动和检查状态，比如：
 *   __dolos.player.getState().beginSit({ tableId: 't4', seat: 1 })
 *   __dolos.game.getState().occupancy
 * import.meta.env.DEV 保证它不会进生产包。
 */
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__dolos = {
    player: usePlayerStore,
    game: useGameStore,
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
