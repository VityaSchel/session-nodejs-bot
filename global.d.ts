declare module globalThis {
  var SBOT = {
    ERASE_ATTACHMENTS_KEY: (event: any) => any,
    CLEANUP_ORPHANED_ATTACHMENTS_KEY: (event: any) => any,
    resetDatabase: () => any,
    passwordLogin: (passPhrase: string) => any,
    setPassword: (passPhrase: string, oldPhrase: string) => any,
    ready: () => any
  }
}