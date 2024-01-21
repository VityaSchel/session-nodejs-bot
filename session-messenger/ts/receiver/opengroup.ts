import { noop } from 'lodash';
import {
  createPublicMessageSentFromNotUs,
  createPublicMessageSentFromUs,
} from '../models/messageFactory';
import { SignalService } from '../protobuf';
// import { OpenGroupRequestCommonType } from '../session/apis/open_group_api/opengroupV2/ApiUtil';
// import { OpenGroupMessageV4 } from '../session/apis/open_group_api/opengroupV2/OpenGroupServerPoller';
import { isUsAnySogsFromCache } from '../session/apis/open_group_api/sogsv3/knownBlindedkeys';
import { getOpenGroupV2ConversationId } from '../session/apis/open_group_api/utils/OpenGroupUtils';
import { getConversationController } from '../session/conversations';
import { removeMessagePadding } from '../session/crypto/BufferPadding';
import { perfEnd, perfStart } from '../session/utils/Performance';
import { fromBase64ToArray } from '../session/utils/String';
import { cleanIncomingDataMessage, messageHasVisibleContent } from './dataMessage';
import { handleMessageJob, toRegularMessage } from './queuedJob';
import { console } from '../sessionjs-logger';

export const handleOpenGroupV4Message = async (
  message: any,
  roomInfos: any
) => {
  const { data, id, posted, session_id } = message;
  if (data && posted && session_id) {
    await handleOpenGroupMessage(roomInfos, data, posted, session_id, id);
  } else {
    throw Error('Missing data passed to handleOpenGroupV4Message.');
  }
};

/**
 * Common checks and decoding that takes place for both v2 and v4 message types.
 */
const handleOpenGroupMessage = async (
  roomInfos: any,
  base64EncodedData: string,
  sentTimestamp: number,
  sender: string,
  serverId: number
) => {
  const { serverUrl, roomId } = roomInfos;
  if (!base64EncodedData || !sentTimestamp || !sender || !serverId) {
    console.warn('Invalid data passed to handleOpenGroupV2Message.');
    return;
  }

  // Note: opengroup messages should not be padded
  perfStart(`fromBase64ToArray-${base64EncodedData.length}`);
  const arr = fromBase64ToArray(base64EncodedData);
  perfEnd(`fromBase64ToArray-${base64EncodedData.length}`, 'fromBase64ToArray');

  const dataUint = new Uint8Array(removeMessagePadding(arr));

  const decodedContent = SignalService.Content.decode(dataUint);

  const conversationId = getOpenGroupV2ConversationId(serverUrl, roomId);
  if (!conversationId) {
    console.error('We cannot handle a message without a conversationId');
    return;
  }
  const idataMessage = decodedContent?.dataMessage;
  if (!idataMessage) {
    console.error('Invalid decoded opengroup message: no dataMessage');
    return;
  }

  if (!messageHasVisibleContent(idataMessage as SignalService.DataMessage)) {
    console.info('received an empty message for sogs');
    return;
  }

  if (
    !getConversationController()
      .get(conversationId)
      ?.isOpenGroupV2()
  ) {
    console.error('Received a message for an unknown convo or not an v2. Skipping');
    return;
  }

  const groupConvo = getConversationController().get(conversationId);

  if (!groupConvo) {
    console.warn('Skipping handleJob for unknown convo: ', conversationId);
    return;
  }

  void groupConvo.queueJob(async () => {
    const isMe = isUsAnySogsFromCache(sender);

    // this timestamp has already been forced to ms by the handleMessagesResponseV4() function
    const commonAttributes = { serverTimestamp: sentTimestamp, serverId, conversationId };
    const attributesForNotUs = { ...commonAttributes, sender };
    // those lines just create an empty message only in-memory with some basic stuff set.
    // the whole decoding of data is happening in handleMessageJob()
    const msgModel = isMe
      ? createPublicMessageSentFromUs(commonAttributes)
      : createPublicMessageSentFromNotUs(attributesForNotUs);

    // Note: deduplication is made in filterDuplicatesFromDbAndIncoming now

    await handleMessageJob(
      msgModel,
      groupConvo,
      toRegularMessage(
        cleanIncomingDataMessage(decodedContent?.dataMessage as SignalService.DataMessage)
      ),
      noop,
      sender,
      ''
    );
  });
};
