import { initializeSession } from '../src'

async function main() {
  await initializeSession()
  console.log('Initialized!')
}

main()

// await Data.getAllConversations()

// const convos = getConversationController().getConversations()
//   .filter(c => c.isPrivate() && c.isActive() && c.get('id'))

// console.log('Convos', convos.map(c => [c.getContactProfileNameOrShortenedPubKey(), c.toJSON().lastMessage]))