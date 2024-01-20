import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import { PubKey } from '../types';
import { getMessageQueue } from '..';
import { Data } from '../../data/data';
import { ConversationModel } from '../../models/conversation';
import { ConversationAttributes, ConversationTypeEnum } from '../../models/conversationAttributes';
import { MessageModel } from '../../models/message';
import { SignalService } from '../../protobuf';
import {
  addKeyPairToCacheAndDBIfNeeded,
  distributingClosedGroupEncryptionKeyPairs,
} from '../../receiver/closedGroups';
import { ECKeyPair } from '../../receiver/keypairs';
import { GetNetworkTime } from '../apis/snode_api/getNetworkTime';
import { SnodeNamespaces } from '../apis/snode_api/namespaces';
import { getConversationController } from '../conversations';
import { generateCurve25519KeyPairWithoutPrefix } from '../crypto';
import { encryptUsingSessionProtocol } from '../crypto/MessageEncrypter';
import { ClosedGroupAddedMembersMessage } from '../messages/outgoing/controlMessage/group/ClosedGroupAddedMembersMessage';
import { ClosedGroupEncryptionPairMessage } from '../messages/outgoing/controlMessage/group/ClosedGroupEncryptionPairMessage';
import { ClosedGroupNameChangeMessage } from '../messages/outgoing/controlMessage/group/ClosedGroupNameChangeMessage';
import { ClosedGroupNewMessage } from '../messages/outgoing/controlMessage/group/ClosedGroupNewMessage';
import { ClosedGroupRemovedMembersMessage } from '../messages/outgoing/controlMessage/group/ClosedGroupRemovedMembersMessage';
import { UserUtils } from '../utils';
import { fromHexToArray, toHex } from '../utils/String';

export type GroupInfo = {
  id: string;
  name: string;
  members: Array<string>;
  zombies?: Array<string>;
  activeAt?: number;
  expireTimer?: number | null;
  admins?: Array<string>;
};

export interface GroupDiff extends MemberChanges {
  newName?: string;
}

export interface MemberChanges {
  joiningMembers?: Array<string>;
  leavingMembers?: Array<string>;
  kickedMembers?: Array<string>;
}

/**
 * This function is only called when the local user makes a change to a group.
 * So this function is not called on group updates from the network, even from another of our devices.
 *
 * @param groupId the conversationID
 * @param groupName the new name (or just pass the old one if nothing changed)
 * @param members the new members (or just pass the old one if nothing changed)
 * @returns nothing
 */
export async function initiateClosedGroupUpdate(
  groupId: string,
  groupName: string,
  members: Array<string>
) {
  const isGroupV3 = PubKey.isClosedGroupV3(groupId);
  const convo = await getConversationController().getOrCreateAndWait(
    groupId,
    isGroupV3 ? ConversationTypeEnum.GROUPV3 : ConversationTypeEnum.GROUP
  );

  // do not give an admins field here. We don't want to be able to update admins and
  // updateOrCreateClosedGroup() will update them if given the choice.
  const groupDetails: GroupInfo = {
    id: groupId,
    name: groupName,
    members,
    // remove from the zombies list the zombies not which are not in the group anymore
    zombies: convo.get('zombies')?.filter(z => members.includes(z)),
    activeAt: Date.now(),
    expireTimer: convo.get('expireTimer'),
  };

  const diff = buildGroupDiff(convo, groupDetails);

  await updateOrCreateClosedGroup(groupDetails);

  const updateObj: GroupInfo = {
    id: groupId,
    name: groupName,
    members,
    admins: convo.get('groupAdmins'),
    expireTimer: convo.get('expireTimer'),
  };

  if (diff.newName?.length) {
    const nameOnlyDiff: GroupDiff = _.pick(diff, 'newName');

    const dbMessageName = await addUpdateMessage(
      convo,
      nameOnlyDiff,
      UserUtils.getOurPubKeyStrFromCache(),
      Date.now()
    );
    await sendNewName(convo, diff.newName, dbMessageName.id as string);
  }

  if (diff.joiningMembers?.length) {
    const joiningOnlyDiff: GroupDiff = _.pick(diff, 'joiningMembers');

    const dbMessageAdded = await addUpdateMessage(
      convo,
      joiningOnlyDiff,
      UserUtils.getOurPubKeyStrFromCache(),
      Date.now()
    );
    await sendAddedMembers(convo, diff.joiningMembers, dbMessageAdded.id as string, updateObj);
  }

  if (diff.leavingMembers?.length) {
    const leavingOnlyDiff: GroupDiff = { kickedMembers: diff.leavingMembers };
    const dbMessageLeaving = await addUpdateMessage(
      convo,
      leavingOnlyDiff,
      UserUtils.getOurPubKeyStrFromCache(),
      Date.now()
    );
    const stillMembers = members;
    await sendRemovedMembers(
      convo,
      diff.leavingMembers,
      stillMembers,
      dbMessageLeaving.id as string
    );
  }
  await convo.commit();
}

