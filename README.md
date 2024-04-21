# Session Node.js Client

Headless Session messenger instance that runs entirely inside Node.js without renderer such as Electron. Use it in your bots as a NPM module (2.1MB).

Watch demo on YouTube:

[![Watch demo](https://img.youtube.com/vi/af7-DFSbFZ4/0.jpg)](https://www.youtube.com/watch?v=af7-DFSbFZ4)

- [Session Node.js Client](#session-nodejs-client)
- [WORK IN PROGRESS](#work-in-progress)
- [Session Bots directory](#session-bots-directory)
  - [Features](#features)
  - [Installation](#installation)
  - [Building from source](#building-from-source)
  - [Usage](#usage)
    - [Get latest conversations](#get-latest-conversations)
    - [Subscribe to new messages](#subscribe-to-new-messages)
    - [Send message](#send-message)
  - [Examples](#examples)
    - [Calculator bot](#calculator-bot)
    - [Anonymous chat (chat with random strangers bot)](#anonymous-chat-chat-with-random-strangers-bot)
    - [Working with files (attachments)](#working-with-files-attachments)
  - [Methods](#methods)
  - [API reference](#api-reference)
    - [initializeSession(options?: { verbose?: ('warn' | 'info' | 'error')\[\], profileDataPath?: string, ignoreNodeVersion?: boolean }): Promise\<void\>](#initializesessionoptions--verbose-warn--info--error-profiledatapath-string-ignorenodeversion-boolean--promisevoid)
    - [getConversations(): ConversationModel\[\]](#getconversations-conversationmodel)
    - [class EventEmitter](#class-eventemitter)
    - [sendMessage(sessionID: string, message: SessionOutgoingMessage): Promise\<void\>](#sendmessagesessionid-string-message-sessionoutgoingmessage-promisevoid)
    - [getSessionID(): string](#getsessionid-string)
    - [createIdentity(profileName: string): Promise\<{ mnemonic: string, sessionID: string }\>](#createidentityprofilename-string-promise-mnemonic-string-sessionid-string-)
    - [signIn(mnemonic: string): Promise\<{ sessionID: string }\>](#signinmnemonic-string-promise-sessionid-string-)
    - [resolveSessionIdByONSName(onsName: string): Promise\<string\>](#resolvesessionidbyonsnameonsname-string-promisestring)
    - [downloadAttachment(attachment: signalservice.IAttachmentPointer | AttachmentPointerWithUrl): Promise\<Buffer\>](#downloadattachmentattachment-signalserviceiattachmentpointer--attachmentpointerwithurl-promisebuffer)
    - [downloadProfilePicture(profilePicture: string, profileKey: Uint8Array): Promise\<Buffer\>](#downloadprofilepictureprofilepicture-string-profilekey-uint8array-promisebuffer)
  - [Contributing](#contributing)
  - [Donate](#donate)
  - [License](#license)

Subscribe to the official [Telegram channel](https://t.me/session_nodejs)

# WORK IN PROGRESS

Since there is zero documentation about swarms and zero help from Session developers, I've decided to fork session-desktop and try to split render from node instead of writing everything from scratch.

This is why this repository mustn't be used in production. It is basically fun side project for me with 90% dead, unreachable, untested, insecure code that may leak everything about you and break randomly. I have no idea how it works and I'm absolutely shocked I was able to make it run.

# Session Bots directory

I'm planning to release sessions bots directory website with automatic checks and moderation in the following few days. Once I'm done, there will be a link to it so you can add your own bots there and discover others!

## Features

- Onion routing, connection to swarms
- Send messages to private chats
- Read private chats
- Subscribe to new messages (swarm polling)

## Installation

```
Please note that Session requires exactly `18.15.0` version of Node.js to be used. Install it with nvm and use in your project. If you can't use it, spawn node.js process and run Session instance in it.
```

Using npm:
```
npm i session-messenger-nodejs && npm i -D @types/backbone
```

Using pnpm:
```
pnpm i session-messenger-nodejs && pnpm i -D @types/backbone
```

## Building from source

1. Follow official instructions on how to setup environment for Session development: <https://github.com/oxen-io/session-desktop/blob/unstable/CONTRIBUTING.md>
2. Once you've installed everything (`yarn install --frozen-lockfile`) stop here, and then follow instructions from this repository:
3. Generate Session profile by using official up-to-date Session app on the same hardware. Then copy it to `session-data` directory. There should be files like `config.json` and directories like `attachments.noindex`
4. You can now start writing your code anywhere inside repository. Import useful methods from `src/index.ts` such as `initializeSession`. NPM publishing is in process
5. When you're ready for testing, run `yarn build` and `yarn start`. Please note that currently `yarn build` throws a lot of errors that you should ignore and note that it will return exit code 2, so simply running `yarn build && yarn start` **won't work**. Run commands separately or run `yarn build ; yarn start`

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
import { initializeSession, EventEmitter } from 'session-messenger-nodejs'

async function main() {
  await initializeSession()
  const events = new EventEmitter()
  events.on('message', (message, { conversation, id, timestamp }) => {
    if (message.dataMessage) {
      const text = message.dataMessage.body
      console.log('New message!', id, text, 'from', conversation.type, conversation.id, 'sent at', timestamp)
    }
  })
}

main()
```

### Send message

```ts
import { initializeSession, sendMessage } from 'session-messenger-nodejs'

async function main() {
  await initializeSession()
  await sendMessage('05f7fe7bd047099e5266c2ffbc74c88fc8543e6f16a08575e96959fedb2dd74d54', {
    body: 'test!!! ' + new Date().toISOString(),
  })
}

main()
```

## Examples

### Calculator bot

Listens for private messages in the following format: `/^(\d+) ?(\+|\-|\/|\*) ?(\d+)$/` (examples: `2+2`, `4 - 10`, `100 / 5`, `5*5`)

Responds with the calculated answer

How to run: `yarn build ; node examples/calculator-bot.js`

### Anonymous chat (chat with random strangers bot)

Want to see more complex bot built with session-messenger-nodejs? Check out [here](https://github.com/VityaSchel/session-random-chat-bot)

### Working with files (attachments)

To see how to receive and send files (message attachments: images, videos and other files), please see [file-manager.ts](examples/file-manager.ts) example

## Methods

Since this is an early prototype that is in active development, there is no npm package yet. But there will be as soon as I debug everything and add install script that generates protobufs and builds native bindings.

Please be aware that this app generates A LOT of console logs. I'm working on reducing it, in stage of active development I need it to be able to at least have a smallest idea what's happening. Sorry for shit code 🙂

## API reference

### initializeSession(options?: { verbose?: ('warn' | 'info' | 'error')[], profileDataPath?: string, ignoreNodeVersion?: boolean }): Promise\<void\>

Initialize Session instance in current Node.js process. Must be called and await'ed before using any Session-related methods. Must be only called once per Node.js process. If you need more instances running simultaniously, spawn Node.js children processes.

Don't want to see any logs? Pass `verbose: []`. This parameter defaults to `['error']`

Want to specify location for Session profile (account data)? Pass `profileDataPath` with path to directory. This way you can have multiple instances running at the same time. Defaults to `session-data` directory

Want to experiment with node versions and disable error when using anything except well-tested v18.15.0? Use `ignoreNodeVersion: true`

### getConversations(): ConversationModel[]

Get cached conversations. Keep in mind that this does not actually fetches anything from network, it just returns in-memory state that is updated with events.

### class EventEmitter

EventEmitter allows you to listen for events that happen inside Session instance.

List of events:
- `message`. Callback when a new incoming message found. Callback signature: `(content: SignalService.Content, options: { conversation: { type: "group" | "private"; id: string; raw: ConversationModel; }, id: string, timestamp: number }) => any`

Example:
```ts
events.on('message', (message, conversation) => {
  if (message.dataMessage) {
    if (conversation.type === 'group') {
      sendMessage(conversation.id, {
        body: 'Hi, chat!',
      })
    } else if(conversation.type === 'private') {
      sendMessage(conversation.id, {
        body: 'I only work in groups ;)',
      })
    }
  }
})
```

### sendMessage(sessionID: string, message: SessionOutgoingMessage): Promise\<void\>

Sends message to private chat

Example:
```ts
sendMessage(conversation.id, {
  body: 'Hi, chat!',
})
```

### getSessionID(): string

Gets SessionID/public key in current loaded Session profile

Example:
```ts
console.log(getSessionID())
```

### createIdentity(profileName: string): Promise\<{ mnemonic: string, sessionID: string }\>

Create new account. Returns generated mnemonic and Session ID of created account.

Example:
```ts
await initializeSession()
await createIdentity('test-bot-' + Math.random().toString(36).substring(7))
```

### signIn(mnemonic: string): Promise\<{ sessionID: string }\>

Sign in or "Link new device". Returns Session ID of found account.

**CAUTION: This method syncs all messages from swarms as if they were new. Either wait for these messages to sync (it may take about a minute) and then proceed to handling new messages normally, or check for timestamp and ignore messages older than a few days**

### resolveSessionIdByONSName(onsName: string): Promise\<string\>

You can use `import { ONSNameRegex } from 'session-messenger-nodejs'` to check if it's pubkey or ONSName.

This method will throw if ONSName cannot be resolved

Example:
```ts
await resolveSessionIdByONSName('hloth') // -> 057aeb66e45660c3bdfb7c62706f6440226af43ec13f3b6f899c1dd4db1b8fce5b
```

Browse all ONS names quickly with free API: [https://ons.sessionbots.directory](https://ons.sessionbots.directory)

### downloadAttachment(attachment: signalservice.IAttachmentPointer | AttachmentPointerWithUrl): Promise\<Buffer\>

Download file attachment (e.g. video, image) from message.

Example:
```ts
const events = new EventEmitter()
events.on('message', async (msg) => {
  if (!msg.dataMessage) return

  const attachments = msg.dataMessage.attachments
  if (attachments?.length) {
    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i]
      const data = await downloadAttachment(attachment)
      console.log('File size', data.byteLength)
    }
  }
})
```

See full example on how to handle files: [file-downloader.ts](examples/file-downloader.ts) and [file-uploader.ts](examples/file-uploader.ts)

### downloadProfilePicture(profilePicture: string, profileKey: Uint8Array): Promise\<Buffer\>

Download profile picture file from user's profile.

Example:
```ts
const events = new EventEmitter()
events.on('message', async (msg) => {
  if (!msg.dataMessage) return

  const sender = msg.dataMessage.profile
  if (sender?.profilePicture && msg.dataMessage.profileKey) {
    const avatar = await downloadProfilePicture(
      sender.profilePicture, 
      msg.dataMessage.profileKey
    )
    console.log('File size:', avatar.byteLength)
  }
})
```

See full example on how to handle files: [file-manager.ts](examples/file-manager.ts)

## Contributing

PRs are welcome! Feel free to help development.

## Donate

Donate in crypto: [hloth.dev/donate](https://hloth.dev/donate)

## License

[Session Desktop](https://github.com/oxen-io/session-desktop) is licensed under the GPLv3. Read more here: [https://github.com/oxen-io/session-desktop/blob/unstable/LICENSE]

My work is licensed under the [MIT](./LICENSE.md) license.

Both licenses allows you to use this project privately, commercially, modify, distribute, patent it. Both licenses state that neither Oxen nor me are responsible for any damages. 

Use this software wisely.
