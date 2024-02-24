import type { signalservice } from '../session-messenger/ts/protobuf/compiled'
import type { AttachmentPointerWithUrl } from '../session-messenger/ts/session/messages/outgoing/visibleMessage/VisibleMessage'
import { downloadAttachment as sessionDownloadAttachment } from '../session-messenger/ts/receiver/attachments'
import { decryptProfile } from '../session-messenger/ts/util/crypto/profileEncrypter'
import { callUtilsWorker } from '../session-messenger/ts/webworker/workers/browser/util_worker_interface'

export async function downloadAttachment(attachment: signalservice.IAttachmentPointer | AttachmentPointerWithUrl): Promise<Buffer> {
  if (!attachment.id) throw new Error('Attachment id is missing')
  if (!attachment.url) throw new Error('Attachment url is missing')
  if (!attachment.size) throw new Error('Attachment size is missing')

  let key: string
  if(typeof attachment.key === 'string') {
    key = attachment.key
  } else {
    key = await callUtilsWorker('arrayBufferToStringBase64', attachment.key)
  }
  let digest: string
  if(typeof attachment.digest === 'string') {
    digest = attachment.digest
  } else {
    digest = await callUtilsWorker('arrayBufferToStringBase64', attachment.digest)
  }
  const { data } = await sessionDownloadAttachment({
    url: attachment.url,
    id: attachment.id.toString(),
    ...(attachment.key && attachment.digest && {
      key,
      digest,
    }),
    ...(!(attachment.key && attachment.digest) && { isRaw: true }),
    size: attachment.size,
  })
  return Buffer.from(data)
}

/**
 * Downloads profile picture to Buffer
 * @param profilePicture LokiProfile profilePicture
 * @param profileKey DataMessage profileKey
 */
export async function downloadProfilePicture(profilePicture: string, profileKey: Uint8Array): Promise<Buffer> {
  const downloaded = await sessionDownloadAttachment({
    url: profilePicture,
    isRaw: true
  })
  const arrayBuffer = await decryptProfile(
    downloaded.data,
    profileKey
  )
  return Buffer.from(arrayBuffer)
}