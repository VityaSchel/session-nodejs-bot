/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import { MessageUtils, ToastUtils, UserUtils } from '..';
import { SignalService } from '../../../protobuf';
import {
  CallStatusEnum,
  answerCall,
  callConnected,
  callReconnecting,
  endCall,
  incomingCall,
  setFullScreenCall,
  startingCallWith,
} from '../../../state/ducks/call';
import { openConversationWithMessages } from '../../../state/ducks/conversations';
import { getConversationController } from '../../conversations';
import { CallMessage } from '../../messages/outgoing/controlMessage/CallMessage';
import { ed25519Str } from '../../onions/onionPath';
import { PubKey } from '../../types';

import { getMessageQueue } from '../..';
import { getCallMediaPermissionsSettings } from '../../../components/settings/SessionSettings';
import { Data } from '../../../data/data';
import { approveConvoAndSendResponse } from '../../../interactions/conversationInteractions';
import { READ_MESSAGE_STATE } from '../../../models/conversationAttributes';
import { PnServer } from '../../apis/push_notification_api';
import { GetNetworkTime } from '../../apis/snode_api/getNetworkTime';
import { SnodeNamespaces } from '../../apis/snode_api/namespaces';
import { DURATION } from '../../constants';
import { MessageSender } from '../../sending';
import { getIsRinging } from '../RingingManager';
import { getBlackSilenceMediaStream } from './Silence';

export type InputItem = { deviceId: string; label: string };

export const callTimeoutMs = 60000;

/**
 * This uuid is set only once we accepted a call or started one.
 */
let currentCallUUID: string | undefined;

let currentCallStartTimestamp: number | undefined;

let weAreCallerOnCurrentCall: boolean | undefined;

const rejectedCallUUIDS: Set<string> = new Set();

export type CallManagerOptionsType = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  camerasList: Array<InputItem>;
  audioInputsList: Array<InputItem>;
  audioOutputsList: Array<InputItem>;
  isLocalVideoStreamMuted: boolean;
  isRemoteVideoStreamMuted: boolean;
  isAudioMuted: boolean;
  currentSelectedAudioOutput: string;
};

export type CallManagerListener = ((options: CallManagerOptionsType) => void) | null;
const videoEventsListeners: Array<{ id: string; listener: CallManagerListener }> = [];

function callVideoListeners() {
  if (videoEventsListeners.length) {
    videoEventsListeners.forEach(item => {
      item.listener?.({
        localStream,
        remoteStream,
        camerasList,
        audioInputsList,
        audioOutputsList,
        isRemoteVideoStreamMuted: remoteVideoStreamIsMuted,
        isLocalVideoStreamMuted: selectedCameraId === DEVICE_DISABLED_DEVICE_ID,
        isAudioMuted: selectedAudioInputId === DEVICE_DISABLED_DEVICE_ID,
        currentSelectedAudioOutput: selectedAudioOutputId,
      });
    });
  }
}

export function addVideoEventsListener(uniqueId: string, listener: CallManagerListener) {
  const indexFound = videoEventsListeners.findIndex(m => m.id === uniqueId);
  if (indexFound === -1) {
    videoEventsListeners.push({ id: uniqueId, listener });
  } else {
    videoEventsListeners[indexFound].listener = listener;
  }
  callVideoListeners();
}

export function removeVideoEventsListener(uniqueId: string) {
  const indexFound = videoEventsListeners.findIndex(m => m.id === uniqueId);
  if (indexFound !== -1) {
    videoEventsListeners.splice(indexFound);
  }
  callVideoListeners();
}

type CachedCallMessageType = {
  type: SignalService.CallMessage.Type;
  sdps: Array<string>;
  sdpMLineIndexes: Array<number>;
  sdpMids: Array<string>;
  uuid: string;
  timestamp: number;
};

/**
 * This field stores all the details received about a specific call with the same uuid. It is a per pubkey and per call cache.
 */
const callCache = new Map<string, Map<string, Array<CachedCallMessageType>>>();

let peerConnection: RTCPeerConnection | null;
let dataChannel: RTCDataChannel | null;
let remoteStream: MediaStream | null;
let localStream: MediaStream | null;
let remoteVideoStreamIsMuted = true;

export const DEVICE_DISABLED_DEVICE_ID = 'off';

let makingOffer = false;
let ignoreOffer = false;
let isSettingRemoteAnswerPending = false;
let lastOutgoingOfferTimestamp = -Infinity;

/**
 * This array holds all of the ice servers Session can contact.
 * They are all contacted at the same time, so before triggering the request, we get only a subset of those, randomly
 */
const iceServersFullArray = [
  {
    urls: 'turn:freyr.getsession.org',
    username: 'session202111',
    credential: '053c268164bc7bd7',
  },
  // excluding those two (fenrir & frigg) as they are TCP only for now
  // {
  //   urls: 'turn:fenrir.getsession.org',
  //   username: 'session202111',
  //   credential: '053c268164bc7bd7',
  // },
  // {
  //   urls: 'turn:frigg.getsession.org',
  //   username: 'session202111',
  //   credential: '053c268164bc7bd7',
  // },
  {
    urls: 'turn:angus.getsession.org',
    username: 'session202111',
    credential: '053c268164bc7bd7',
  },
  {
    urls: 'turn:hereford.getsession.org',
    username: 'session202111',
    credential: '053c268164bc7bd7',
  },
  {
    urls: 'turn:holstein.getsession.org',
    username: 'session202111',
    credential: '053c268164bc7bd7',
  },
  {
    urls: 'turn:brahman.getsession.org',
    username: 'session202111',
    credential: '053c268164bc7bd7',
  },
];

const configuration: RTCConfiguration = {
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  // iceTransportPolicy: 'relay', // for now, this cause the connection to break after 30-40 sec if we enable this
};

let selectedCameraId: string = DEVICE_DISABLED_DEVICE_ID;
let selectedAudioInputId: string = DEVICE_DISABLED_DEVICE_ID;
let selectedAudioOutputId: string = DEVICE_DISABLED_DEVICE_ID;
let camerasList: Array<InputItem> = [];
let audioInputsList: Array<InputItem> = [];
let audioOutputsList: Array<InputItem> = [];

