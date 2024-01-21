"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueAttachmentDownloads = exports.downloadAttachmentSogsV3 = exports.downloadAttachment = void 0;
const lodash_1 = require("lodash");
const data_1 = require("../data/data");
const utils_1 = require("../session/utils");
const BufferPadding_1 = require("../session/crypto/BufferPadding");
const attachmentsEncrypter_1 = require("../util/crypto/attachmentsEncrypter");
const util_worker_interface_1 = require("../webworker/workers/browser/util_worker_interface");
const sogsV3FetchFile_1 = require("../session/apis/open_group_api/sogsv3/sogsV3FetchFile");
const opengroups_1 = require("../data/opengroups");
const FileServerApi_1 = require("../session/apis/file_server_api/FileServerApi");
const sessionjs_logger_1 = require("../sessionjs-logger");
async function downloadAttachment(attachment) {
    const asURL = new URL(attachment.url);
    const serverUrl = asURL.origin;
    const defaultFileServer = (0, lodash_1.startsWith)(serverUrl, FileServerApi_1.fileServerURL);
    let res = null;
    if (defaultFileServer) {
        let attachmentId = attachment.id;
        if (!attachmentId) {
            attachmentId = attachment.url;
        }
        sessionjs_logger_1.console.info('Download v2 file server attachment', attachmentId);
        res = await (0, FileServerApi_1.downloadFileFromFileServer)(attachmentId);
    }
    else {
        sessionjs_logger_1.console.warn(`downloadAttachment attachment is neither opengroup attachment nor fileserver... Dropping it ${asURL.href}`);
        throw new Error('Attachment url is not opengroupv2 nor fileserver. Unsupported');
    }
    if (!res?.byteLength) {
        sessionjs_logger_1.console.error('Failed to download attachment. Length is 0');
        throw new Error(`Failed to download attachment. Length is 0 for ${attachment.url}`);
    }
    let data = res;
    if (!attachment.isRaw) {
        const { key, digest, size } = attachment;
        if (!key || !digest) {
            throw new Error('Attachment is not raw but we do not have a key to decode it');
        }
        if (!size) {
            throw new Error('Attachment expected size is 0');
        }
        const keyBuffer = (await (0, util_worker_interface_1.callUtilsWorker)('fromBase64ToArrayBuffer', key));
        const digestBuffer = (await (0, util_worker_interface_1.callUtilsWorker)('fromBase64ToArrayBuffer', digest));
        data = await (0, attachmentsEncrypter_1.decryptAttachment)(data, keyBuffer, digestBuffer);
        if (size !== data.byteLength) {
            const unpaddedData = (0, BufferPadding_1.getUnpaddedAttachment)(data, size);
            if (!unpaddedData) {
                throw new Error(`downloadAttachment: Size ${size} did not match downloaded attachment size ${data.byteLength}`);
            }
            data = unpaddedData;
        }
    }
    return {
        ...(0, lodash_1.omit)(attachment, 'digest', 'key'),
        data,
    };
}
exports.downloadAttachment = downloadAttachment;
async function downloadAttachmentSogsV3(attachment, roomInfos) {
    const roomDetails = opengroups_1.OpenGroupData.getV2OpenGroupRoomByRoomId(roomInfos);
    if (!roomDetails) {
        throw new Error(`Didn't find such a room ${roomInfos.serverUrl}: ${roomInfos.roomId}`);
    }
    const dataUint = await (0, sogsV3FetchFile_1.sogsV3FetchFileByFileID)(roomDetails, `${attachment.id}`);
    if (!dataUint?.length) {
        sessionjs_logger_1.console.error('Failed to download attachment. Length is 0');
        throw new Error(`Failed to download attachment. Length is 0 for ${attachment.url}`);
    }
    if (attachment.size === null) {
        return {
            ...(0, lodash_1.omit)(attachment, 'digest', 'key'),
            data: dataUint.buffer,
        };
    }
    let data = dataUint;
    if (attachment.size !== dataUint.length) {
        const unpaddedData = (0, BufferPadding_1.getUnpaddedAttachment)(dataUint.buffer, attachment.size);
        if (!unpaddedData) {
            throw new Error(`downloadAttachment: Size ${attachment.size} did not match downloaded attachment size ${data.byteLength}`);
        }
        data = new Uint8Array(unpaddedData);
    }
    else {
    }
    return {
        ...(0, lodash_1.omit)(attachment, 'digest', 'key'),
        data: data.buffer,
    };
}
exports.downloadAttachmentSogsV3 = downloadAttachmentSogsV3;
async function processNormalAttachments(message, normalAttachments, convo) {
    const isOpenGroupV2 = convo.isOpenGroupV2();
    if (message.isTrustedForAttachmentDownload()) {
        const openGroupV2Details = (isOpenGroupV2 && convo.toOpenGroupV2()) || undefined;
        const attachments = await Promise.all(normalAttachments.map(async (attachment, index) => {
            return utils_1.AttachmentDownloads.addJob(attachment, {
                messageId: message.id,
                type: 'attachment',
                index,
                isOpenGroupV2,
                openGroupV2Details,
            });
        }));
        message.set({ attachments });
        return attachments.length;
    }
    sessionjs_logger_1.console.info('No downloading attachments yet as this user is not trusted for now.');
    return 0;
}
async function processPreviews(message, convo) {
    let addedCount = 0;
    const isOpenGroupV2 = convo.isOpenGroupV2();
    const openGroupV2Details = (isOpenGroupV2 && convo.toOpenGroupV2()) || undefined;
    const preview = await Promise.all((message.get('preview') || []).map(async (item, index) => {
        if (!item.image) {
            return item;
        }
        addedCount += 1;
        const image = message.isTrustedForAttachmentDownload()
            ? await utils_1.AttachmentDownloads.addJob(item.image, {
                messageId: message.id,
                type: 'preview',
                index,
                isOpenGroupV2,
                openGroupV2Details,
            })
            : null;
        return { ...item, image };
    }));
    message.set({ preview });
    return addedCount;
}
async function processQuoteAttachments(message, convo) {
    let addedCount = 0;
    const quote = message.get('quote');
    if (!quote || !quote.attachments || !quote.attachments.length) {
        return 0;
    }
    const isOpenGroupV2 = convo.isOpenGroupV2();
    const openGroupV2Details = (isOpenGroupV2 && convo.toOpenGroupV2()) || undefined;
    for (let index = 0; index < quote.attachments.length; index++) {
        const attachment = quote.attachments[index];
        if (!attachment.thumbnail || attachment.thumbnail.path) {
            continue;
        }
        addedCount += 1;
        const thumbnail = await utils_1.AttachmentDownloads.addJob(attachment.thumbnail, {
            messageId: message.id,
            type: 'quote',
            index,
            isOpenGroupV2,
            openGroupV2Details,
        });
        quote.attachments[index] = { ...attachment, thumbnail };
    }
    message.set({ quote });
    return addedCount;
}
async function queueAttachmentDownloads(message, conversation) {
    let count = 0;
    count += await processNormalAttachments(message, message.get('attachments') || [], conversation);
    count += await processPreviews(message, conversation);
    count += await processQuoteAttachments(message, conversation);
    if (count > 0) {
        await data_1.Data.saveMessage(message.attributes);
    }
}
exports.queueAttachmentDownloads = queueAttachmentDownloads;
