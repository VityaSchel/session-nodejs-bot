import { getConversationController } from '../ts/session/conversations'

let isInitialized = false,
  isInitializing = false

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

  const { getIsReady } = await import('../ts/mains/main_node')
  await new Promise<void>(resolve => setInterval(() => {
    if (getIsReady()) resolve()
  }, 10))

  isInitialized = true
  isInitializing = false
}

export type SessionOutgoingMessage = {
  body: string;
  attachments: Array<any> | undefined;
  quote: any | undefined;
  preview: any | undefined;
  groupInvitation: { url: string | undefined; name: string } | undefined;
}
export async function sendMessage(sessionID: string, message: SessionOutgoingMessage) {
  if(!isInitialized) {
    throw new Error('Session is not initialized')
  }

  const conversationModel = getConversationController().get(sessionID)
  await conversationModel.sendMessage(message)
}

export function getConversations() {
  if(!isInitialized) {
    throw new Error('Session is not initialized')
  }

  return getConversationController().getConversations()
}

export { EventEmitter } from './events'