async function getConnectedDevices(type: 'videoinput' | 'audioinput' | 'audiooutput') {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(device => device.kind === type);
}

// Listen for changes to media devices and update the list accordingly

if (typeof navigator !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  navigator?.mediaDevices?.addEventListener('devicechange', async () => {
    await updateConnectedDevices();
    callVideoListeners();
  });
}

async function updateConnectedDevices() {
  // Get the set of cameras connected
  const videoCameras = await getConnectedDevices('videoinput');

  camerasList = videoCameras.map(m => ({
    deviceId: m.deviceId,
    label: m.label,
  }));

  // Get the set of audio inputs connected
  const audiosInput = await getConnectedDevices('audioinput');
  audioInputsList = audiosInput.map(m => ({
    deviceId: m.deviceId,
    label: m.label,
  }));

  // Get the set of audio outputs connected
  const audiosOutput = await getConnectedDevices('audiooutput');
  audioOutputsList = audiosOutput.map(m => ({
    deviceId: m.deviceId,
    label: m.label,
  }));
}

function sendVideoStatusViaDataChannel() {
  const videoEnabledLocally = selectedCameraId !== DEVICE_DISABLED_DEVICE_ID;
  const stringToSend = JSON.stringify({
    video: videoEnabledLocally,
  });
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel?.send(stringToSend);
  }
}

function sendHangupViaDataChannel() {
  const stringToSend = JSON.stringify({
    hangup: true,
  });
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel?.send(stringToSend);
  }
}

export async function selectCameraByDeviceId(cameraDeviceId: string) {
  if (cameraDeviceId === DEVICE_DISABLED_DEVICE_ID) {
    selectedCameraId = DEVICE_DISABLED_DEVICE_ID;

    const sender = peerConnection?.getSenders().find(s => {
      return s.track?.kind === 'video';
    });
    if (sender?.track) {
      sender.track.enabled = false;
    }

    // do the same changes locally
    localStream?.getVideoTracks().forEach(t => {
      t.stop();
      localStream?.removeTrack(t);
    });
    localStream?.addTrack(getBlackSilenceMediaStream().getVideoTracks()[0]);

    sendVideoStatusViaDataChannel();
    callVideoListeners();
    return;
  }
  if (camerasList.some(m => m.deviceId === cameraDeviceId)) {
    selectedCameraId = cameraDeviceId;

    const devicesConfig = {
      video: {
        deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
      },
    };

    try {
      const newVideoStream = await navigator.mediaDevices.getUserMedia(devicesConfig);
      const videoTrack = newVideoStream.getVideoTracks()[0];

      if (!peerConnection) {
        throw new Error('cannot selectCameraByDeviceId without a peer connection');
      }

      console.info('replacing video track');
      const videoSender = peerConnection
        .getTransceivers()
        .find(t => t.sender.track?.kind === 'video')?.sender;

      videoTrack.enabled = true;
      if (videoSender) {
        await videoSender.replaceTrack(videoTrack);
      } else {
        throw new Error(
          'We should always have a videoSender as we are using a black video when no camera are in use'
        );
      }

      // do the same changes locally
      localStream?.getVideoTracks().forEach(t => {
        t.stop();
        localStream?.removeTrack(t);
      });
      localStream?.addTrack(videoTrack);

      sendVideoStatusViaDataChannel();
      callVideoListeners();
    } catch (e) {
      console.warn('selectCameraByDeviceId failed with', e.message);
      ToastUtils.pushToastError('selectCamera', e.message);
      callVideoListeners();
    }
  }
}

export async function selectAudioInputByDeviceId(audioInputDeviceId: string) {
  if (audioInputDeviceId === DEVICE_DISABLED_DEVICE_ID) {
    selectedAudioInputId = audioInputDeviceId;

    const sender = peerConnection?.getSenders().find(s => {
      return s.track?.kind === 'audio';
    });
    if (sender?.track) {
      sender.track.enabled = false;
    }
    const silence = getBlackSilenceMediaStream().getAudioTracks()[0];
    void sender?.replaceTrack(silence);
    // do the same changes locally
    localStream?.getAudioTracks().forEach(t => {
      t.stop();
      localStream?.removeTrack(t);
    });
    localStream?.addTrack(getBlackSilenceMediaStream().getAudioTracks()[0]);
    callVideoListeners();
    return;
  }
  if (audioInputsList.some(m => m.deviceId === audioInputDeviceId)) {
    selectedAudioInputId = audioInputDeviceId;

    const devicesConfig = {
      audio: {
        deviceId: selectedAudioInputId ? { exact: selectedAudioInputId } : undefined,
      },
    };

    try {
      const newAudioStream = await navigator.mediaDevices.getUserMedia(devicesConfig);

      const audioTrack = newAudioStream.getAudioTracks()[0];
      if (!peerConnection) {
        throw new Error('cannot selectAudioInputByDeviceId without a peer connection');
      }
      const audioSender = peerConnection.getSenders().find(s => {
        return s.track?.kind === audioTrack.kind;
      });
      console.info('replacing audio track');
      // we actually do not need to toggle the track here, as toggling it here unmuted here locally (so we start to hear ourselves)
      // do the same changes locally
      localStream?.getAudioTracks().forEach(t => {
        t.stop();
        localStream?.removeTrack(t);
      });
      if (audioSender) {
        await audioSender.replaceTrack(audioTrack);
      } else {
        throw new Error('Failed to get sender for selectAudioInputByDeviceId ');
      }
    } catch (e) {
      console.warn('selectAudioInputByDeviceId failed with', e.message);
    }

    callVideoListeners();
  }
}

