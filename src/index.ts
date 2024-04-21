import { startConnecting } from '../session-messenger/ts/mains/main_node'
import { ConversationTypeEnum } from '../session-messenger/ts/models/conversationAttributes'
import { ONSResolve } from '../session-messenger/ts/session/apis/snode_api/onsResolve'
import { getConversationController } from '../session-messenger/ts/session/conversations'
import { PubKey } from '../session-messenger/ts/session/types'
import { getOurPubKeyFromCache } from '../session-messenger/ts/session/utils/User'
import { initializeAttachmentLogic } from '../session-messenger/ts/types/MessageAttachment'
import { generateMnemonic, registerSingleDevice, signInByLinkingDevice } from '../session-messenger/ts/util/accountManager'
import path from 'path'
import fs from 'fs/promises'
import { v4 as uuid } from 'uuid'
import { Data } from '../session-messenger/ts/data/data'

let isInitialized = false,
  isInitializing = false,
  isAuthorized = false

// @ts-ignore
global.SBOT ??= {}

export async function initializeSession(options?: {
  verbose?: ('warn' | 'info' | 'error')[],
  ignoreNodeVersion?: boolean
  profileDataPath?: string
}) {
  if (isInitialized || isInitializing) return
  isInitializing = true

  if (options?.ignoreNodeVersion !== true) {
    const supportedVersions = ['v18.15.0']
    if (!supportedVersions.includes(process.version)) {
      throw new Error(`You're running Node.js with version ${process.version} which is not tested with session-nodejs-messenger. Please either use one of these versions: ${supportedVersions.join(', ')} or pass initializeSession({ ignoreNodeVersion: true }) at your own risk`)
    }
  }

  global.SBOT.verbose = options?.verbose ?? ['error']
  if (options?.profileDataPath) {
    let profileDataPath = options?.profileDataPath
    if (!profileDataPath.endsWith('/')) profileDataPath += '/'
    global.SBOT.profileDataPath = profileDataPath
  } else {
    global.SBOT.profileDataPath = './session-data'
  }
  
  await fs.mkdir(global.SBOT.profileDataPath, { recursive: true })

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
  attachments: Array<{ path: string } | { buffer: Buffer, filename?: string }> | undefined;
  quote: any | undefined;
  preview: any | undefined;
  groupInvitation: { url: string | undefined; name: string } | undefined;
}
export async function sendMessage(sessionID: string | PubKey, message: Partial<SessionOutgoingMessage> & { body: string }) {
  if(!isInitialized) {
    throw new Error('Session is not initialized')
  }
  if (!isAuthorized) {
    throw new Error('User is not authorized')
  }

  let attachments: Array<{ path: string }> | undefined
  if(message.attachments?.length) {
    await initializeAttachmentLogic()
    await Data.generateAttachmentKeyIfEmpty()
    for(const attachment of message.attachments) {
      let content: Buffer, filename: string
      if('path' in attachment && attachment.path) {
        try {
          content = await fs.readFile(attachment.path)
        } catch(e) {
          throw new Error('Couldn\'t read file: ' + attachment.path + ' ' + e.message)
        }
        filename = path.basename(attachment.path)
      } else if ('buffer' in attachment && attachment.buffer) {
        content = attachment.buffer
        filename = attachment.filename ?? uuid()
      } else {
        continue
      }

      const dirPath = path.join(global.SBOT.profileDataPath, 'attachments.noindex')
      const subdirName = uuid()
      const filePath = path.join(subdirName, filename)
      await fs.mkdir(path.join(dirPath, subdirName), { recursive: true })
      await fs.writeFile(path.join(dirPath, filePath), content)
      attachments ??= []
      attachments.push({ path: filePath })
    }
  }
  let retries = 0
  do {
    const conversationModel = await getConversationController()
      .getOrCreateAndWait(sessionID, ConversationTypeEnum.PRIVATE)
    if(conversationModel) {
      await conversationModel.sendMessage({ ...message, attachments })
      return
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

export async function resolveSessionIdByONSName(onsName: string) {
  return await ONSResolve.getSessionIDForOnsName(onsName)
}

export { EventEmitter } from './events'

export { downloadAttachment, downloadProfilePicture } from './files'

export const ONSNameRegex = ONSResolve.onsNameRegex