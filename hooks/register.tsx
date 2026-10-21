import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextUsage } from '../types'

const usage = atom({ plugin: 'context-meter', key: 'usage' } as const, null)

const fmtTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

const bar = (cells: number, percent: number): string => {
  const filled = Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)))
  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

const tone = (percent: number): 'success' | 'warning' | 'error' =>
  percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success'

const refresh = async ($: EngineInterface): Promise<void> => {
  const { context } = await $.session.usage()
  const value: ContextUsage = {
    tokens: context.tokens,
    window: context.window,
    percent: context.percent,
  }
  await update($, usage, () => value)
}

// 观察型刷新：失败时吞掉，绝不挡住会话本身的行为
const refreshQuiet = ($: EngineInterface): Promise<void> => refresh($).catch(() => {})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.ui.status(undefined) // 清掉 v1 遗留的固定状态行（只有显式 undefined 才移除）
    await refreshQuiet($)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await refreshQuiet($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await refreshQuiet($)
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    await refreshQuiet($)
    return result
  })

  // SessionMode 画在 prompt footer 右侧（模式标签的位置）——输入框下面、靠右下
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const ctx = await read($, usage)

    if (ctx === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const percent = Math.round(ctx.percent ?? 0)

    return (
      <Box>
        {e.props.modes.length > 0 ? <Text dimColor>{e.props.modes.join(' & ')} · </Text> : null}
        <Text dimColor>ctx </Text>
        <Text color={tone(percent)}>{bar(10, percent)}</Text>
        <Text dimColor tabular>
          {' '}
          {ctx.tokens === undefined ? '—' : fmtTokens(ctx.tokens)}/{fmtTokens(ctx.window)} {percent}%
        </Text>
      </Box>
    )
  })
}
