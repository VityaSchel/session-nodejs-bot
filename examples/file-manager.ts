import fsSync from 'fs'
import fs from 'fs/promises'
import os from 'os'
import { initializeSession, EventEmitter, getSessionID } from '../src'
import { downloadAttachment } from '../session-messenger/ts/receiver/attachments'
import { decryptProfile } from '../session-messenger/ts/util/crypto/profileEncrypter'
import { autoScaleForIncomingAvatar } from '../session-messenger/ts/util/attachmentsUtil'
import { callUtilsWorker } from '../session-messenger/ts/webworker/workers/browser/util_worker_interface'
import { processNewAttachment } from '../session-messenger/ts/types/MessageAttachment'

const tmpdir = os.tmpdir() + '/session-nodejs-client' + Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + '/'
fsSync.mkdirSync(tmpdir)

async function main() {
  await initializeSession()
  console.log('SessionID', getSessionID())
  const events = new EventEmitter()
  events.on('message', async (msg) => {
    if (msg.dataMessage?.profile?.profilePicture && msg.dataMessage.profileKey) {
      console.log('Downloading profile picture for '+msg.dataMessage.profile.displayName+'...')
      try {
        const downloaded = await downloadAttachment({
          url: msg.dataMessage.profile.profilePicture,
          isRaw: true
        })
        console.log('downloaded.data', downloaded.data)
        const decryptedData = await decryptProfile(
          downloaded.data,
          msg.dataMessage.profileKey.buffer
        )
        console.log('decryptedData', decryptedData.byteLength)
        const scaled = await autoScaleForIncomingAvatar(decryptedData)
        console.log(scaled)
        const upgraded = await processNewAttachment({
          data: await scaled.blob.arrayBuffer(),
          contentType: 'image/unknown',
        })
        console.log(upgraded)
      } catch(e) {
        console.error(e)
      }
    }

    // if(msg.dataMessage?.attachments?.length) {
    //   const attachments = msg.dataMessage.attachments
    //   console.log('Received', attachments.length, 'attachments')

    //   for (let i = 0; i < attachments.length; i++) {
    //     const attachment = attachments[i]
    //     console.log('Attachment #'+(i+1)+'/'+attachments.length)
    //     console.log('ID:', attachment.id.toString())
    //     console.log('File Name:', attachment.fileName)
    //     if(attachment.size) {
    //       console.log('File Size:', attachment.size / 1000, 'KB')
    //     }
    //     console.log('File MIME:', attachment.contentType)
    //     if(attachment.width && attachment.height) {
    //       console.log('Image size:', attachment.width +'x'+ attachment.height)
    //     }
        
    //     if (!attachment.url) {
    //       console.log('No URL to download')
    //     } else if (!attachment.id) {
    //       console.log('No ID to download')
    //     } else if (!attachment.size) {
    //       console.log('No ID to download')
    //     } else {
    //       const key = await callUtilsWorker('arrayBufferToStringBase64', attachment.key)
    //       const digest = await callUtilsWorker('arrayBufferToStringBase64', attachment.digest)
    //       const { data } = await downloadAttachment({
    //         url: attachment.url,
    //         id: attachment.id.toString(),
    //         ...(attachment.key && attachment.digest && { 
    //           key,
    //           digest,
    //         }),
    //         ...(!(attachment.key && attachment.digest) && { isRaw: true }),
    //         size: attachment.size,
    //       })
    //       const contentPath = tmpdir + attachment.fileName
    //       console.log('Content saved to:', contentPath)
    //       await fs.writeFile(contentPath, Buffer.from(data))
    //     }

    //     if(i !== attachments.length - 1) {
    //       console.log('====================')
    //     }
    //   }
    // }
  })
}

main()