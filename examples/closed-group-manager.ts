import _ from 'lodash'
import { initializeSession, EventEmitter, sendMessage, createIdentity, getSessionID } from '../src'

async function main() {
  await initializeSession()
  // await createIdentity('test-bot-' + Math.random().toString(36).substring(7))
  console.log(getSessionID())
  const events = new EventEmitter()
  events.on('message', (message, conversation) => {
    if (message.dataMessage) {
      if (conversation.type === 'group') {
        sendMessage(conversation.id, {
          body: 'Hi, chat!',
        })
      } else {
        sendMessage(conversation.id, {
          body: 'I only work in groups ;)',
        })
      }
    }
  })
  await new Promise(resolve => setTimeout(resolve, 1000))
}

main()