export async function selectAudioOutputByDeviceId(audioOutputDeviceId: string) {
  if (audioOutputDeviceId === DEVICE_DISABLED_DEVICE_ID) {
    selectedAudioOutputId = audioOutputDeviceId;

    callVideoListeners();
    return;
  }
  if (audioOutputsList.some(m => m.deviceId === audioOutputDeviceId)) {
    selectedAudioOutputId = audioOutputDeviceId;

    callVideoListeners();
  }
}

async function createOfferAndSendIt(recipient: string) {
  try {
    makingOffer = true;
    console.info('got createOfferAndSendIt event. creating offer');
    await (peerConnection as any)?.setLocalDescription();
    const offer = peerConnection?.localDescription;
    if (!offer) {
      throw new Error('Could not create an offer');
    }

    if (!currentCallUUID) {
      console.warn('cannot send offer without a currentCallUUID');
      throw new Error('cannot send offer without a currentCallUUID');
    }

    if (offer && offer.sdp) {
      const lines = offer.sdp.split(/\r?\n/);
      const lineWithFtmpIndex = lines.findIndex(f => f.startsWith('a=fmtp:111'));
      const partBeforeComma = lines[lineWithFtmpIndex].split(';');
      lines[lineWithFtmpIndex] = `${partBeforeComma[0]};cbr=1`;
      let overridenSdps = lines.join('\n');
      overridenSdps = overridenSdps.replace(
        // eslint-disable-next-line prefer-regex-literals
        new RegExp('.+urn:ietf:params:rtp-hdrext:ssrc-audio-level.*\\r?\\n'),
        ''
      );

      const offerMessage = new CallMessage({
        timestamp: Date.now(),
        type: SignalService.CallMessage.Type.OFFER,
        sdps: [overridenSdps],
        uuid: currentCallUUID,
      });

      console.info(`sending '${offer.type}'' with callUUID: ${currentCallUUID}`);
      const negotiationOfferSendResult = await getMessageQueue().sendToPubKeyNonDurably({
        pubkey: PubKey.cast(recipient),
        message: offerMessage,
        namespace: SnodeNamespaces.UserMessages,
      });
      if (typeof negotiationOfferSendResult === 'number') {
        // console?.warn('setting last sent timestamp');
        lastOutgoingOfferTimestamp = negotiationOfferSendResult;
      }
    }
  } catch (err) {
    console?.error(`Error createOfferAndSendIt ${err}`);
  } finally {
    makingOffer = false;
  }
}

function handleIceCandidates(event: RTCPeerConnectionIceEvent, pubkey: string) {
  if (event.candidate) {
    iceCandidates.push(event.candidate);
    void iceSenderDebouncer(pubkey);
  }
}

async function openMediaDevicesAndAddTracks() {
  try {
    await updateConnectedDevices();

    if (!audioInputsList.length) {
      ToastUtils.pushNoAudioInputFound();
      return;
    }

    selectedAudioInputId = DEVICE_DISABLED_DEVICE_ID; // audioInputsList[0].deviceId;
    selectedCameraId = DEVICE_DISABLED_DEVICE_ID;
    console.info(
      `openMediaDevices videoDevice:${selectedCameraId} audioDevice:${selectedAudioInputId}`
    );

    localStream = getBlackSilenceMediaStream();
    localStream.getTracks().forEach(track => {
      if (localStream) {
        peerConnection?.addTrack(track, localStream);
      }
    });
  } catch (err) {
    console.warn('openMediaDevices: ', err);
    ToastUtils.pushVideoCallPermissionNeeded();
    closeVideoCall();
  }
  callVideoListeners();
}

export async function USER_callRecipient(recipient: string) {
  if (!getCallMediaPermissionsSettings()) {
    ToastUtils.pushVideoCallPermissionNeeded();
    return;
  }
  if (currentCallUUID) {
    console.warn(
      'Looks like we are already in a call as in USER_callRecipient is not undefined'
    );
    return;
  }
  await updateConnectedDevices();
  const now = Date.now();
  window?.log?.info(`starting call with ${ed25519Str(recipient)}..`);
  window.inboxStore?.dispatch(
    startingCallWith({
      pubkey: recipient,
    })
  );
  if (peerConnection) {
    throw new Error('USER_callRecipient peerConnection is already initialized ');
  }
  currentCallUUID = uuidv4();
  const justCreatedCallUUID = currentCallUUID;
  peerConnection = createOrGetPeerConnection(recipient);
  // send a pre offer just to wake up the device on the remote side
  const preOfferMsg = new CallMessage({
    timestamp: now,
    type: SignalService.CallMessage.Type.PRE_OFFER,
    uuid: currentCallUUID,
  });

  console.info('Sending preOffer message to ', ed25519Str(recipient));
  const calledConvo = getConversationController().get(recipient);
  calledConvo.set('active_at', Date.now()); // addSingleOutgoingMessage does the commit for us on the convo
  await calledConvo.unhideIfNeeded(false);
  weAreCallerOnCurrentCall = true;

  await calledConvo?.addSingleOutgoingMessage({
    sent_at: now,
    expireTimer: 0,
    callNotificationType: 'started-call',
  });

  // initiating a call is analogous to sending a message request
  await approveConvoAndSendResponse(recipient, true);

  // we do it manually as the sendToPubkeyNonDurably rely on having a message saved to the db for MessageSentSuccess
  // which is not the case for a pre offer message (the message only exists in memory)
  const rawMessage = await MessageUtils.toRawMessage(
    PubKey.cast(recipient),
    preOfferMsg,
    SnodeNamespaces.UserMessages
  );
  const { wrappedEnvelope } = await MessageSender.send(rawMessage);
  void PnServer.notifyPnServer(wrappedEnvelope, recipient);

  await openMediaDevicesAndAddTracks();
  await createOfferAndSendIt(recipient);

  // close and end the call if callTimeoutMs is reached and still not connected
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  global.setTimeout(async () => {
    if (justCreatedCallUUID === currentCallUUID && getIsRinging()) {
      console.info(
        'calling timeout reached. hanging up the call we started:',
        justCreatedCallUUID
      );
      await USER_hangup(recipient);
    }
  }, callTimeoutMs);
}

