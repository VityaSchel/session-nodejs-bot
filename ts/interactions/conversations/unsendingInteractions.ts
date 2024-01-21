// import { console } from '../sessionjs-logger';
// import { compact } from 'lodash';
// import { Data } from '../../data/data';
// import { ConversationModel } from '../../models/conversation';
// import { MessageModel } from '../../models/message';
// import { getMessageQueue } from '../../session';
// import { getConversationController } from '../../session/conversations';
// import { UnsendMessage } from '../../session/messages/outgoing/controlMessage/UnsendMessage';
// import { ed25519Str } from '../../session/onions/onionPath';
// import { SnodeAPI } from '../../session/apis/snode_api/SNodeAPI';
// import { PubKey } from '../../session/types';
// import { UserUtils } from '../../session/utils';
// import { resetSelectedMessageIds } from '../../state/ducks/conversations';
// import { deleteSogsMessageByServerIds } from '../../session/apis/open_group_api/sogsv3/sogsV3DeleteMessages';
// import { SnodeNamespaces } from '../../session/apis/snode_api/namespaces';

// /**
//  * Deletes messages for everyone in a 1-1 or everyone in a closed group conversation.
//  */
// async function unsendMessagesForEveryone(
//   conversation: ConversationModel,
//   msgsToDelete: Array<MessageModel>
// ) {
//   console.info('Deleting messages for all users in this conversation');
//   const destinationId = conversation.id;
//   if (!destinationId) {
//     return;
//   }
//   if (conversation.isOpenGroupV2()) {
//     throw new Error(
//       'Cannot unsend a message for an opengroup v2. This has to be a deleteMessage api call'
//     );
//   }
//   const unsendMsgObjects = getUnsendMessagesObjects(msgsToDelete);

//   if (conversation.isPrivate()) {
//     // sending to recipient all the messages separately for now
//     await Promise.all(
//       unsendMsgObjects.map(unsendObject =>
//         getMessageQueue()
//           .sendToPubKey(new PubKey(destinationId), unsendObject, SnodeNamespaces.UserMessages)
//           .catch(console.error)
//       )
//     );
//     await Promise.all(
//       unsendMsgObjects.map(unsendObject =>
//         getMessageQueue()
//           .sendSyncMessage({ namespace: SnodeNamespaces.UserMessages, message: unsendObject })
//           .catch(console.error)
//       )
//     );
//   } else if (conversation.isClosedGroup()) {
//     // sending to recipient all the messages separately for now
//     await Promise.all(
//       unsendMsgObjects.map(unsendObject => {
//         return getMessageQueue()
//           .sendToGroup({
//             message: unsendObject,
//             namespace: SnodeNamespaces.ClosedGroupMessage,
//             groupPubKey: new PubKey(destinationId),
//           })
//           .catch(console.error);
//       })
//     );
//   }
//   await deleteMessagesFromSwarmAndCompletelyLocally(conversation, msgsToDelete);

//   // window.inboxStore?.dispatch(resetSelectedMessageIds());
//   console.log('[SBOT/redux] resetSelectedMessageIds')
//   console.log('[SBOT] deleted', msgsToDelete.length);
// }

// function getUnsendMessagesObjects(messages: Array<MessageModel>) {
//   // #region building request
//   return compact(
//     messages.map(message => {
//       const author = message.get('source');

//       // call getPropsForMessage here so we get the received_at or sent_at timestamp in timestamp
//       const timestamp = message.getPropsForMessage().timestamp;
//       if (!timestamp) {
//         console.error('cannot find timestamp - aborting unsend request');
//         return undefined;
//       }

//       const unsendParams = {
//         timestamp,
//         author,
//       };

//       return new UnsendMessage(unsendParams);
//     })
//   );
//   // #endregion
// }

// /**
//  * Do a single request to the swarm with all the message hashes to delete from the swarm.
//  *
//  * It does not delete anything locally.
//  *
//  * Returns true if no errors happened, false in an error happened
//  */
// export async function deleteMessagesFromSwarmOnly(messages: Array<MessageModel>) {
//   try {
//     const deletionMessageHashes = compact(messages.map(m => m.get('messageHash')));
//     if (deletionMessageHashes.length > 0) {
//       const errorOnSnode = await SnodeAPI.networkDeleteMessages(deletionMessageHashes);
//       return errorOnSnode === null || errorOnSnode.length === 0;
//     }
//     console?.warn(
//       'deleteMessagesFromSwarmOnly: We do not have hashes for some of those messages'
//     );
//     return false;
//   } catch (e) {
//     console?.error('deleteMessagesFromSwarmOnly: Error deleting message from swarm', e);
//     return false;
//   }
// }

