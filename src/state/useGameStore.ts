import { create } from 'zustand'
import { NUM_SEATS } from '../audio/amplitudes'

export type Player = {
  seat: number
  name: string
  /** 面具主色 */
  color: string
  isLocal: boolean
  isAI: boolean
}

type GameState = {
  players: Player[]
  /** 当前音量最大的座位，-1 表示无人说话。由 SpeakerTracker 低频写入 */
  speaking: number
  setSpeaking: (seat: number) => void
}

const PRESET: Omit<Player, 'seat'>[] = [
  { name: '你',     color: '#c9a227', isLocal: true,  isAI: false },
  { name: 'Foxy',   color: '#c1502e', isLocal: false, isAI: false },
  { name: 'Bristle',color: '#b9737d', isLocal: false, isAI: true  },
  { name: 'Toar',   color: '#4a5d63', isLocal: false, isAI: true  },
  { name: 'Scubby', color: '#7a5c3e', isLocal: false, isAI: false },
]

export const useGameStore = create<GameState>((set) => ({
  players: PRESET.slice(0, NUM_SEATS).map((p, seat) => ({ ...p, seat })),
  speaking: -1,
  setSpeaking: (seat) =>
    set((s) => (s.speaking === seat ? s : { speaking: seat })),
}))