const iceCandidates: Array<RTCIceCandidate> = [];
const iceSenderDebouncer = _.debounce(async (recipient: string) => {
  if (!iceCandidates) {
    return;
  }
  const validCandidates = _.compact(
    iceCandidates.map(c => {
      if (
        c.sdpMLineIndex !== null &&
        c.sdpMLineIndex !== undefined &&
        c.sdpMid !== null &&
        c.candidate
      ) {
        return {
          sdpMLineIndex: c.sdpMLineIndex,
          sdpMid: c.sdpMid,
          candidate: c.candidate,
        };
      }
      return null;
    })
  );
  if (!currentCallUUID) {
    console.warn('Cannot send ice candidates without a currentCallUUID');
    return;
  }
  const callIceCandicates = new CallMessage({
    timestamp: Date.now(),
    type: SignalService.CallMessage.Type.ICE_CANDIDATES,
    sdpMLineIndexes: validCandidates.map(c => c.sdpMLineIndex),
    sdpMids: validCandidates.map(c => c.sdpMid),
    sdps: validCandidates.map(c => c.candidate),
    uuid: currentCallUUID,
  });

  console.info(
    `sending ICE CANDIDATES MESSAGE to ${ed25519Str(recipient)} about call ${currentCallUUID}`
  );

  await getMessageQueue().sendToPubKeyNonDurably({
    pubkey: PubKey.cast(recipient),
    message: callIceCandicates,
    namespace: SnodeNamespaces.UserMessages,
  });
}, 2000);

const findLastMessageTypeFromSender = (sender: string, msgType: SignalService.CallMessage.Type) => {
  const msgCacheFromSenderWithDevices = callCache.get(sender);
  if (!msgCacheFromSenderWithDevices) {
    return undefined;
  }

  // this does not sort by timestamp as we do not have a timestamp stored in the SignalService.CallMessage object
  const allMsg = _.flattenDeep([...msgCacheFromSenderWithDevices.values()]);
  const allMsgFromType = allMsg.filter(m => m.type === msgType);
  const lastMessageOfType = _.last(allMsgFromType);

  if (!lastMessageOfType) {
    return undefined;
  }
  return lastMessageOfType;
};

function handleSignalingStateChangeEvent() {
  if (peerConnection?.signalingState === 'closed') {
    closeVideoCall();
  }
}

function handleConnectionStateChanged(pubkey: string) {
  console.info('handleConnectionStateChanged :', peerConnection?.connectionState);

  if (peerConnection?.signalingState === 'closed' || peerConnection?.connectionState === 'failed') {
    window.inboxStore?.dispatch(callReconnecting({ pubkey }));
  } else if (peerConnection?.connectionState === 'connected') {
    const firstAudioInput = audioInputsList?.[0].deviceId || undefined;
    if (firstAudioInput) {
      void selectAudioInputByDeviceId(firstAudioInput);
    }

    const firstAudioOutput = audioOutputsList?.[0].deviceId || undefined;
    if (firstAudioOutput) {
      void selectAudioOutputByDeviceId(firstAudioOutput);
    }

    currentCallStartTimestamp = Date.now();

    window.inboxStore?.dispatch(callConnected({ pubkey }));
  }
}

function closeVideoCall() {
  console.info('closingVideoCall ');
  currentCallStartTimestamp = undefined;
  weAreCallerOnCurrentCall = undefined;
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.oniceconnectionstatechange = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.onsignalingstatechange = null;
    peerConnection.onicegatheringstatechange = null;
    peerConnection.onnegotiationneeded = null;

    if (dataChannel) {
      dataChannel.close();
      dataChannel = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
        localStream?.removeTrack(track);
      });
    }

    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        track.stop();
        remoteStream?.removeTrack(track);
      });
    }

    peerConnection.close();
    peerConnection = null;
  }

  localStream = null;
  remoteStream = null;
  selectedCameraId = DEVICE_DISABLED_DEVICE_ID;
  selectedAudioInputId = DEVICE_DISABLED_DEVICE_ID;
  currentCallUUID = undefined;

  window.inboxStore?.dispatch(setFullScreenCall(false));
  window.inboxStore?.dispatch(endCall());

  remoteVideoStreamIsMuted = true;

  makingOffer = false;
  ignoreOffer = false;
  isSettingRemoteAnswerPending = false;
  lastOutgoingOfferTimestamp = -Infinity;
  callVideoListeners();
}

function getCallingStateOutsideOfRedux() {
  const ongoingCallWith = window.inboxStore?.getState().call.ongoingWith as string | undefined;
  const ongoingCallStatus = window.inboxStore?.getState().call.ongoingCallStatus as CallStatusEnum;
  return { ongoingCallWith, ongoingCallStatus };
}

function onDataChannelReceivedMessage(ev: MessageEvent<string>) {
  try {
    const parsed = JSON.parse(ev.data);

    if (parsed.hangup !== undefined) {
      const { ongoingCallStatus, ongoingCallWith } = getCallingStateOutsideOfRedux();
      if (
        (ongoingCallStatus === 'connecting' ||
          ongoingCallStatus === 'offering' ||
          ongoingCallStatus === 'ongoing') &&
        ongoingCallWith
      ) {
        void handleCallTypeEndCall(ongoingCallWith, currentCallUUID);
      }

      return;
    }

    if (parsed.video !== undefined) {
      remoteVideoStreamIsMuted = !parsed.video;
    }
  } catch (e) {
    console.warn('onDataChannelReceivedMessage Could not parse data in event', ev);
  }
  callVideoListeners();
}
function onDataChannelOnOpen() {
  console.info('onDataChannelOnOpen: sending video status');
  sendVideoStatusViaDataChannel();
}

