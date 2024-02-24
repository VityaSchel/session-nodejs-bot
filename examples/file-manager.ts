import fsSync from 'fs'
import fs from 'fs/promises'
import os from 'os'
import { initializeSession, EventEmitter, getSessionID, downloadAttachment, downloadProfilePicture } from '../src'

const tmpdir = os.tmpdir() + '/session-nodejs-client' + Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + '/'
fsSync.mkdirSync(tmpdir)

async function main() {
  await initializeSession()
  console.log('SessionID', getSessionID())

  const events = new EventEmitter()
  events.on('message', async (msg) => {
    if (!msg.dataMessage) return

    const sender = msg.dataMessage.profile
    if (sender?.profilePicture && msg.dataMessage.profileKey) {
      console.log('Downloading profile picture for ' + sender.displayName+'...')
        
      const contentPath = tmpdir + Date.now() +'.jpg'
      const avatar = await downloadProfilePicture(
        sender.profilePicture, 
        msg.dataMessage.profileKey
      )
      await fs.writeFile(contentPath, avatar)
      console.log('Profile picture saved to:', contentPath)
    }

    const attachments = msg.dataMessage.attachments
    if (attachments?.length) {
      console.log('Received', attachments.length, 'attachments')

      for (let i = 0; i < attachments.length; i++) {
        const attachment = attachments[i]
        console.log('\n\nAttachment #'+(i+1)+'/'+attachments.length)
        console.log('ID:', attachment.id.toString())
        console.log('File Name:', attachment.fileName)
        console.log('File MIME:', attachment.contentType)
        if(attachment.size) console.log('File Size:', attachment.size / 1000, 'KB')
        if(attachment.width && attachment.height) console.log('Image size:', attachment.width +'x'+ attachment.height)
        
        
        try {
          const data = await downloadAttachment(attachment)
          const contentPath = tmpdir + attachment.fileName
          console.log('Content saved to:', contentPath)
          await fs.writeFile(contentPath, Buffer.from(data))
        } catch(e) {
          console.log('Error while downloading attachment:', e)
        }
      }
    }
  })
}

main()