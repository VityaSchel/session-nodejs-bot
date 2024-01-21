export const console = {
  log: (...args: any[]) => {
    global.SBOT?.verbose?.includes('info') && console.log(...args)
  },
  error: (...args: any[]) => {
    global.SBOT?.verbose?.includes('error') && console.error(...args)
  },
  warn: (...args: any[]) => {
    global.SBOT?.verbose?.includes('warn') && console.warn(...args)
  },
  info: (...args: any[]) => {
    global.SBOT?.verbose?.includes('info') && console.info(...args)
  },
  debug: (...args: any[]) => {
    global.SBOT?.verbose?.includes('info') && console.debug(...args)
  },
}