// /**
//  * Delete the messages from the swarm with an unsend request and if it worked, delete those messages locally.
//  * If an error happened, we just return false, Toast an error, and do not remove the messages locally at all.
//  */
// export async function deleteMessagesFromSwarmAndCompletelyLocally(
//   conversation: ConversationModel,
//   messages: Array<MessageModel>
// ) {
//   if (conversation.isClosedGroup()) {
//     console.info('Cannot delete message from a closed group swarm, so we just complete delete.');
//     await Promise.all(
//       messages.map(async message => {
//         return deleteMessageLocallyOnly({ conversation, message, deletionType: 'complete' });
//       })
//     );
//     return;
//   }
//   console.warn(
//     'Deleting from swarm of ',
//     ed25519Str(conversation.id),
//     ' hashes: ',
//     messages.map(m => m.get('messageHash'))
//   );
//   const deletedFromSwarm = await deleteMessagesFromSwarmOnly(messages);
//   if (!deletedFromSwarm) {
//     console.warn(
//       'deleteMessagesFromSwarmAndCompletelyLocally: some messages failed to be deleted. Maybe they were already deleted?'
//     );
//   }
//   await Promise.all(
//     messages.map(async message => {
//       return deleteMessageLocallyOnly({ conversation, message, deletionType: 'complete' });
//     })
//   );
// }

// /**
//  * Delete the messages from the swarm with an unsend request and if it worked, mark those messages locally as deleted but do not remove them.
//  * If an error happened, we still mark the message locally as deleted.
//  */
// export async function deleteMessagesFromSwarmAndMarkAsDeletedLocally(
//   conversation: ConversationModel,
//   messages: Array<MessageModel>
// ) {
//   if (conversation.isClosedGroup()) {
//     console.info('Cannot delete messages from a closed group swarm, so we just markDeleted.');
//     await Promise.all(
//       messages.map(async message => {
//         return deleteMessageLocallyOnly({ conversation, message, deletionType: 'markDeleted' });
//       })
//     );
//     return;
//   }
//   const deletedFromSwarm = await deleteMessagesFromSwarmOnly(messages);
//   if (!deletedFromSwarm) {
//     console.warn(
//       'deleteMessagesFromSwarmAndMarkAsDeletedLocally: some messages failed to be deleted but still removing the messages content... '
//     );
//   }
//   await Promise.all(
//     messages.map(async message => {
//       return deleteMessageLocallyOnly({ conversation, message, deletionType: 'markDeleted' });
//     })
//   );
// }

// /**
//  * Deletes a message completely or mark it as deleted only. Does not interact with the swarm at all
//  * @param message Message to delete
//  * @param deletionType 'complete' means completely delete the item from the database, markDeleted means empty the message content but keep an entry
//  */
// export async function deleteMessageLocallyOnly({
//   conversation,
//   message,
//   deletionType,
// }: {
//   conversation: ConversationModel;
//   message: MessageModel;
//   deletionType: 'complete' | 'markDeleted';
// }) {
//   if (deletionType === 'complete') {
//     // remove the message from the database
//     await conversation.removeMessage(message.get('id'));
//   } else {
//     // just mark the message as deleted but still show in conversation
//     await message.markAsDeleted();
//     await message.markMessageAsRead(Date.now());
//   }
//   conversation.updateLastMessage();
// }

// /**
//  * Send an UnsendMessage synced message so our devices removes those messages locally,
//  * and send an unsend request on our swarm so this message is effectively removed.
//  *
//  * Show a toast on error/success and reset the selection
//  */
// async function unsendMessageJustForThisUser(
//   conversation: ConversationModel,
//   msgsToDelete: Array<MessageModel>
// ) {
//   console.warn('Deleting messages just for this user');

//   const unsendMsgObjects = getUnsendMessagesObjects(msgsToDelete);

