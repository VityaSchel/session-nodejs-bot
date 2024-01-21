import { initializeSession, EventEmitter, sendMessage } from '../src'

async function main() {
  await initializeSession()
  const events = new EventEmitter()
  events.on('message', (message, conversation) => {
    if (message.dataMessage) {
      const text = message.dataMessage.body
      const regex = /^(\d+) ?(\+|\-|\/|\*) ?(\d+)$/
      if (text && regex.test(text)) {
        const [,firstNumber,operand,secondNumber] = text.match(regex)!
        const leftN = Number(firstNumber)
        const rightN = Number(secondNumber)
        if(Number.isSafeInteger(leftN) && Number.isSafeInteger(rightN)) {
          let result: number
          switch(operand) {
            case '+':
              result = leftN + rightN
              break
            case '-':
              result = leftN - rightN
              break
            case '*':
              result = leftN * rightN
              break
            case '/':
              result = leftN / rightN
              break
            default:
              break
          }
          sendMessage(conversation.id, {
            body: String(result!),
            attachments: undefined,
            quote: undefined,
            preview: undefined,
            groupInvitation: undefined
          })
        }
      }
    }
  })
}

main()

// await Data.getAllConversations()

// const convos = getConversationController().getConversations()
//   .filter(c => c.isPrivate() && c.isActive() && c.get('id'))

// console.log('Convos', convos.map(c => [c.getContactProfileNameOrShortenedPubKey(), c.toJSON().lastMessage]))