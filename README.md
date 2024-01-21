# Session Node.js Bot

Session fork that runs entirely inside Node.js without renderer such as Electron. Exports useful methods to easily build your own bots

[![Watch demo](https://img.youtube.com/vi/af7-DFSbFZ4/0.jpg)](https://www.youtube.com/watch?v=af7-DFSbFZ4)

- [Session Node.js Bot](#session-nodejs-bot)
- [WORK IN PROGRESS](#work-in-progress)
  - [Features](#features)
  - [Get started](#get-started)
  - [Examples](#examples)
    - [Calculator bot](#calculator-bot)
  - [Methods](#methods)
  - [API reference](#api-reference)
    - [initializeSession(options?: { verbose?: boolean }): Promise\<void\>](#initializesessionoptions--verbose-boolean--promisevoid)
    - [getConversations(): ConversationModel\[\]](#getconversations-conversationmodel)
    - [class EventEmitter](#class-eventemitter)
    - [sendMessage(sessionID: string, message: SessionOutgoingMessage): Promise\<void\>](#sendmessagesessionid-string-message-sessionoutgoingmessage-promisevoid)
  - [Usage](#usage)
    - [Get latest conversations](#get-latest-conversations)
    - [Subscribe to new messages](#subscribe-to-new-messages)
    - [Send message](#send-message)
  - [Contributing](#contributing)
  - [Donate](#donate)
  - [License](#license)

# WORK IN PROGRESS

Since there is zero documentation about swarms and zero help from Session developers, I've decided to fork session-desktop and try to split render from node instead of writing everything from scratch.

This is why this repository mustn't be used in production. It is basically fun side project for me with 90% dead, unreachable, untested, insecure code that may leak everything about you and break randomly. I have no idea how it works and I'm absolutely shocked I was able to make it run.

## Features

- Onion routing, connection to swarms
- Send messages to private chats
- Read private chats
- Subscribe to new messages (swarm polling)

## Get started

1. Follow official instructions on how to setup environment for Session development: <https://github.com/oxen-io/session-desktop/blob/unstable/CONTRIBUTING.md>
2. Once you've installed everythin (`yarn install --frozen-lockfile`) stop here, and then follow instructions from this repository:
3. Generate Session profile by using official up-to-date Session app on the same hardware. Then copy it to `session-data` directory. There should be files like `config.json` and directories like `attachments.noindex`
4. You can now start writing your code anywhere inside repository. Import useful methods from `src/index.ts` such as `initializeSession`. NPM publishing is in process
5. When you're ready for testing, run `yarn build` and `yarn start`. Please note that currently `yarn build` throws a lot of errors that you should ignore and note that it will return exit code 2, so simply running `yarn build && yarn start` **won't work**. Run commands separately or run `yarn build ; yarn start`

## Examples

### Calculator bot

Listens for private messages in the following format: `/^(\d+) ?(\+|\-|\/|\*) ?(\d+)$/` (examples: `2+2`, `4 - 10`, `100 / 5`, `5*5`)

Responds with the calculated answer

How to run: `yarn build ; node examples/calculator-bot.js`

## Methods

Since this is an early prototype that is in active development, there is no npm package yet. But there will be as soon as I debug everything and add install script that generates protobufs and builds native bindings.

Please be aware that this app generates A LOT of console logs. I'm working on reducing it, in stage of active development I need it to be able to at least have a smallest idea what's happening. Sorry for shit code 🙂

## API reference

### initializeSession(options?: { verbose?: boolean }): Promise\<void\>

Initialize Session instance in current Node.js process. Must be called and await'ed before using any Session-related methods. Must be only called once per Node.js process. If you need more instances running simultaniously, spawn Node.js children processes.

### getConversations(): ConversationModel[]

Get cached conversations. Keep in mind that this does not actually fetches anything from network, it just returns in-memory state that is updated with events.

### class EventEmitter

EventEmitter allows you to listen for events that happen inside Session instance.

List of events:
- `message`. Callback when a new incoming message found. Callback signature: `(content: SignalService.Content, conversation: ConversationModel) => any`

### sendMessage(sessionID: string, message: SessionOutgoingMessage): Promise\<void\>

Sends message to private chat

## Usage

### Get latest conversations

```ts
import { initializeSession, getConversations } from '../src'

async function main() {
  await initializeSession()
  const convos = getConversations()
    .filter(c => c.isPrivate() && c.isActive())

  console.log('Convos', convos.map(c => [c.getContactProfileNameOrShortenedPubKey()]))
}
```

You can use any methods available in the official `ConversationModel` type inferred from Session-desktop app such as `c.get('id')`, `conversationModel.isApproved()`, `conversationModel.isBlocked()` and others

### Subscribe to new messages

```ts
import { initializeSession, EventEmitter } from '../src'

async function main() {
  await initializeSession()
  const events = new EventEmitter()
  events.on('message', (message, conversation) => {
    if (message.dataMessage) {
      const text = message.dataMessage.body
      console.log('New message!', text)
    }
  })
}
```

### Send message

```ts
import { initializeSession, sendMessage } from '../src'

async function main() {
  await initializeSession()
  await sendMessage('05f7fe7bd047099e5266c2ffbc74c88fc8543e6f16a08575e96959fedb2dd74d54', {
    body: 'test!!! ' + new Date().toISOString(),
    attachments: undefined,
    quote: undefined,
    preview: undefined,
    groupInvitation: undefined,
  })
}
```

## Contributing

PRs are welcome! Feel free to help development.

## Donate

[Contact me in Telegram](https://t.me/hlothdev)

## License

[Session Desktop](https://github.com/oxen-io/session-desktop) is licensed under the GPLv3. Read more here: [https://github.com/oxen-io/session-desktop/blob/unstable/LICENSE]

My work is licensed under the [MIT](./LICENSE.md) license.

Both licenses allows you to use this project privately, commercially, modify, distribute, patent it. Both licenses state that neither Oxen nor me are responsible for any damages. 

Use this software wisely.