//   // sending to our other devices all the messages separately for now
//   await Promise.all(
//     unsendMsgObjects.map(unsendObject =>
//       getMessageQueue()
//         .sendSyncMessage({ namespace: SnodeNamespaces.UserMessages, message: unsendObject })
//         .catch(console.error)
//     )
//   );
//   await deleteMessagesFromSwarmAndCompletelyLocally(conversation, msgsToDelete);

//   // Update view and trigger update
//   // window.inboxStore?.dispatch(resetSelectedMessageIds());
//   console.log('[SBOT/redux] resetSelectedMessageIds')
//   console.log('[SBOT] deleted', msgsToDelete.length);
// }

// const doDeleteSelectedMessagesInSOGS = async (
//   selectedMessages: Array<MessageModel>,
//   conversation: ConversationModel,
//   isAllOurs: boolean
// ) => {
//   const ourDevicePubkey = UserUtils.getOurPubKeyStrFromCache();
//   if (!ourDevicePubkey) {
//     return;
//   }
//   // #region open group v2 deletion
//   // Get our Moderator status
//   const isAdmin = conversation.isAdmin(ourDevicePubkey);
//   const isModerator = conversation.isModerator(ourDevicePubkey);

//   if (!isAllOurs && !(isAdmin || isModerator)) {
//     console.log('Cant delete message (forbidden)')
//     // window.inboxStore?.dispatch(resetSelectedMessageIds());
//     console.log('[SBOT/redux] resetSelectedMessageIds')
//     return;
//   }

//   const toDeleteLocallyIds = await deleteOpenGroupMessages(selectedMessages, conversation);
//   if (toDeleteLocallyIds.length === 0) {
//     // Message failed to delete from server, show error?
//     return;
//   }
//   await Promise.all(
//     toDeleteLocallyIds.map(async id => {
//       const msgToDeleteLocally = await Data.getMessageById(id);
//       if (msgToDeleteLocally) {
//         return deleteMessageLocallyOnly({
//           conversation,
//           message: msgToDeleteLocally,
//           deletionType: 'complete',
//         });
//       }
//       return null;
//     })
//   );
//   // successful deletion
//   console.log('[SBOT] deleted', toDeleteLocallyIds.length);
//   // window.inboxStore?.dispatch(resetSelectedMessageIds());
//   console.log('[SBOT/redux] resetSelectedMessageIds')
//   // #endregion
// };

// /**
//  * Effectively delete the messages from a conversation.
//  * This call is to be called by the user on a confirmation dialog for instance.
//  *
//  * It does what needs to be done on a user action to delete messages for each conversation type
//  */
// const doDeleteSelectedMessages = async ({
//   conversation,
//   selectedMessages,
//   deleteForEveryone,
// }: {
//   selectedMessages: Array<MessageModel>;
//   conversation: ConversationModel;
//   deleteForEveryone: boolean;
// }) => {
//   const ourDevicePubkey = UserUtils.getOurPubKeyStrFromCache();
//   if (!ourDevicePubkey) {
//     return;
//   }

//   const isAllOurs = selectedMessages.every(message => ourDevicePubkey === message.getSource());
//   if (conversation.isPublic()) {
//     await doDeleteSelectedMessagesInSOGS(selectedMessages, conversation, isAllOurs);
//     return;
//   }

//   // #region deletion for 1-1 and closed groups

//   if (deleteForEveryone) {
//     if (!isAllOurs) {
//       console.log('Cant delete message (forbidden)')
//       // window.inboxStore?.dispatch(resetSelectedMessageIds());
//       console.log('[SBOT/redux] resetSelectedMessageIds')
//       return;
//     }
//     await unsendMessagesForEveryone(conversation, selectedMessages);
//     return;
//   }

//   // delete just for me in a closed group only means delete locally
//   if (conversation.isClosedGroup()) {
//     await deleteMessagesFromSwarmAndCompletelyLocally(conversation, selectedMessages);

//     // Update view and trigger update
//     // window.inboxStore?.dispatch(resetSelectedMessageIds());
//     console.log('[SBOT/redux] resetSelectedMessageIds')
//     console.log('[SBOT] deleted', selectedMessages.length);
//     return;
//   }
//   // otherwise, delete that message locally, from our swarm and from our other devices
//   await unsendMessageJustForThisUser(conversation, selectedMessages);

