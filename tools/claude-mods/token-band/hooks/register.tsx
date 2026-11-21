// 토큰 사용량 띠: 마더 세션 채팅창(입력칸) 위에 모델별 토큰 사용량을 보여 준다.
// 메인 세션과 하위 세션(에이전트)이 AI에 보내는 요청 한 건마다 응답에 실린 사용량을 모델별로 더한다.
// 코덱스·재미나이도 자리를 두고, 이 세션에서 쓰이지 않았으면 「쓰지 않음」으로 보인다.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { ModelTotal } from '../types'

const totals = atom({ plugin: 'token-band', key: 'totals' } as const, {} as Record<string, ModelTotal>)
const isOpen = atom({ plugin: 'token-band', key: 'isOpen' } as const, false)
const since = atom({ plugin: 'token-band', key: 'since' } as const, 0)

type Group = 'claude' | 'codex' | 'gemini' | 'other'

/** 모델 아이디 → 한국어 이름과 묶음 */
export function describe(id: string): { group: Group; name: string } {
  const s = id.toLowerCase()
  const m = s.match(/(\d+)[-.](\d{1,2})(?!\d)/) ?? s.match(/-(\d{1,2})(?:$|-)/)
  const v = m ? (m[2] !== undefined ? `${m[1]}.${m[2]}` : m[1]) : ''
  const named = (k: string) => `${k}${v ? ' ' + v : ''}`
  if (s.includes('opus')) return { group: 'claude', name: named('클로드 오퍼스') }
  if (s.includes('sonnet')) return { group: 'claude', name: named('클로드 소넷') }
  if (s.includes('haiku')) return { group: 'claude', name: named('클로드 하이쿠') }
  if (s.includes('fable')) return { group: 'claude', name: named('클로드 페이블') }
  if (s.includes('mythos')) return { group: 'claude', name: named('클로드 미토스') }
  if (s.includes('claude')) return { group: 'claude', name: '클로드' }
  if (s.includes('gemini')) return { group: 'gemini', name: '재미나이' }
  if (s.includes('codex') || s.includes('gpt') || /^o\d/.test(s)) return { group: 'codex', name: '코덱스' }
  return { group: 'other', name: id }
}

/** 큰 수를 한국어 단위로: 3120000 → 312만 */
export function korNum(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 1e9 ? 0 : 1).replace(/\.0$/, '')}억`
  if (n >= 1e4) return `${(n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '')}만`
  return n.toLocaleString('ko-KR')
}

const sum = (t: ModelTotal) => t.input + t.output + t.cacheRead + t.cacheWrite
const zero: ModelTotal = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, subTokens: 0 }

/** 같은 이름(예: 같은 모델의 날짜만 다른 아이디)끼리 묶어서 줄 목록으로 */
export function rows(all: Record<string, ModelTotal>): { name: string; group: Group; t: ModelTotal }[] {
  const by = new Map<string, { name: string; group: Group; t: ModelTotal }>()
  for (const [id, t] of Object.entries(all)) {
    const d = describe(id)
    const prev = by.get(d.name)?.t ?? zero
    by.set(d.name, {
      ...d,
      t: {
        input: prev.input + t.input, output: prev.output + t.output, cacheRead: prev.cacheRead + t.cacheRead,
        cacheWrite: prev.cacheWrite + t.cacheWrite, calls: prev.calls + t.calls, subTokens: prev.subTokens + t.subTokens,
      },
    })
  }
  const list = [...by.values()].sort((a, b) => sum(b.t) - sum(a.t))
  for (const [group, name] of [['codex', '코덱스'], ['gemini', '재미나이']] as const) {
    if (!list.some(r => r.group === group)) list.push({ name, group, t: zero })
  }
  return list
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if ((await read($, since)) === 0) await update($, since, () => Date.now())
    return next(e)
  })

  // 요청 한 건이 끝날 때마다 사용량을 더한다(메인·하위 세션 모두)
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r?.usage
    if (u) {
      const tokens = u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await update($, totals, all => {
        const o = all[u.model] ?? zero
        return {
          ...all,
          [u.model]: {
            input: o.input + u.input_tokens,
            output: o.output + u.output_tokens,
            cacheRead: o.cacheRead + u.cache_read_input_tokens,
            cacheWrite: o.cacheWrite + u.cache_creation_input_tokens,
            calls: o.calls + 1,
            subTokens: o.subTokens + (e.agentId ? tokens : 0),
          },
        }
      })
    }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = rows(await read($, totals))
    const open = await read($, isOpen)
    const usd = (await $.session.usage()).cost?.usd
    const cost = usd === undefined ? '' : ` · 세션 추정 비용 약 ${usd.toFixed(1)}달러`

    const chip = (r: (typeof list)[number]) => {
      const n = sum(r.t)
      const shortName = r.name.replace('클로드 ', '')
      return n === 0 ? `${shortName} 쓰지 않음` : `${shortName} ${korNum(n)}`
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>토큰 사용량 </Text>
          <Text>{list.map(chip).join(' · ')}</Text>
          <Text dimColor>{cost} </Text>
          <Button key="toggle" label={open ? '접기' : '자세히'} onPress={() => update($, isOpen, v => !v)} />
        </Box>
        {open
          ? list.map(r => (
              <Text key={r.name} dimColor={sum(r.t) === 0}>
                {sum(r.t) === 0
                  ? `  ${r.name}: 이 세션에서 쓰지 않음${r.group === 'codex' || r.group === 'gemini' ? ' (이 작업 환경에 열쇠·연결 없음)' : ''}`
                  : `  ${r.name}: 합계 ${korNum(sum(r.t))} = 입력 ${korNum(r.t.input)} + 출력 ${korNum(r.t.output)} + 캐시 읽기 ${korNum(r.t.cacheRead)} + 캐시 쓰기 ${korNum(r.t.cacheWrite)} · 요청 ${r.t.calls}회 · 그중 하위 세션 ${korNum(r.t.subTokens)}`}
              </Text>
            ))
          : null}
        {open ? <Text dimColor>  이 띠를 켠 뒤부터 센 값입니다. 비용은 추정이며 청구서가 아닙니다.</Text> : null}
      </Box>
    )
  })
}
