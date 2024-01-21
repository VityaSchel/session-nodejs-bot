export const console = {
  log: (...args: any[]) => {
    global.SBOT?.verbose?.includes('info') && global.console.log('[Session]', ...args)
  },
  error: (...args: any[]) => {
    global.SBOT?.verbose?.includes('error') && global.console.error('[Session]', ...args)
  },
  warn: (...args: any[]) => {
    global.SBOT?.verbose?.includes('warn') && global.console.warn('[Session]', ...args)
  },
  info: (...args: any[]) => {
    global.SBOT?.verbose?.includes('info') && global.console.info('[Session]', ...args)
  },
  debug: (...args: any[]) => {
    global.SBOT?.verbose?.includes('info') && global.console.debug('[Session]', ...args)
  },
}