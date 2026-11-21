/** 모델 하나의 누적 사용량 */
export type ModelTotal = {
  /** 새로 보낸 입력 토큰 */
  input: number
  /** 출력 토큰 */
  output: number
  /** 캐시에서 다시 읽은 입력 토큰 */
  cacheRead: number
  /** 캐시에 새로 쓴 입력 토큰 */
  cacheWrite: number
  /** 요청 수 */
  calls: number
  /** 그중 하위 세션(에이전트)이 쓴 토큰 합계 */
  subTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'token-band': { totals: Record<string, ModelTotal>; isOpen: boolean; since: number }
  }
}
