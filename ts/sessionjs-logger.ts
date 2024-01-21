export const console = {
  log: (...args: any[]) => {
    global.SBOT?.verbose && console.log(...args)
  },
  error: (...args: any[]) => {
    global.SBOT?.verbose && console.error(...args)
  },
  warn: (...args: any[]) => {
    global.SBOT?.verbose && console.warn(...args)
  },
  info: (...args: any[]) => {
    global.SBOT?.verbose && console.info(...args)
  },
  debug: (...args: any[]) => {
    global.SBOT?.verbose && console.debug(...args)
  },
}