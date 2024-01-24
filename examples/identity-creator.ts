import { initializeSession, createIdentity } from '../src'

async function main() {
  await initializeSession()
  const animals = ['capybara', 'lion', 'tiger', 'bear', 'panda', 'penguin', 'elephant', 'giraffe', 'zebra', 'hippo', 'rhino', 'monkey', 'gorilla', 'orangutan', 'lemur', 'sloth', 'koala', 'kangaroo', 'wombat', 'platypus', 'crocodile', 'alligator', 'snake', 'lizard', 'iguana', 'chameleon', 'turtle', 'tortoise', 'frog', 'toad', 'salamander', 'newt', 'axolotl', 'fish', 'shark', 'whale', 'dolphin', 'seal', 'otter', 'beaver', 'duck', 'goose', 'swan', 'flamingo', 'pigeon', 'parrot', 'owl', 'peacock', 'puffin', 'penguin', 'chicken', 'rooster', 'cow', 'pig', 'sheep', 'goat', 'horse', 'donkey', 'zebra', 'giraffe', 'elephant', 'rhino', 'hippo', 'lion', 'tiger', 'bear', 'wolf', 'fox', 'dog', 'cat', 'rabbit', 'hamster', 'mouse', 'rat', 'squirrel', 'chipmunk', 'guinea pig', 'chinchilla', 'hedgehog', 'ferret', 'gerbil', 'opossum', 'koala', 'kangaroo', 'wombat', 'platypus', 'crocodile', 'alligator', 'snake', 'lizard', 'iguana', 'chameleon', 'turtle', 'tortoise', 'frog', 'toad', 'salamander', 'newt', 'axolotl', 'fish', 'shark', 'whale', 'dolphin', 'seal', 'otter', 'beaver', 'duck', 'goose', 'swan', 'flamingo', 'pigeon', 'parrot', 'owl', 'peacock', 'puffin', 'penguin', 'chicken', 'rooster', 'cow', 'pig', 'sheep', 'goat', 'horse', 'donkey', 'zebra', 'giraffe', 'elephant', 'rhino', 'hippo', 'lion', 'tiger', 'bear', 'wolf', 'fox', 'dog', 'cat', 'rabbit', 'hamster', 'mouse', 'rat', 'squirrel', 'chipmunk', 'guinea pig', 'chinchilla', 'hedgehog', 'ferret', 'gerbil', 'opossum']
  const { sessionID } = await createIdentity(animals[Math.floor(Math.random() * animals.length)] + ' ' + Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
  console.log('Created', sessionID)
}

main()