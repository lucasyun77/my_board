import { expect, test } from 'claude-code/testing'

import { describe as name, korNum, rows } from '../hooks/register'

const BAND = { plugin: 'token-band', component: 'AbovePrompt', props: { hasSurvey: false, isCollapsed: false, isWorking: false } } as const

test('모델 이름과 수를 한국어로 적는다', async () => {
  expect(name('claude-opus-5-5').name).toBe('클로드 오퍼스 5.5')
  expect(name('claude-sonnet-4-5-20250929').name).toBe('클로드 소넷 4.5')
  expect(name('claude-haiku-5-5').name).toBe('클로드 하이쿠 5.5')
  expect(name('gemini-3-pro').group).toBe('gemini')
  expect(name('gpt-5-codex').group).toBe('codex')
  expect(korNum(3120000)).toBe('312만')
  expect(korNum(45000)).toBe('4.5만')
  expect(korNum(980)).toBe('980')
  const z = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, subTokens: 0 }
  const list = rows({ 'claude-opus-5-5': { ...z, input: 10, output: 5, calls: 1 }, 'claude-sonnet-5-5': { ...z, input: 1, calls: 1 } })
  expect(list.map(r => r.name)).toEqual(['클로드 오퍼스 5.5', '클로드 소넷 5.5', '코덱스', '재미나이'])
})

test('띠가 모든 화면에서 그려지고 자세히 단추로 펼쳐진다', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [], cost: { usd: 3.21 } } as never }))
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /토큰 사용량/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /코덱스 쓰지 않음/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /3\.2달러/ })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /열쇠·연결 없음/ })).toBeDefined()
  await ui.unmount()
})
