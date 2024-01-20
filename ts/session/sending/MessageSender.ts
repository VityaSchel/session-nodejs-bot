// REMOVE COMMENT AFTER: This can just export pure functions as it doesn't need state

import { AbortController } from 'abort-controller';
import ByteBuffer from 'bytebuffer';
import _, { isEmpty, isNil, isString, sample, toNumber } from 'lodash';
import pRetry from 'p-retry';
import { Data } from '../../data/data';
import { SignalService } from '../../protobuf';
import { OpenGroupRequestCommonType } from '../apis/open_group_api/opengroupV2/ApiUtil';
import { OpenGroupMessageV2 } from '../apis/open_group_api/opengroupV2/OpenGroupMessageV2';
import {
  sendMessageOnionV4BlindedRequest,
  sendSogsMessageOnionV4,
} from '../apis/open_group_api/sogsv3/sogsV3SendMessage';
import { GetNetworkTime } from '../apis/snode_api/getNetworkTime';
import { SnodeNamespace, SnodeNamespaces } from '../apis/snode_api/namespaces';
import { getSwarmFor } from '../apis/snode_api/snodePool';
import {
  NotEmptyArrayOfBatchResults,
  StoreOnNodeMessage,
  StoreOnNodeParams,
  StoreOnNodeParamsNoSig,
} from '../apis/snode_api/SnodeRequestTypes';
import { SnodeSignature, SnodeSignatureResult } from '../apis/snode_api/snodeSignatures';
import { SnodeAPIStore } from '../apis/snode_api/storeMessage';
import { getConversationController } from '../conversations';
import { MessageEncrypter } from '../crypto';
import { addMessagePadding } from '../crypto/BufferPadding';
import { ContentMessage } from '../messages/outgoing';
import { ConfigurationMessage } from '../messages/outgoing/controlMessage/ConfigurationMessage';
import { ClosedGroupNewMessage } from '../messages/outgoing/controlMessage/group/ClosedGroupNewMessage';
import { SharedConfigMessage } from '../messages/outgoing/controlMessage/SharedConfigMessage';
import { UnsendMessage } from '../messages/outgoing/controlMessage/UnsendMessage';
import { OpenGroupVisibleMessage } from '../messages/outgoing/visibleMessage/OpenGroupVisibleMessage';
import { ed25519Str } from '../onions/onionPath';
import { PubKey } from '../types';
import { RawMessage } from '../types/RawMessage';
import { EmptySwarmError } from '../utils/errors';
import { fromUInt8ArrayToBase64 } from '../utils/String';

// ================ SNODE STORE ================

function overwriteOutgoingTimestampWithNetworkTimestamp(message: { plainTextBuffer: Uint8Array }) {
  const networkTimestamp = GetNetworkTime.getNowWithNetworkOffset();

  const { plainTextBuffer } = message;
  const contentDecoded = SignalService.Content.decode(plainTextBuffer);

  const { dataMessage, dataExtractionNotification, typingMessage } = contentDecoded;
  if (dataMessage && dataMessage.timestamp && toNumber(dataMessage.timestamp) > 0) {
    // this is a sync message, do not overwrite the message timestamp
    if (dataMessage.syncTarget) {
      return {
        overRiddenTimestampBuffer: plainTextBuffer,
        networkTimestamp: _.toNumber(dataMessage.timestamp),
      };
    }
    dataMessage.timestamp = networkTimestamp;
  }
  if (
    dataExtractionNotification &&
    dataExtractionNotification.timestamp &&
    toNumber(dataExtractionNotification.timestamp) > 0
  ) {
    dataExtractionNotification.timestamp = networkTimestamp;
  }
  if (typingMessage && typingMessage.timestamp && toNumber(typingMessage.timestamp) > 0) {
    typingMessage.timestamp = networkTimestamp;
  }
  const overRiddenTimestampBuffer = SignalService.Content.encode(contentDecoded).finish();
  return { overRiddenTimestampBuffer, networkTimestamp };
}

function getMinRetryTimeout() {
  return 1000;
}