export async function addUpdateMessage(
  convo: ConversationModel,
  diff: GroupDiff,
  sender: string,
  sentAt: number
): Promise<MessageModel> {
  const groupUpdate: any = {};

  if (diff.newName) {
    groupUpdate.name = diff.newName;
  }

  if (diff.joiningMembers) {
    groupUpdate.joined = diff.joiningMembers;
  }

  if (diff.leavingMembers) {
    groupUpdate.left = diff.leavingMembers;
  }

  if (diff.kickedMembers) {
    groupUpdate.kicked = diff.kickedMembers;
  }

  if (UserUtils.isUsFromCache(sender)) {
    const outgoingMessage = await convo.addSingleOutgoingMessage({
      sent_at: sentAt,
      group_update: groupUpdate,
      expireTimer: 0,
    });
    return outgoingMessage;
  }
  // addSingleIncomingMessage also takes care of updating the unreadCount

  const incomingMessage = await convo.addSingleIncomingMessage({
    sent_at: sentAt,
    group_update: groupUpdate,
    expireTimer: 0,
    source: sender,
  });
  await convo.commit();
  return incomingMessage;
}

function buildGroupDiff(convo: ConversationModel, update: GroupInfo): GroupDiff {
  const groupDiff: GroupDiff = {};

  if (convo.get('displayNameInProfile') !== update.name) {
    groupDiff.newName = update.name;
  }

  const oldMembers = convo.get('members');
  const oldZombies = convo.get('zombies');
  const oldMembersWithZombies = _.uniq(oldMembers.concat(oldZombies));

  const newMembersWithZombiesLeft = _.uniq(update.members.concat(update.zombies || []));

  const addedMembers = _.difference(newMembersWithZombiesLeft, oldMembersWithZombies);
  if (addedMembers.length > 0) {
    groupDiff.joiningMembers = addedMembers;
  }
  // Check if anyone got kicked:
  const removedMembers = _.difference(oldMembersWithZombies, newMembersWithZombiesLeft);
  if (removedMembers.length > 0) {
    groupDiff.leavingMembers = removedMembers;
  }

  return groupDiff;
}

export async function updateOrCreateClosedGroup(details: GroupInfo) {
  const { id, expireTimer } = details;

  const conversation = await getConversationController().getOrCreateAndWait(
    id,
    ConversationTypeEnum.GROUP
  );

  const updates: Pick<
    ConversationAttributes,
    'type' | 'members' | 'displayNameInProfile' | 'active_at' | 'left'
  > = {
    displayNameInProfile: details.name,
    members: details.members,
    // Note: legacy group to not support change of admins.
    type: ConversationTypeEnum.GROUP,
    active_at: details.activeAt ? details.activeAt : 0,
    left: !details.activeAt,
  };

  conversation.set(updates);
  await conversation.unhideIfNeeded(false);

  if (details.admins?.length) {
    await conversation.updateGroupAdmins(details.admins, false);
  }

  await conversation.commit();

  if (expireTimer === undefined || typeof expireTimer !== 'number') {
    return;
  }
  await conversation.updateExpireTimer(
    expireTimer,
    UserUtils.getOurPubKeyStrFromCache(),
    Date.now(),
    {
      fromSync: true,
    }
  );
}

