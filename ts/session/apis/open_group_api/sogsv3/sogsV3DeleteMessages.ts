import AbortController from 'abort-controller';
import { OpenGroupRequestCommonType } from '../opengroupV2/ApiUtil';
import {
  batchFirstSubIsSuccess,
  batchGlobalIsSuccess,
  OpenGroupBatchRow,
  sogsBatchSend,
} from './sogsV3BatchPoll';

/**
 * Deletes messages on open group server using onion v4 logic and batch send
 */
export const deleteSogsMessageByServerIds = async (
  idsToRemove: Array<number>,
  roomInfos: OpenGroupRequestCommonType
): Promise<boolean> => {
  const options: Array<OpenGroupBatchRow> = idsToRemove.map(idToRemove => ({
    type: 'deleteMessage',
    deleteMessage: { roomId: roomInfos.roomId, messageId: idToRemove },
  }));
  const result = await sogsBatchSend(
    roomInfos.serverUrl,
    new Set([roomInfos.roomId]),
    new AbortController().signal,
    options,
    'batch'
  );

  try {
    return batchGlobalIsSuccess(result) && batchFirstSubIsSuccess(result);
  } catch (e) {
    console.error("deleteMessageByServerIds Can't decode JSON body");
  }
  return false;
};