function createOrGetPeerConnection(withPubkey: string) {
  if (peerConnection) {
    return peerConnection;
  }
  remoteStream = new MediaStream();
  const sampleOfICeServers = _.sampleSize(iceServersFullArray, 2);
  peerConnection = new RTCPeerConnection({ ...configuration, iceServers: sampleOfICeServers });
  dataChannel = peerConnection.createDataChannel('session-datachannel', {
    ordered: true,
    negotiated: true,
    id: 548, // S E S S I O N in ascii code 83*3+69+73+79+78
  });

  dataChannel.onmessage = onDataChannelReceivedMessage;
  dataChannel.onopen = onDataChannelOnOpen;
  peerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
  peerConnection.ontrack = event => {
    event.track.onunmute = () => {
      remoteStream?.addTrack(event.track);
      callVideoListeners();
    };
    event.track.onmute = () => {
      remoteStream?.removeTrack(event.track);
      callVideoListeners();
    };
  };
  peerConnection.onconnectionstatechange = () => {
    handleConnectionStateChanged(withPubkey);
  };

  peerConnection.onicecandidate = event => {
    handleIceCandidates(event, withPubkey);
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.info(
      'oniceconnectionstatechange peerConnection.iceConnectionState: ',
      peerConnection?.iceConnectionState
    );

    if (peerConnection && peerConnection?.iceConnectionState === 'disconnected') {
      // this will trigger a negotiation event with iceRestart set to true in the createOffer options set
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      global.setTimeout(async () => {
        console.info('onconnectionstatechange disconnected: restartIce()');

        if (
          peerConnection?.iceConnectionState === 'disconnected' &&
          withPubkey?.length &&
          weAreCallerOnCurrentCall === true
        ) {
          // we are the caller and the connection got dropped out, we need to send a new offer with iceRestart set to true.
          // the recipient will get that new offer and send us a response back if he still online
          (peerConnection as any).restartIce();
          await createOfferAndSendIt(withPubkey);
        }
      }, 2000);
    }
  };

  return peerConnection;
}

export async function USER_acceptIncomingCallRequest(fromSender: string) {
  console.info('USER_acceptIncomingCallRequest');
  if (currentCallUUID) {
    console.warn(
      'Looks like we are already in a call as in USER_acceptIncomingCallRequest is not undefined'
    );
    return;
  }
  await updateConnectedDevices();

  const lastOfferMessage = findLastMessageTypeFromSender(
    fromSender,
    SignalService.CallMessage.Type.OFFER
  );

  if (!lastOfferMessage) {
    window?.log?.info(
      'incoming call request cannot be accepted as the corresponding message is not found'
    );
    return;
  }
  if (!lastOfferMessage.uuid) {
    window?.log?.info('incoming call request cannot be accepted as uuid is invalid');
    return;
  }
  window.inboxStore?.dispatch(answerCall({ pubkey: fromSender }));
  await openConversationWithMessages({ conversationKey: fromSender, messageId: null });
  if (peerConnection) {
    throw new Error('USER_acceptIncomingCallRequest: peerConnection is already set.');
  }
  currentCallUUID = lastOfferMessage.uuid;

  peerConnection = createOrGetPeerConnection(fromSender);

  await openMediaDevicesAndAddTracks();

  const { sdps } = lastOfferMessage;
  if (!sdps || sdps.length === 0) {
    window?.log?.info(
      'incoming call request cannot be accepted as the corresponding sdps is empty'
    );
    return;
  }
  try {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription({ sdp: sdps[0], type: 'offer' })
    );
  } catch (e) {
    console?.error(`Error setting RTC Session Description ${e}`);
  }

  const lastCandidatesFromSender = findLastMessageTypeFromSender(
    fromSender,
    SignalService.CallMessage.Type.ICE_CANDIDATES
  );

  if (lastCandidatesFromSender) {
    console.info('found sender ice candicate message already sent. Using it');
    for (let index = 0; index < lastCandidatesFromSender.sdps.length; index++) {
      const sdp = lastCandidatesFromSender.sdps[index];
      const sdpMLineIndex = lastCandidatesFromSender.sdpMLineIndexes[index];
      const sdpMid = lastCandidatesFromSender.sdpMids[index];
      const candicate = new RTCIceCandidate({ sdpMid, sdpMLineIndex, candidate: sdp });
      // eslint-disable-next-line no-await-in-loop
      await peerConnection.addIceCandidate(candicate);
    }
  }
  const networkTimestamp = GetNetworkTime.getNowWithNetworkOffset();
  const callerConvo = getConversationController().get(fromSender);
  callerConvo.set('active_at', networkTimestamp);
  await callerConvo.unhideIfNeeded(false);

  await callerConvo?.addSingleIncomingMessage({
    source: UserUtils.getOurPubKeyStrFromCache(),
    sent_at: networkTimestamp,
    received_at: networkTimestamp,
    expireTimer: 0,
    callNotificationType: 'answered-a-call',
    unread: READ_MESSAGE_STATE.read,
  });
  await buildAnswerAndSendIt(fromSender);

  // consider the conversation completely approved
  await callerConvo.setDidApproveMe(true);
  await approveConvoAndSendResponse(fromSender, true);
}

export async function rejectCallAlreadyAnotherCall(fromSender: string, forcedUUID: string) {
  console.info(`rejectCallAlreadyAnotherCall ${ed25519Str(fromSender)}: ${forcedUUID}`);
  rejectedCallUUIDS.add(forcedUUID);
  const rejectCallMessage = new CallMessage({
    type: SignalService.CallMessage.Type.END_CALL,
    timestamp: Date.now(),
    uuid: forcedUUID,
  });
  await sendCallMessageAndSync(rejectCallMessage, fromSender);

  // delete all msg not from that uuid only but from that sender pubkey
  clearCallCacheFromPubkeyAndUUID(fromSender, forcedUUID);
}