//   // #endregion
// };

// export async function deleteMessagesByIdForEveryone(
//   messageIds: Array<string>,
//   conversationId: string
// ) {
//   const conversation = getConversationController().getOrThrow(conversationId);
//   const selectedMessages = compact(
//     await Promise.all(messageIds.map(m => Data.getMessageById(m, false)))
//   );

//   const messageCount = selectedMessages.length;
//   const moreThanOne = messageCount > 1;

//   // window.inboxStore?.dispatch(
//   //   updateConfirmModal({
//   //     title: window.i18n('deleteForEveryone'),
//   //     message: moreThanOne
//   //       ? window.i18n('deleteMessagesQuestion', [messageCount.toString()])
//   //       : window.i18n('deleteMessageQuestion'),
//   //     okText: window.i18n('deleteForEveryone'),
//   //     okTheme: SessionButtonColor.Danger,
//   //     onClickOk: async () => {
//   //       await doDeleteSelectedMessages({ selectedMessages, conversation, deleteForEveryone: true });

//   //       // explicitly close modal for this case.
//   //       // window.inboxStore?.dispatch(updateConfirmModal(null));
//   //       console.log('[SBOT/redux] updateConfirmModal')
//   //     },
//   //     closeAfterInput: false,
//   //   })
//   // );
//   console.log('[SBOT/redux] updateConfirmModal')
// }

// export async function deleteMessagesById(messageIds: Array<string>, conversationId: string) {
//   const conversation = getConversationController().getOrThrow(conversationId);
//   const selectedMessages = compact(
//     await Promise.all(messageIds.map(m => Data.getMessageById(m, false)))
//   );

//   const messageCount = selectedMessages.length;
//   const moreThanOne = selectedMessages.length > 1;

//   // window.inboxStore?.dispatch(
//   //   updateConfirmModal({
//   //     title: window.i18n('deleteJustForMe'),
//   //     message: moreThanOne
//   //       ? window.i18n('deleteMessagesQuestion', [messageCount.toString()])
//   //       : window.i18n('deleteMessageQuestion'),
//   //     okText: window.i18n('delete'),
//   //     okTheme: SessionButtonColor.Danger,
//   //     onClickOk: async () => {
//   //       await doDeleteSelectedMessages({
//   //         selectedMessages,
//   //         conversation,
//   //         deleteForEveryone: false,
//   //       });
//   //       // window.inboxStore?.dispatch(updateConfirmModal(null));
//   //       console.log('[SBOT/redux] updateConfirmModal')
//   //     },
//   //     closeAfterInput: false,
//   //   })
//   // );
//   console.log('[SBOT/redux] updateConfirmModal')
// }

// /**
//  *
//  * @param messages the list of MessageModel to delete
//  * @param convo the conversation to delete from (only v2 opengroups are supported)
//  */
// async function deleteOpenGroupMessages(
//   messages: Array<MessageModel>,
//   convo: ConversationModel
// ): Promise<Array<string>> {
//   if (!convo.isPublic()) {
//     throw new Error('cannot delete public message on a non public groups');
//   }

//   const roomInfos = convo.toOpenGroupV2();
//   // on v2 servers we can only remove a single message per request..
//   // so logic here is to delete each messages and get which one where not removed
//   const validServerIdsToRemove = compact(
//     messages.map(msg => {
//       return msg.get('serverId');
//     })
//   );

//   const validMessageModelsToRemove = compact(
//     messages.map(msg => {
//       const serverId = msg.get('serverId');
//       if (serverId) {
//         return msg;
//       }
//       return undefined;
//     })
//   );

//   let allMessagesAreDeleted: boolean = false;
//   if (validServerIdsToRemove.length) {
//     allMessagesAreDeleted = await deleteSogsMessageByServerIds(validServerIdsToRemove, roomInfos);
//   }
//   // remove only the messages we managed to remove on the server
//   if (allMessagesAreDeleted) {
//     console.info('Removed all those serverIds messages successfully');
//     return validMessageModelsToRemove.map(m => m.id as string);
//   }
//   console.info(
//     'failed to remove all those serverIds message. not removing them locally neither'
//   );
//   return [];
// }