function isSyncMessage(message: ContentMessage) {
  if (
    message instanceof ConfigurationMessage ||
    message instanceof ClosedGroupNewMessage ||
    message instanceof UnsendMessage ||
    message instanceof SharedConfigMessage ||
    (message as any).syncTarget?.length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Send a single message via service nodes.
 *
 * @param message The message to send.
 * @param attempts The amount of times to attempt sending. Minimum value is 1.
 */
async function send(
  message: RawMessage,
  attempts: number = 3,
  retryMinTimeout?: number, // in ms
  isASyncMessage?: boolean
): Promise<{ wrappedEnvelope: Uint8Array; effectiveTimestamp: number }> {
  return pRetry(
    async () => {
      const recipient = PubKey.cast(message.device);
      const { ttl } = message;

      // we can only have a single message in this send function for now
      const [encryptedAndWrapped] = await encryptMessagesAndWrap([
        {
          destination: message.device,
          plainTextBuffer: message.plainTextBuffer,
          namespace: message.namespace,
          ttl,
          identifier: message.identifier,
          isSyncMessage: Boolean(isASyncMessage),
        },
      ]);

      // make sure to update the local sent_at timestamp, because sometimes, we will get the just pushed message in the receiver side
      // before we return from the await below.
      // and the isDuplicate messages relies on sent_at timestamp to be valid.
      const found = await Data.getMessageById(encryptedAndWrapped.identifier);
      // make sure to not update the sent timestamp if this a currently syncing message
      if (found && !found.get('sentSync')) {
        found.set({ sent_at: encryptedAndWrapped.networkTimestamp });
        await found.commit();
      }

      const batchResult = await MessageSender.sendMessagesDataToSnode(
        [
          {
            pubkey: recipient.key,
            data64: encryptedAndWrapped.data64,
            ttl,
            timestamp: encryptedAndWrapped.networkTimestamp,
            namespace: encryptedAndWrapped.namespace,
          },
        ],
        recipient.key,
        null
      );

      const isDestinationClosedGroup = getConversationController()
        .get(recipient.key)
        ?.isClosedGroup();
      // If message also has a sync message, save that hash. Otherwise save the hash from the regular message send i.e. only closed groups in this case.
      if (
        encryptedAndWrapped.identifier &&
        (encryptedAndWrapped.isSyncMessage || isDestinationClosedGroup) &&
        batchResult &&
        !isEmpty(batchResult) &&
        batchResult[0].code === 200 &&
        !isEmpty(batchResult[0].body.hash)
      ) {
        const messageSendHash = batchResult[0].body.hash;
        const foundMessage = await Data.getMessageById(encryptedAndWrapped.identifier);
        if (foundMessage) {
          await foundMessage.updateMessageHash(messageSendHash);
          await foundMessage.commit();
          console.info(
            `updated message ${foundMessage.get('id')} with hash: ${foundMessage.get(
              'messageHash'
            )}`
          );
        }
      }

      return {
        wrappedEnvelope: encryptedAndWrapped.data,
        effectiveTimestamp: encryptedAndWrapped.networkTimestamp,
      };
    },
    {
      retries: Math.max(attempts - 1, 0),
      factor: 1,
      minTimeout: retryMinTimeout || MessageSender.getMinRetryTimeout(),
    }
  );
}

async function sendMessagesDataToSnode(
  params: Array<StoreOnNodeParamsNoSig>,
  destination: string,
  messagesHashesToDelete: Set<string> | null
): Promise<NotEmptyArrayOfBatchResults> {
  const rightDestination = params.filter(m => m.pubkey === destination);
  const swarm = await getSwarmFor(destination);

  const withSigWhenRequired: Array<StoreOnNodeParams> = await Promise.all(
    rightDestination.map(async item => {
      // some namespaces require a signature to be added
      let signOpts: SnodeSignatureResult | undefined;
      if (SnodeNamespace.isUserConfigNamespace(item.namespace)) {
        signOpts = await SnodeSignature.getSnodeSignatureParams({
          method: 'store' as const,
          namespace: item.namespace,
          pubkey: destination,
        });
      }
      const store: StoreOnNodeParams = {
        data: item.data64,
        namespace: item.namespace,
        pubkey: item.pubkey,
        timestamp: item.timestamp,
        // sig_timestamp: item.timestamp,
        // sig_timestamp is currently not forwarded from the receiving snode to the other swarm members, and so their sig verify fail.
        // This timestamp is not really needed so we just don't send it in the meantime (the timestamp value is used if the sig_timestamp is not present)
        ttl: item.ttl,
        ...signOpts,
      };
      return store;
    })
  );

  const signedDeleteOldHashesRequest =
    messagesHashesToDelete && messagesHashesToDelete.size
      ? await SnodeSignature.getSnodeSignatureByHashesParams({
          method: 'delete' as const,
          messages: [...messagesHashesToDelete],
          pubkey: destination,
        })
      : null;

  const snode = sample(swarm);
  if (!snode) {
    throw new EmptySwarmError(destination, 'Ran out of swarm nodes to query');
  }

  try {
    // No pRetry here as if this is a bad path it will be handled and retried in lokiOnionFetch.
    const storeResults = await SnodeAPIStore.storeOnNode(
      snode,
      withSigWhenRequired,
      signedDeleteOldHashesRequest
    );

    if (!isEmpty(storeResults)) {
      console.info(
        `sendMessagesToSnode - Successfully stored messages to ${ed25519Str(destination)} via ${
          snode.ip
        }:${snode.port} on namespaces: ${rightDestination.map(m => m.namespace).join(',')}`
      );
    }

    return storeResults;
  } catch (e) {
    const snodeStr = snode ? `${snode.ip}:${snode.port}` : 'null';
    console.warn(
      `sendMessagesToSnode - "${e.code}:${e.message}" to ${destination} via snode:${snodeStr}`
    );
    throw e;
  }
}

function encryptionBasedOnConversation(destination: PubKey) {
  if (
    getConversationController()
      .get(destination.key)
      ?.isClosedGroup()
  ) {
    return SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE;
  }
  return SignalService.Envelope.Type.SESSION_MESSAGE;
}

type SharedEncryptAndWrap = {
  ttl: number;
  identifier: string;
  isSyncMessage: boolean;
};

type EncryptAndWrapMessage = {
  plainTextBuffer: Uint8Array;
  destination: string;
  namespace: number | null;
} & SharedEncryptAndWrap;

type EncryptAndWrapMessageResults = {
  data64: string;
  networkTimestamp: number;
  data: Uint8Array;
  namespace: number;
} & SharedEncryptAndWrap;

async function encryptMessageAndWrap(
  params: EncryptAndWrapMessage
): Promise<EncryptAndWrapMessageResults> {
  const {
    destination,
    identifier,
    isSyncMessage: syncMessage,
    namespace,
    plainTextBuffer,
    ttl,
  } = params;

  const {
    overRiddenTimestampBuffer,
    networkTimestamp,
  } = overwriteOutgoingTimestampWithNetworkTimestamp({ plainTextBuffer });
  const recipient = PubKey.cast(destination);

  const { envelopeType, cipherText } = await MessageEncrypter.encrypt(
    recipient,
    overRiddenTimestampBuffer,
    encryptionBasedOnConversation(recipient)
  );

  const envelope = await buildEnvelope(envelopeType, recipient.key, networkTimestamp, cipherText);

  const data = wrapEnvelope(envelope);
  const data64 = ByteBuffer.wrap(data).toString('base64');

  // override the namespaces if those are unset in the incoming messages
  // right when we upgrade from not having namespaces stored in the outgoing cached messages our messages won't have a namespace associated.
  // So we need to keep doing the lookup of where they should go if the namespace is not set.

  const overridenNamespace = !isNil(namespace)
    ? namespace
    : getConversationController()
        .get(recipient.key)
        ?.isClosedGroup()
    ? SnodeNamespaces.ClosedGroupMessage
    : SnodeNamespaces.UserMessages;

  return {
    data64,
    networkTimestamp,
    data,
    namespace: overridenNamespace,
    ttl,
    identifier,
    isSyncMessage: syncMessage,
  };
}

async function encryptMessagesAndWrap(
  messages: Array<EncryptAndWrapMessage>
): Promise<Array<EncryptAndWrapMessageResults>> {
  return Promise.all(messages.map(encryptMessageAndWrap));
}

/**
 * Send a list of messages to a single service node.
 * Used currently only for sending SharedConfigMessage to multiple messages at a time.
 *
 * @param params the messages to deposit
 * @param destination the pubkey we should deposit those message for
 * @returns the hashes of successful deposit
 */
async function sendMessagesToSnode(
  params: Array<StoreOnNodeMessage>,
  destination: string,
  messagesHashesToDelete: Set<string> | null
): Promise<NotEmptyArrayOfBatchResults | null> {
  try {
    const recipient = PubKey.cast(destination);

    const encryptedAndWrapped = await encryptMessagesAndWrap(
      params.map(m => ({
        destination: m.pubkey,
        plainTextBuffer: m.message.plainTextBuffer(),
        namespace: m.namespace,
        ttl: m.message.ttl(),
        identifier: m.message.identifier,
        isSyncMessage: MessageSender.isSyncMessage(m.message),
      }))
    );

    // first update all the associated timestamps of our messages in DB, if the outgoing messages are associated with one.
    await Promise.all(
      encryptedAndWrapped.map(async (m, index) => {
        // make sure to update the local sent_at timestamp, because sometimes, we will get the just pushed message in the receiver side
        // before we return from the await below.
        // and the isDuplicate messages relies on sent_at timestamp to be valid.
        const found = await Data.getMessageById(m.identifier);

        // make sure to not update the sent timestamp if this a currently syncing message
        if (found && !found.get('sentSync')) {
          found.set({ sent_at: encryptedAndWrapped[index].networkTimestamp });
          await found.commit();
        }
      })
    );

    const batchResults = await pRetry(
      async () => {
        return MessageSender.sendMessagesDataToSnode(
          encryptedAndWrapped.map(wrapped => ({
            pubkey: recipient.key,
            data64: wrapped.data64,
            ttl: wrapped.ttl,
            timestamp: wrapped.networkTimestamp,
            namespace: wrapped.namespace,
          })),
          recipient.key,
          messagesHashesToDelete
        );
      },
      {
        retries: 2,
        factor: 1,
        minTimeout: MessageSender.getMinRetryTimeout(),
        maxTimeout: 1000,
      }
    );

    if (!batchResults || isEmpty(batchResults)) {
      throw new Error('result is empty for sendMessagesToSnode');
    }

    const isDestinationClosedGroup = getConversationController()
      .get(recipient.key)
      ?.isClosedGroup();

    await Promise.all(
      encryptedAndWrapped.map(async (message, index) => {
        // If message also has a sync message, save that hash. Otherwise save the hash from the regular message send i.e. only closed groups in this case.
        if (
          message.identifier &&
          (message.isSyncMessage || isDestinationClosedGroup) &&
          batchResults[index] &&
          !isEmpty(batchResults[index]) &&
          isString(batchResults[index].body.hash)
        ) {
          const hashFoundInResponse = batchResults[index].body.hash;
          const foundMessage = await Data.getMessageById(message.identifier);
          if (foundMessage) {
            await foundMessage.updateMessageHash(hashFoundInResponse);
            await foundMessage.commit();
            console.info(
              `updated message ${foundMessage.get('id')} with hash: ${foundMessage.get(
                'messageHash'
              )}`
            );
          }
        }
      })
    );

    return batchResults;
  } catch (e) {
    console.warn(`sendMessagesToSnode failed with ${e.message}`);
    return null;
  }
}

async function buildEnvelope(
  type: SignalService.Envelope.Type,
  sskSource: string | undefined,
  timestamp: number,
  content: Uint8Array
): Promise<SignalService.Envelope> {
  let source: string | undefined;

  if (type === SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE) {
    source = sskSource;
  }

  return SignalService.Envelope.create({
    type,
    source,
    timestamp,
    content,
  });
}

/**
 * This is an outdated practice and we should probably just send the envelope data directly.
 * Something to think about in the future.
 */
function wrapEnvelope(envelope: SignalService.Envelope): Uint8Array {
  const request = SignalService.WebSocketRequestMessage.create({
    id: 0,
    body: SignalService.Envelope.encode(envelope).finish(),
    verb: 'PUT',
    path: '/api/v1/message',
  });

  const websocket = SignalService.WebSocketMessage.create({
    type: SignalService.WebSocketMessage.Type.REQUEST,
    request,
  });
  return SignalService.WebSocketMessage.encode(websocket).finish();
}

// ================ Open Group ================
/**
 * Send a message to an open group v2.
 * @param message The open group message.
 */
async function sendToOpenGroupV2(
  rawMessage: OpenGroupVisibleMessage,
  roomInfos: OpenGroupRequestCommonType,
  blinded: boolean,
  filesToLink: Array<number>
): Promise<OpenGroupMessageV2 | boolean> {
  // we agreed to pad message for opengroupv2
  const paddedBody = addMessagePadding(rawMessage.plainTextBuffer());
  const v2Message = new OpenGroupMessageV2({
    sentTimestamp: GetNetworkTime.getNowWithNetworkOffset(),
    base64EncodedData: fromUInt8ArrayToBase64(paddedBody),
    filesToLink,
  });

  const msg = await sendSogsMessageOnionV4(
    roomInfos.serverUrl,
    roomInfos.roomId,
    new AbortController().signal,
    v2Message,
    blinded
  );
  return msg;
}

/**
 * Send a message to an open group v2.
 * @param message The open group message.
 */
async function sendToOpenGroupV2BlindedRequest(
  encryptedContent: Uint8Array,
  roomInfos: OpenGroupRequestCommonType,
  recipientBlindedId: string
): Promise<{ serverId: number; serverTimestamp: number }> {
  const v2Message = new OpenGroupMessageV2({
    sentTimestamp: GetNetworkTime.getNowWithNetworkOffset(),
    base64EncodedData: fromUInt8ArrayToBase64(encryptedContent),
  });

  // Warning: sendMessageOnionV4BlindedRequest throws
  const msg = await sendMessageOnionV4BlindedRequest(
    roomInfos.serverUrl,
    roomInfos.roomId,
    new AbortController().signal,
    v2Message,
    recipientBlindedId
  );
  return msg;
}

export const MessageSender = {
  sendToOpenGroupV2BlindedRequest,
  sendMessagesDataToSnode,
  sendMessagesToSnode,
  getMinRetryTimeout,
  sendToOpenGroupV2,
  send,
  isSyncMessage,
};