export async function USER_rejectIncomingCallRequest(fromSender: string) {
  // close the popup call
  window.inboxStore?.dispatch(endCall());
  const lastOfferMessage = findLastMessageTypeFromSender(
    fromSender,
    SignalService.CallMessage.Type.OFFER
  );

  const aboutCallUUID = lastOfferMessage?.uuid;
  console.info(`USER_rejectIncomingCallRequest ${ed25519Str(fromSender)}: ${aboutCallUUID}`);
  if (aboutCallUUID) {
    rejectedCallUUIDS.add(aboutCallUUID);
    const endCallMessage = new CallMessage({
      type: SignalService.CallMessage.Type.END_CALL,
      timestamp: Date.now(),
      uuid: aboutCallUUID,
    });
    // sync the reject event so our other devices remove the popup too
    await sendCallMessageAndSync(endCallMessage, fromSender);
    // delete all msg not from that uuid only but from that sender pubkey
    clearCallCacheFromPubkeyAndUUID(fromSender, aboutCallUUID);
  }
  const { ongoingCallStatus, ongoingCallWith } = getCallingStateOutsideOfRedux();

  // clear the ongoing call if needed
  if (ongoingCallWith && ongoingCallStatus && ongoingCallWith === fromSender) {
    closeVideoCall();
  }
  await addMissedCallMessage(fromSender, Date.now());
}

async function sendCallMessageAndSync(callmessage: CallMessage, user: string) {
  await Promise.all([
    getMessageQueue().sendToPubKeyNonDurably({
      pubkey: PubKey.cast(user),
      message: callmessage,
      namespace: SnodeNamespaces.UserMessages,
    }),
    getMessageQueue().sendToPubKeyNonDurably({
      pubkey: UserUtils.getOurPubKeyFromCache(),
      message: callmessage,
      namespace: SnodeNamespaces.UserMessages,
    }),
  ]);
}

export async function USER_hangup(fromSender: string) {
  console.info('USER_hangup');

  if (!currentCallUUID) {
    console.warn('should not be able to hangup without a currentCallUUID');
    return;
  }
  rejectedCallUUIDS.add(currentCallUUID);
  const endCallMessage = new CallMessage({
    type: SignalService.CallMessage.Type.END_CALL,
    timestamp: Date.now(),
    uuid: currentCallUUID,
  });
  void getMessageQueue().sendToPubKeyNonDurably({
    pubkey: PubKey.cast(fromSender),
    message: endCallMessage,
    namespace: SnodeNamespaces.UserMessages,
  });

  window.inboxStore?.dispatch(endCall());
  console.info('sending hangup with an END_CALL MESSAGE');

  sendHangupViaDataChannel();

  clearCallCacheFromPubkeyAndUUID(fromSender, currentCallUUID);

  closeVideoCall();
}

/**
 * This can actually be called from either the datachannel or from the receiver END_CALL event
 */
export async function handleCallTypeEndCall(sender: string, aboutCallUUID?: string) {
  console.info('handling callMessage END_CALL:', aboutCallUUID);

  if (aboutCallUUID) {
    rejectedCallUUIDS.add(aboutCallUUID);
    const { ongoingCallStatus, ongoingCallWith } = getCallingStateOutsideOfRedux();

    clearCallCacheFromPubkeyAndUUID(sender, aboutCallUUID);

    // this is a end call from ourself. We must remove the popup about the incoming call
    // if it matches the owner of this callUUID
    if (sender === UserUtils.getOurPubKeyStrFromCache()) {
      const ownerOfCall = getOwnerOfCallUUID(aboutCallUUID);

      if (
        (ongoingCallStatus === 'incoming' || ongoingCallStatus === 'connecting') &&
        ongoingCallWith === ownerOfCall
      ) {
        closeVideoCall();
        window.inboxStore?.dispatch(endCall());
      }
      return;
    }

    // remote user hangup while we were on the call with him
    if (aboutCallUUID === currentCallUUID) {
      closeVideoCall();
      window.inboxStore?.dispatch(endCall());
    } else if (
      ongoingCallWith === sender &&
      (ongoingCallStatus === 'incoming' || ongoingCallStatus === 'connecting')
    ) {
      // remote user hangup an offer he sent but we did not accept it yet
      window.inboxStore?.dispatch(endCall());
    }
  }
}

async function buildAnswerAndSendIt(sender: string) {
  if (peerConnection) {
    if (!currentCallUUID) {
      console.warn('cannot send answer without a currentCallUUID');
      return;
    }
    await (peerConnection as any).setLocalDescription();
    const answer = peerConnection.localDescription;
    if (!answer?.sdp || answer.sdp.length === 0) {
      console.warn('failed to create answer');
      return;
    }
    const answerSdp = answer.sdp;
    const callAnswerMessage = new CallMessage({
      timestamp: Date.now(),
      type: SignalService.CallMessage.Type.ANSWER,
      sdps: [answerSdp],
      uuid: currentCallUUID,
    });

    console.info('sending ANSWER MESSAGE and sync');
    await sendCallMessageAndSync(callAnswerMessage, sender);
  }
}

export function isCallRejected(uuid: string) {
  return rejectedCallUUIDS.has(uuid);
}

function getCachedMessageFromCallMessage(
  callMessage: SignalService.CallMessage,
  envelopeTimestamp: number
) {
  return {
    type: callMessage.type,
    sdps: callMessage.sdps,
    sdpMLineIndexes: callMessage.sdpMLineIndexes,
    sdpMids: callMessage.sdpMids,
    uuid: callMessage.uuid,
    timestamp: envelopeTimestamp,
  };
}

async function isUserApprovedOrWeSentAMessage(user: string) {
  const isApproved = getConversationController()
    .get(user)
    ?.isApproved();

  if (isApproved) {
    return true;
  }

  return Data.hasConversationOutgoingMessage(user);
}

