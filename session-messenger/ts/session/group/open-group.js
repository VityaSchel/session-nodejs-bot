"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initiateOpenGroupUpdate = void 0;
const opengroups_1 = require("../../data/opengroups");
const attachments_1 = require("../../receiver/attachments");
const sessionjs_logger_1 = require("../../sessionjs-logger");
const types_1 = require("../../types");
const VisualAttachment_1 = require("../../types/attachments/VisualAttachment");
const MessageAttachment_1 = require("../../types/MessageAttachment");
const sogsV3RoomImage_1 = require("../apis/open_group_api/sogsv3/sogsV3RoomImage");
const conversations_1 = require("../conversations");
async function initiateOpenGroupUpdate(groupId, groupName, avatar) {
    const convo = (0, conversations_1.getConversationController)().get(groupId);
    if (!convo?.isPublic()) {
        throw new Error('initiateOpenGroupUpdate can only be used for communities');
    }
    if (avatar && avatar.objectUrl) {
        const blobAvatarAlreadyScaled = await (0, VisualAttachment_1.urlToBlob)(avatar.objectUrl);
        const dataResized = await blobAvatarAlreadyScaled.arrayBuffer();
        const roomInfos = opengroups_1.OpenGroupData.getV2OpenGroupRoom(convo.id);
        if (!roomInfos || !dataResized.byteLength) {
            return false;
        }
        const uploadedFileDetails = await (0, sogsV3RoomImage_1.uploadImageForRoomSogsV3)(new Uint8Array(dataResized), roomInfos);
        if (!uploadedFileDetails || !uploadedFileDetails.fileUrl) {
            sessionjs_logger_1.console.warn('File opengroupv2 upload failed');
            return false;
        }
        try {
            const { fileId: avatarImageId, fileUrl } = uploadedFileDetails;
            const downloaded = await (0, attachments_1.downloadAttachmentSogsV3)({ id: avatarImageId, size: null, url: fileUrl }, roomInfos);
            if (!downloaded || !(downloaded.data instanceof ArrayBuffer)) {
                const typeFound = typeof downloaded;
                throw new Error(`Expected a plain ArrayBuffer but got ${typeFound}`);
            }
            const data = downloaded.data;
            if (!downloaded.data?.byteLength) {
                sessionjs_logger_1.console.error('Failed to download attachment. Length is 0');
                throw new Error(`Failed to download attachment. Length is 0 for ${uploadedFileDetails.fileUrl}`);
            }
            const upgraded = await (0, MessageAttachment_1.processNewAttachment)({
                data,
                isRaw: true,
                contentType: types_1.MIME.IMAGE_UNKNOWN,
            });
            await convo.setSessionProfile({
                displayName: groupName || convo.get('displayNameInProfile') || window.i18n('unknown'),
                avatarPath: upgraded.path,
                avatarImageId,
            });
        }
        catch (e) {
            sessionjs_logger_1.console.error(`Could not decrypt profile image: ${e}`);
            return false;
        }
    }
    return true;
}
exports.initiateOpenGroupUpdate = initiateOpenGroupUpdate;
