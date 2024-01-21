import { getConversationController } from '../ts/session/conversations'

let isInitialized = false

export async function initializeSession() {
  const { isReady } = await import('../ts/mains/main_node')
  await new Promise<void>(resolve => setInterval(() => {
    if(isReady) resolve()
  }, 100))
  isInitialized = true
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