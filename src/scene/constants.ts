import { NUM_SEATS } from '../audio/amplitudes'
import { TABLE_RADIUS } from './seats'

/** Room.tsx 需要知道座位数，从音频层复用同一个常量 */
export const NUM_SEATS_PLACEHOLDER = NUM_SEATS

/** 说话指示环的内外半径 + 分段数 */
export const ringGeomArgs: [number, number, number] = [0.17, 0.205, 32]

export { TABLE_RADIUS }
