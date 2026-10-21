export type ContextUsage = {
  tokens?: number
  window: number
  percent?: number
}

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { usage: ContextUsage | null }
  }
}