export async function handleCallTypeOffer(
  sender: string,
  callMessage: SignalService.CallMessage,
  incomingOfferTimestamp: number
) {
  try {
    const remoteCallUUID = callMessage.uuid;
    if (!remoteCallUUID || remoteCallUUID.length === 0) {
      throw new Error('incoming offer call has no valid uuid');
    }
    console.info('handling callMessage OFFER with uuid: ', remoteCallUUID);

    if (!getCallMediaPermissionsSettings()) {
      // we still add it to the cache so if user toggles settings in the next 60 sec, he can still reply to it
      const cachedMsg = getCachedMessageFromCallMessage(callMessage, incomingOfferTimestamp);
      pushCallMessageToCallCache(sender, remoteCallUUID, cachedMsg);

      await handleMissedCall(sender, incomingOfferTimestamp, 'permissions');
      return;
    }

    const shouldDisplayOffer = await isUserApprovedOrWeSentAMessage(sender);
    if (!shouldDisplayOffer) {
      const cachedMsg = getCachedMessageFromCallMessage(callMessage, incomingOfferTimestamp);
      pushCallMessageToCallCache(sender, remoteCallUUID, cachedMsg);

      await handleMissedCall(sender, incomingOfferTimestamp, 'not-approved');
      return;
    }

    // if the offer is more than the call timeout, don't try to handle it (as the sender would have already closed it)
    if (incomingOfferTimestamp <= Date.now() - callTimeoutMs) {
      await handleMissedCall(sender, incomingOfferTimestamp, 'too-old-timestamp');
      return;
    }

    if (currentCallUUID && currentCallUUID !== remoteCallUUID) {
      // we just got a new offer with a different callUUID. this is a missed call (from either the same sender or another one)
      if (callCache.get(sender)?.has(currentCallUUID)) {
        // this is a missed call from the same sender but with a different callID.
        // another call from another device maybe? just reject it.
        await rejectCallAlreadyAnotherCall(sender, remoteCallUUID);
        return;
      }
      // add a message in the convo with this user about the missed call.
      await handleMissedCall(sender, incomingOfferTimestamp, 'another-call-ongoing');
      // Here, we are in a call, and we got an offer from someone we are in a call with, and not one of his other devices.
      // Just hangup automatically the call on the calling side.

      await rejectCallAlreadyAnotherCall(sender, remoteCallUUID);

      return;
    }

    const readyForOffer =
      !makingOffer && (peerConnection?.signalingState === 'stable' || isSettingRemoteAnswerPending);
    const polite = lastOutgoingOfferTimestamp < incomingOfferTimestamp;
    const offerCollision = !readyForOffer;
    ignoreOffer = !polite && offerCollision;

    if (ignoreOffer) {
      console?.warn('Received offer when unready for offer; Ignoring offer.');
      return;
    }

    if (peerConnection && remoteCallUUID === currentCallUUID && currentCallUUID) {
      console.info('Got a new offer message from our ongoing call');

      const remoteOfferDesc = new RTCSessionDescription({
        type: 'offer',
        sdp: callMessage.sdps[0],
      });
      isSettingRemoteAnswerPending = false;

      await peerConnection.setRemoteDescription(remoteOfferDesc); // SRD rolls back as needed
      isSettingRemoteAnswerPending = false;

      await buildAnswerAndSendIt(sender);
    } else {
      window.inboxStore?.dispatch(incomingCall({ pubkey: sender }));

      // show a notification
      const callerConvo = getConversationController().get(sender);
      const convNotif = callerConvo?.get('triggerNotificationsFor') || 'disabled';
      if (convNotif === 'disabled') {
        window?.log?.info('notifications disabled for convo', ed25519Str(sender));
      } else if (callerConvo) {
        await callerConvo.notifyIncomingCall();
      }
    }
    const cachedMessage = getCachedMessageFromCallMessage(callMessage, incomingOfferTimestamp);

    pushCallMessageToCallCache(sender, remoteCallUUID, cachedMessage);
  } catch (err) {
    console?.error(`Error handling offer message ${err}`);
  }
}

export async function handleMissedCall(
  sender: string,
  incomingOfferTimestamp: number,
  reason: 'not-approved' | 'permissions' | 'another-call-ongoing' | 'too-old-timestamp'
) {
  const incomingCallConversation = getConversationController().get(sender);

  const displayname =
    incomingCallConversation?.getNickname() ||
    incomingCallConversation?.getRealSessionUsername() ||
    window.i18n('unknown');

  switch (reason) {
    case 'permissions':
      ToastUtils.pushedMissedCallCauseOfPermission(displayname);
      break;
    case 'another-call-ongoing':
      ToastUtils.pushedMissedCall(displayname);
      break;
    case 'not-approved':
      ToastUtils.pushedMissedCallNotApproved(displayname);
      break;
    case 'too-old-timestamp':
      // no toast for this case, the missed call notification is enough
      break;
    default:
  }

  await addMissedCallMessage(sender, incomingOfferTimestamp);
}

async function addMissedCallMessage(callerPubkey: string, sentAt: number) {
  const incomingCallConversation = getConversationController().get(callerPubkey);

  if (incomingCallConversation.isActive() || incomingCallConversation.isHidden()) {
    incomingCallConversation.set('active_at', GetNetworkTime.getNowWithNetworkOffset());
    await incomingCallConversation.unhideIfNeeded(false);
  }

  await incomingCallConversation?.addSingleIncomingMessage({
    source: callerPubkey,
    sent_at: sentAt,
    received_at: GetNetworkTime.getNowWithNetworkOffset(),
    expireTimer: 0,
    callNotificationType: 'missed-call',
    unread: READ_MESSAGE_STATE.unread,
  });
}

function getOwnerOfCallUUID(callUUID: string) {
  for (const deviceKey of callCache.keys()) {
    for (const callUUIDEntry of callCache.get(deviceKey) as Map<
      string,
      Array<CachedCallMessageType>
    >) {
      if (callUUIDEntry[0] === callUUID) {
        return deviceKey;
      }
    }
  }
  return null;
}

