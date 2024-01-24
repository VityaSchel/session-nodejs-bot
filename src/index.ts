import { startConnecting } from '../session-messenger/ts/mains/main_node'
import { getConversationController } from '../session-messenger/ts/session/conversations'
import { getOurPubKeyFromCache } from '../session-messenger/ts/session/utils/User'
import { generateMnemonic, registerSingleDevice, signInByLinkingDevice } from '../session-messenger/ts/util/accountManager'

let isInitialized = false,
  isInitializing = false,
  isAuthorized = false

// @ts-ignore
global.SBOT ??= {}

export async function initializeSession(options?: {
  verbose?: ('warn' | 'info' | 'error')[],
  profileDataPath?: string
}) {
  if (isInitialized || isInitializing) return
  isInitializing = true

  global.SBOT.verbose = options?.verbose ?? ['error']
  if (options?.profileDataPath) {
    let profileDataPath = options?.profileDataPath
    if (!profileDataPath.endsWith('/')) profileDataPath += '/'
    global.SBOT.profileDataPath = profileDataPath
  }

  const { getIsReady } = await import('../session-messenger/ts/mains/main_node')
  const state = await new Promise<{ isAuthorized: boolean }>(resolve => setInterval(() => {
    const state = getIsReady()
    if (state.isReady) resolve({ isAuthorized: state.isAuthorized })
  }, 10))

  isInitialized = true
  isInitializing = false
  isAuthorized = state.isAuthorized
}

export type SessionOutgoingMessage = {
  body: string;
  attachments: Array<any> | undefined;
  quote: any | undefined;
  preview: any | undefined;
  groupInvitation: { url: string | undefined; name: string } | undefined;
}
export async function sendMessage(sessionID: string, message: Partial<SessionOutgoingMessage> & { body: string }) {
  if(!isInitialized) {
    throw new Error('Session is not initialized')
  }
  if (!isAuthorized) {
    throw new Error('User is not authorized')
  }

  let retries = 0
  do {
    const conversationModel = getConversationController().get(sessionID)
    if(conversationModel) {
      await conversationModel.sendMessage(message)
      break
    } else {
      await new Promise(resolve => setTimeout(resolve, 100))
      retries++
    }
  } while(retries < 30)
  throw new Error('Error while resolving getConversationController')
}

export function getConversations() {
  if(!isInitialized) {
    throw new Error('Session is not initialized')
  }
  if (!isAuthorized) {
    throw new Error('User is not authorized')
  }

  return getConversationController().getConversations()
}

export function getSessionID() {
  if(!isInitialized) {
    throw new Error('Session is not initialized')
  }
  if (!isAuthorized) {
    throw new Error('User is not authorized')
  }

  return getOurPubKeyFromCache().key
}

export async function createIdentity(profileName: string) {
  if(!isInitialized) {
    throw new Error('Session is not initialized')
  }
  
  const mnemonic = await generateMnemonic()
  const sessionID = await registerSingleDevice(mnemonic, 'english', profileName)
  await new Promise(resolve => setTimeout(resolve, 1000))
  await startConnecting()
  isAuthorized = true

  return { mnemonic, sessionID }
}

export async function signIn(mnemonic: string) {
  if(!isInitialized) {
    throw new Error('Session is not initialized')
  }
  
  const sessionID = await signInByLinkingDevice(mnemonic, 'english')
  await new Promise(resolve => setTimeout(resolve, 1000))
  await startConnecting()
  isAuthorized = true

  return { sessionID }
}

export { EventEmitter } from './events'