async function sendNewName(convo: ConversationModel, name: string, messageId: string) {
  if (name.length === 0) {
    console.warn('No name given for group update. Skipping');
    return;
  }

  const groupId = convo.get('id');

  // Send the update to the group
  const nameChangeMessage = new ClosedGroupNameChangeMessage({
    timestamp: Date.now(),
    groupId,
    identifier: messageId,
    name,
  });
  await getMessageQueue().sendToGroup({
    message: nameChangeMessage,
    namespace: SnodeNamespaces.ClosedGroupMessage,
  });
}

async function sendAddedMembers(
  convo: ConversationModel,
  addedMembers: Array<string>,
  messageId: string,
  groupUpdate: GroupInfo
) {
  if (!addedMembers?.length) {
    console.warn('No addedMembers given for group update. Skipping');
    return;
  }

  const { id: groupId, members, name: groupName } = groupUpdate;
  const admins = groupUpdate.admins || [];

  // Check preconditions
  const hexEncryptionKeyPair = await Data.getLatestClosedGroupEncryptionKeyPair(groupId);
  if (!hexEncryptionKeyPair) {
    throw new Error("Couldn't get key pair for closed group");
  }

  const encryptionKeyPair = ECKeyPair.fromHexKeyPair(hexEncryptionKeyPair);
  const existingExpireTimer = convo.get('expireTimer') || 0;
  // Send the Added Members message to the group (only members already in the group will get it)
  const closedGroupControlMessage = new ClosedGroupAddedMembersMessage({
    timestamp: Date.now(),
    groupId,
    addedMembers,
    identifier: messageId,
  });
  await getMessageQueue().sendToGroup({
    message: closedGroupControlMessage,
    namespace: SnodeNamespaces.ClosedGroupMessage,
  });

  // Send closed group update messages to any new members individually
  const newClosedGroupUpdate = new ClosedGroupNewMessage({
    timestamp: Date.now(),
    name: groupName,
    groupId,
    admins,
    members,
    keypair: encryptionKeyPair,
    identifier: messageId || uuidv4(),
    expireTimer: existingExpireTimer,
  });

  const promises = addedMembers.map(async m => {
    await getConversationController().getOrCreateAndWait(m, ConversationTypeEnum.PRIVATE);
    const memberPubKey = PubKey.cast(m);
    await getMessageQueue().sendToPubKey(
      memberPubKey,
      newClosedGroupUpdate,
      SnodeNamespaces.UserMessages
    );
  });
  await Promise.all(promises);
}

export async function sendRemovedMembers(
  convo: ConversationModel,
  removedMembers: Array<string>,
  stillMembers: Array<string>,
  messageId?: string
) {
  if (!removedMembers?.length) {
    console.warn('No removedMembers given for group update. Skipping');
    return;
  }
  const ourNumber = UserUtils.getOurPubKeyFromCache();
  const admins = convo.get('groupAdmins') || [];
  const groupId = convo.get('id');

  const isCurrentUserAdmin = admins.includes(ourNumber.key);
  const isUserLeaving = removedMembers.includes(ourNumber.key);
  if (isUserLeaving) {
    throw new Error('Cannot remove members and leave the group at the same time');
  }
  if (removedMembers.includes(admins[0]) && stillMembers.length !== 0) {
    throw new Error("Can't remove admin from closed group without removing everyone.");
  }
  // Send the update to the group and generate + distribute a new encryption key pair if needed
  const mainClosedGroupControlMessage = new ClosedGroupRemovedMembersMessage({
    timestamp: Date.now(),
    groupId,
    removedMembers,
    identifier: messageId,
  });
  // Send the group update, and only once sent, generate and distribute a new encryption key pair if needed
  await getMessageQueue().sendToGroup({
    message: mainClosedGroupControlMessage,
    namespace: SnodeNamespaces.ClosedGroupMessage,
    sentCb: async () => {
      if (isCurrentUserAdmin) {
        // we send the new encryption key only to members already here before the update
        console.info(
          `Sending group update: A user was removed from ${groupId} and we are the admin. Generating and sending a new EncryptionKeyPair`
        );

        await generateAndSendNewEncryptionKeyPair(groupId, stillMembers);
      }
    },
  });
}