export async function handleCallTypeAnswer(
  sender: string,
  callMessage: SignalService.CallMessage,
  envelopeTimestamp: number
) {
  if (!callMessage.sdps || callMessage.sdps.length === 0) {
    console.warn('cannot handle answered message without signal description proto sdps');
    return;
  }
  const callMessageUUID = callMessage.uuid;
  if (!callMessageUUID || callMessageUUID.length === 0) {
    console.warn('handleCallTypeAnswer has no valid uuid');
    return;
  }

  // this is an answer we sent to ourself, this must be about another of our device accepting an incoming call.
  // if we accepted that call already from the current device, currentCallUUID would be set
  if (sender === UserUtils.getOurPubKeyStrFromCache()) {
    // when we answer a call, we get this message on all our devices, including the one we just accepted the call with.

    const isDeviceWhichJustAcceptedCall = currentCallUUID === callMessageUUID;

    if (isDeviceWhichJustAcceptedCall) {
      console.info(
        `isDeviceWhichJustAcceptedCall: skipping message back ANSWER from ourself about call ${callMessageUUID}`
      );

      return;
    }
    console.info(`handling callMessage ANSWER from ourself about call ${callMessageUUID}`);

    const { ongoingCallStatus, ongoingCallWith } = getCallingStateOutsideOfRedux();
    const foundOwnerOfCallUUID = getOwnerOfCallUUID(callMessageUUID);

    if (callMessageUUID !== currentCallUUID) {
      // this is an answer we sent from another of our devices
      // automatically close that call
      if (foundOwnerOfCallUUID) {
        rejectedCallUUIDS.add(callMessageUUID);
        // if this call is about the one being currently displayed, force close it
        if (ongoingCallStatus && ongoingCallWith === foundOwnerOfCallUUID) {
          closeVideoCall();
        }

        window.inboxStore?.dispatch(endCall());
      }
    }
    return;
  }
  console.info(`handling callMessage ANSWER from ${callMessageUUID}`);

  const cachedMessage = getCachedMessageFromCallMessage(callMessage, envelopeTimestamp);

  pushCallMessageToCallCache(sender, callMessageUUID, cachedMessage);

  if (!peerConnection) {
    console.info('handleCallTypeAnswer without peer connection. Dropping');
    return;
  }
  window.inboxStore?.dispatch(
    answerCall({
      pubkey: sender,
    })
  );

  try {
    isSettingRemoteAnswerPending = true;

    const remoteDesc = new RTCSessionDescription({
      type: 'answer',
      sdp: callMessage.sdps[0],
    });

    await peerConnection?.setRemoteDescription(remoteDesc); // SRD rolls back as needed
  } catch (e) {
    console.warn('setRemoteDescriptio failed:', e);
  } finally {
    isSettingRemoteAnswerPending = false;
  }
}

export async function handleCallTypeIceCandidates(
  sender: string,
  callMessage: SignalService.CallMessage,
  envelopeTimestamp: number
) {
  if (!callMessage.sdps || callMessage.sdps.length === 0) {
    console.warn('cannot handle iceCandicates message without candidates');
    return;
  }
  const remoteCallUUID = callMessage.uuid;
  if (!remoteCallUUID || remoteCallUUID.length === 0) {
    console.warn('handleCallTypeIceCandidates has no valid uuid');
    return;
  }
  console.info('handling callMessage ICE_CANDIDATES');
  const cachedMessage = getCachedMessageFromCallMessage(callMessage, envelopeTimestamp);

  pushCallMessageToCallCache(sender, remoteCallUUID, cachedMessage);
  if (currentCallUUID && callMessage.uuid === currentCallUUID) {
    await addIceCandidateToExistingPeerConnection(callMessage);
  }
}

async function addIceCandidateToExistingPeerConnection(callMessage: SignalService.CallMessage) {
  if (peerConnection) {
    for (let index = 0; index < callMessage.sdps.length; index++) {
      const sdp = callMessage.sdps[index];
      const sdpMLineIndex = callMessage.sdpMLineIndexes[index];
      const sdpMid = callMessage.sdpMids[index];
      const candicate = new RTCIceCandidate({ sdpMid, sdpMLineIndex, candidate: sdp });
      try {
        // eslint-disable-next-line no-await-in-loop
        await peerConnection.addIceCandidate(candicate);
      } catch (err) {
        if (!ignoreOffer) {
          console?.warn('Error handling ICE candidates message', err);
        }
      }
    }
  } else {
    console.info('handleIceCandidatesMessage but we do not have a peerconnection set');
  }
}

export async function handleOtherCallTypes(
  sender: string,
  callMessage: SignalService.CallMessage,
  envelopeTimestamp: number
) {
  const remoteCallUUID = callMessage.uuid;
  if (!remoteCallUUID || remoteCallUUID.length === 0) {
    console.warn('handleOtherCallTypes has no valid uuid');
    return;
  }
  const cachedMessage = getCachedMessageFromCallMessage(callMessage, envelopeTimestamp);
  pushCallMessageToCallCache(sender, remoteCallUUID, cachedMessage);
}

function clearCallCacheFromPubkeyAndUUID(sender: string, callUUID: string) {
  callCache.get(sender)?.delete(callUUID);
}

function createCallCacheForPubkeyAndUUID(sender: string, uuid: string) {
  if (!callCache.has(sender)) {
    callCache.set(sender, new Map());
  }

  if (!callCache.get(sender)?.has(uuid)) {
    callCache.get(sender)?.set(uuid, []);
  }
}

function pushCallMessageToCallCache(
  sender: string,
  uuid: string,
  callMessage: CachedCallMessageType
) {
  createCallCacheForPubkeyAndUUID(sender, uuid);
  callCache
    .get(sender)
    ?.get(uuid)
    ?.push(callMessage);
}

/**
 * Called when the settings of call media permissions is set to true from the settings page.
 * Check for any recent offer and display it to the user if needed.
 */
export function onTurnedOnCallMediaPermissions() {
  // this is not ideal as this might take the not latest sender from callCache
  callCache.forEach((sender, key) => {
    sender.forEach(msgs => {
      for (const msg of msgs.reverse()) {
        if (
          msg.type === SignalService.CallMessage.Type.OFFER &&
          Date.now() - msg.timestamp < DURATION.MINUTES * 1
        ) {
          window.inboxStore?.dispatch(incomingCall({ pubkey: key }));
          break;
        }
      }
    });
  });
}

export function getCurrentCallDuration() {
  return currentCallStartTimestamp
    ? Math.floor((Date.now() - currentCallStartTimestamp) / 1000)
    : undefined;
}
