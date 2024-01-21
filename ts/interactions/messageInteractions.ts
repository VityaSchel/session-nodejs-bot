// import { joinOpenGroupV2WithUIEvents } from '../session/apis/open_group_api/opengroupV2/JoinOpenGroupV2';
// import {
//   sogsV3AddAdmin,
//   sogsV3RemoveAdmins,
// } from '../session/apis/open_group_api/sogsv3/sogsV3AddRemoveMods';
// import {
//   isOpenGroupV2,
//   openGroupV2CompleteURLRegex,
// } from '../session/apis/open_group_api/utils/OpenGroupUtils';
// import { getConversationController } from '../session/conversations';
// import { PubKey } from '../session/types';
// import { ToastUtils } from '../session/utils';

// import { updateBanOrUnbanUserModal, updateConfirmModal } from '../state/ducks/modalDialog';

// export function banUser(userToBan: string, conversationId: string) {
//   let pubKeyToBan: PubKey;
//   try {
//     pubKeyToBan = PubKey.cast(userToBan);
//   } catch (e) {
//     console.warn(e.message);
//     ToastUtils.pushUserBanFailure();
//     return;
//   }
//   if (!isOpenGroupV2(conversationId)) {
//     console.warn(`Conversation ${conversationId} is not an open group`);
//     ToastUtils.pushUserBanFailure();

//     return;
//   }

//   window.inboxStore?.dispatch(
//     updateBanOrUnbanUserModal({ banType: 'ban', conversationId, pubkey: pubKeyToBan.key })
//   );
// }

// /**
//  * There is no way to unban on an opengroupv1 server.
//  * This function only works for opengroupv2 server
//  */
// export function unbanUser(userToUnBan: string, conversationId: string) {
//   let pubKeyToUnban: PubKey;
//   try {
//     pubKeyToUnban = PubKey.cast(userToUnBan);
//   } catch (e) {
//     console.warn(e.message);
//     ToastUtils.pushUserBanFailure();
//     return;
//   }
//   if (!isOpenGroupV2(conversationId)) {
//     console.warn(`Conversation ${conversationId} is not an open group`);
//     ToastUtils.pushUserUnbanFailure();

//     return;
//   }
//   window.inboxStore?.dispatch(
//     updateBanOrUnbanUserModal({ banType: 'unban', conversationId, pubkey: pubKeyToUnban.key })
//   );
// }

// export function copyBodyToClipboard(body?: string | null) {
//   window.clipboard.writeText(body);

//   ToastUtils.pushCopiedToClipBoard();
// }

// export async function removeSenderFromModerator(sender: string, convoId: string) {
//   try {
//     const pubKeyToRemove = PubKey.cast(sender);
//     const convo = getConversationController().getOrThrow(convoId);

//     const roomInfo = convo.toOpenGroupV2();
//     const res = await sogsV3RemoveAdmins([pubKeyToRemove], roomInfo);
//     if (!res) {
//       console.warn('failed to remove moderator:', res);

//       ToastUtils.pushFailedToRemoveFromModerator();
//     } else {
//       console.info(`${pubKeyToRemove.key} removed from moderators...`);
//       ToastUtils.pushUserRemovedFromModerators();
//     }
//   } catch (e) {
//     console.error('Got error while removing moderator:', e);
//   }
// }

// export async function addSenderAsModerator(sender: string, convoId: string) {
//   try {
//     const pubKeyToAdd = PubKey.cast(sender);
//     const convo = getConversationController().getOrThrow(convoId);

//     const roomInfo = convo.toOpenGroupV2();
//     const res = await sogsV3AddAdmin([pubKeyToAdd], roomInfo);
//     if (!res) {
//       console.warn('failed to add moderator:', res);

//       ToastUtils.pushFailedToAddAsModerator();
//     } else {
//       console.info(`${pubKeyToAdd.key} added to moderators...`);
//       ToastUtils.pushUserAddedToModerators();
//     }
//   } catch (e) {
//     console.error('Got error while adding moderator:', e);
//   }
// }

// const acceptOpenGroupInvitationV2 = (completeUrl: string, roomName?: string) => {
//   const onClickClose = () => {
//     // window.inboxStore?.dispatch(updateConfirmModal(null));
//     console.log('[SBOT/redux] updateConfirmModal')
//   };

//   window.inboxStore?.dispatch(
//     updateConfirmModal({
//       title: window.i18n('joinOpenGroupAfterInvitationConfirmationTitle', [
//         roomName || window.i18n('unknown'),
//       ]),
//       message: window.i18n('joinOpenGroupAfterInvitationConfirmationDesc', [
//         roomName || window.i18n('unknown'),
//       ]),
//       onClickOk: async () => {
//         await joinOpenGroupV2WithUIEvents(completeUrl, true, false);
//       },

//       onClickClose,
//     })
//   );
//   // this function does not throw, and will showToasts if anything happens
// };

// /**
//  * Accepts a v2 url open group invitation (with pubkey) or just log an error
//  */
// export const acceptOpenGroupInvitation = (completeUrl: string, roomName?: string) => {
//   if (completeUrl.match(openGroupV2CompleteURLRegex)) {
//     acceptOpenGroupInvitationV2(completeUrl, roomName);
//   } else {
//     console.warn('Invalid opengroup url:', completeUrl);
//   }
// };