async function generateAndSendNewEncryptionKeyPair(
  groupPublicKey: string,
  targetMembers: Array<string>
) {
  const groupConvo = getConversationController().get(groupPublicKey);
  const groupId = fromHexToArray(groupPublicKey);

  if (!groupConvo) {
    console.warn(
      'generateAndSendNewEncryptionKeyPair: conversation not found',
      groupPublicKey
    );
    return;
  }
  if (!groupConvo.isClosedGroup()) {
    console.warn(
      'generateAndSendNewEncryptionKeyPair: conversation not a closed group',
      groupPublicKey
    );
    return;
  }

  const ourNumber = UserUtils.getOurPubKeyStrFromCache();
  if (!groupConvo.get('groupAdmins')?.includes(ourNumber)) {
    console.warn('generateAndSendNewEncryptionKeyPair: cannot send it as a non admin');
    return;
  }

  // Generate the new encryption key pair
  const newKeyPair = await generateCurve25519KeyPairWithoutPrefix();

  if (!newKeyPair) {
    console.warn('generateAndSendNewEncryptionKeyPair: failed to generate new keypair');
    return;
  }
  // Distribute it
  const wrappers = await buildEncryptionKeyPairWrappers(targetMembers, newKeyPair);

  const keypairsMessage = new ClosedGroupEncryptionPairMessage({
    groupId: toHex(groupId),
    timestamp: GetNetworkTime.getNowWithNetworkOffset(),
    encryptedKeyPairs: wrappers,
  });

  distributingClosedGroupEncryptionKeyPairs.set(toHex(groupId), newKeyPair);

  const messageSentCallback = async () => {
    console.info(
      `KeyPairMessage for ClosedGroup ${groupPublicKey} is sent. Saving the new encryptionKeyPair.`
    );

    distributingClosedGroupEncryptionKeyPairs.delete(toHex(groupId));

    await addKeyPairToCacheAndDBIfNeeded(toHex(groupId), newKeyPair.toHexKeyPair());
    await groupConvo?.commit(); // this makes sure to include the new encryption keypair in the libsession usergroup wrapper
  };

  // this is to be sent to the group pubkey address
  await getMessageQueue().sendToGroup({
    message: keypairsMessage,
    namespace: SnodeNamespaces.ClosedGroupMessage,
    sentCb: messageSentCallback,
  });
}

export async function buildEncryptionKeyPairWrappers(
  targetMembers: Array<string>,
  encryptionKeyPair: ECKeyPair
) {
  if (
    !encryptionKeyPair ||
    !encryptionKeyPair.publicKeyData.length ||
    !encryptionKeyPair.privateKeyData.length
  ) {
    throw new Error('buildEncryptionKeyPairWrappers() needs a valid encryptionKeyPair set');
  }

  const proto = new SignalService.KeyPair({
    privateKey: encryptionKeyPair?.privateKeyData,
    publicKey: encryptionKeyPair?.publicKeyData,
  });
  const plaintext = SignalService.KeyPair.encode(proto).finish();

  const wrappers = await Promise.all(
    targetMembers.map(async pubkey => {
      const ciphertext = await encryptUsingSessionProtocol(PubKey.cast(pubkey), plaintext);
      return new SignalService.DataMessage.ClosedGroupControlMessage.KeyPairWrapper({
        encryptedKeyPair: ciphertext,
        publicKey: fromHexToArray(pubkey),
      });
    })
  );
  return wrappers;
}
