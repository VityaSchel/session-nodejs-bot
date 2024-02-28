import { initializeSession, EventEmitter, getSessionID, sendMessage } from '../src'

async function main() {
  await initializeSession()
  console.log('SessionID', getSessionID())

  const events = new EventEmitter()

  events.on('message', async (msg, convo) => {
    if (!msg.dataMessage) return

    await sendPhoto(convo.id, {
      text: 'Hello, this is a photo for you!',
      attachments: ['/Users/hloth/Downloads/alexey-navalny-hero-of-our-time.jpeg']
    })
  })
}

async function sendPhoto(sessionID: string, { text, attachments }: {
  text: string, attachments: string[]
}) {
  await sendMessage(sessionID, {
    body: text,
    attachments: attachments.map(att => ({ path: att }))
  })
}

main()