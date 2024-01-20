import _ from 'lodash';
import { SignalService } from '../protobuf';
import { GetNetworkTime } from '../session/apis/snode_api/getNetworkTime';
import { TTL_DEFAULT } from '../session/constants';
import { CallManager, UserUtils } from '../session/utils';
import { removeFromCache } from './cache';
import { EnvelopePlus } from './types';

export async function handleCallMessage(
  envelope: EnvelopePlus,
  callMessage: SignalService.CallMessage
) {
  const sender = envelope.senderIdentity || envelope.source;

  const sentTimestamp = _.toNumber(envelope.timestamp);

  const { type } = callMessage;

  // we just allow self send of ANSWER message to remove the incoming call dialog when we accepted it from another device
  if (
    sender === UserUtils.getOurPubKeyStrFromCache() &&
    callMessage.type !== SignalService.CallMessage.Type.ANSWER &&
    callMessage.type !== SignalService.CallMessage.Type.END_CALL
  ) {
    console.info('Dropping incoming call from ourself');
    await removeFromCache(envelope);
    return;
  }

  if (CallManager.isCallRejected(callMessage.uuid)) {
    await removeFromCache(envelope);

    console.info(`Dropping already rejected call from this device ${callMessage.uuid}`);
    return;
  }

  if (type === SignalService.CallMessage.Type.PROVISIONAL_ANSWER) {
    await removeFromCache(envelope);

    console.info('Skipping callMessage PROVISIONAL_ANSWER');
    return;
  }

  if (type === SignalService.CallMessage.Type.PRE_OFFER) {
    await removeFromCache(envelope);

    console.info('Skipping callMessage PRE_OFFER');
    return;
  }

  if (type === SignalService.CallMessage.Type.OFFER) {
    if (
      Math.max(sentTimestamp - GetNetworkTime.getNowWithNetworkOffset()) > TTL_DEFAULT.CALL_MESSAGE
    ) {
      window?.log?.info('Dropping incoming OFFER callMessage sent a while ago: ', sentTimestamp);
      await removeFromCache(envelope);

      return;
    }
    await removeFromCache(envelope);

    await CallManager.handleCallTypeOffer(sender, callMessage, sentTimestamp);

    return;
  }

  if (type === SignalService.CallMessage.Type.END_CALL) {
    await removeFromCache(envelope);

    await CallManager.handleCallTypeEndCall(sender, callMessage.uuid);

    return;
  }

  if (type === SignalService.CallMessage.Type.ANSWER) {
    await removeFromCache(envelope);

    await CallManager.handleCallTypeAnswer(sender, callMessage, sentTimestamp);

    return;
  }
  if (type === SignalService.CallMessage.Type.ICE_CANDIDATES) {
    await removeFromCache(envelope);

    await CallManager.handleCallTypeIceCandidates(sender, callMessage, sentTimestamp);

    return;
  }
  await removeFromCache(envelope);

  // if this another type of call message, just add it to the manager
  await CallManager.handleOtherCallTypes(sender, callMessage, sentTimestamp);
}
