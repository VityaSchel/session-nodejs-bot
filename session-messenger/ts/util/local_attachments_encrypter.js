"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptAttachmentBufferRenderer = exports.encryptAttachmentBufferRenderer = void 0;
const lodash_1 = require("lodash");
const String_1 = require("../session/utils/String");
const util_worker_interface_1 = require("../webworker/workers/browser/util_worker_interface");
const data_1 = require("../data/data");
const encryptAttachmentBufferRenderer = async (bufferIn) => {
    if (!(0, lodash_1.isArrayBuffer)(bufferIn)) {
        throw new TypeError("'bufferIn' must be an array buffer");
    }
    const key = (await data_1.Data.getItemById('local_attachment_encrypted_key'))?.value;
    if (!key) {
        throw new TypeError("'encryptAttachmentBuffer' needs a key set in local_attachment_encrypted_key");
    }
    const encryptingKey = (0, String_1.fromHexToArray)(key);
    return (0, util_worker_interface_1.callUtilsWorker)('encryptAttachmentBufferNode', encryptingKey, bufferIn);
};
exports.encryptAttachmentBufferRenderer = encryptAttachmentBufferRenderer;
const decryptAttachmentBufferRenderer = async (bufferIn) => {
    if (!(0, lodash_1.isArrayBuffer)(bufferIn)) {
        throw new TypeError("'bufferIn' must be an array buffer");
    }
    const key = (await data_1.Data.getItemById('local_attachment_encrypted_key'))?.value;
    if (!key) {
        throw new TypeError("'decryptAttachmentBuffer' needs a key set in local_attachment_encrypted_key");
    }
    const encryptingKey = (0, String_1.fromHexToArray)(key);
    return (0, util_worker_interface_1.callUtilsWorker)('decryptAttachmentBufferNode', encryptingKey, bufferIn);
};
exports.decryptAttachmentBufferRenderer = decryptAttachmentBufferRenderer;
