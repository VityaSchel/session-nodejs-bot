"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestReleaseFromFileServer = exports.downloadFileFromFileServer = exports.uploadFileToFsWithOnionV4 = exports.fileServerPubKey = exports.fileServerURL = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const onionSend_1 = require("../../onions/onionSend");
const sogsV3BatchPoll_1 = require("../open_group_api/sogsv3/sogsV3BatchPoll");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
exports.fileServerURL = 'http://filev2.getsession.org';
exports.fileServerPubKey = 'da21e1d886c6fbaea313f75298bd64aab03a97ce985b46bb2dad9f2089c8ee59';
const RELEASE_VERSION_ENDPOINT = '/session_version?platform=desktop';
const POST_GET_FILE_ENDPOINT = '/file';
const uploadFileToFsWithOnionV4 = async (fileContent) => {
    if (!fileContent || !fileContent.byteLength) {
        return null;
    }
    const result = await onionSend_1.OnionSending.sendBinaryViaOnionV4ToFileServer({
        abortSignal: new abort_controller_1.default().signal,
        bodyBinary: new Uint8Array(fileContent),
        endpoint: POST_GET_FILE_ENDPOINT,
        method: 'POST',
    });
    if (!(0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result)) {
        return null;
    }
    const fileId = result?.body?.id;
    if (!fileId) {
        return null;
    }
    const fileUrl = `${exports.fileServerURL}${POST_GET_FILE_ENDPOINT}/${fileId}`;
    return {
        fileId,
        fileUrl,
    };
};
exports.uploadFileToFsWithOnionV4 = uploadFileToFsWithOnionV4;
const downloadFileFromFileServer = async (fileIdOrCompleteUrl) => {
    let fileId = fileIdOrCompleteUrl;
    if (!fileIdOrCompleteUrl) {
        sessionjs_logger_1.console.warn('Empty url to download for fileserver');
        return null;
    }
    if (fileIdOrCompleteUrl.lastIndexOf('/') >= 0) {
        fileId = fileId.substring(fileIdOrCompleteUrl.lastIndexOf('/') + 1);
    }
    if (fileId.startsWith('/')) {
        fileId = fileId.substring(1);
    }
    if (!fileId) {
        sessionjs_logger_1.console.info('downloadFileFromFileServer given empty fileId');
        return null;
    }
    const urlToGet = `${POST_GET_FILE_ENDPOINT}/${fileId}`;
    const result = await onionSend_1.OnionSending.getBinaryViaOnionV4FromFileServer({
        abortSignal: new abort_controller_1.default().signal,
        endpoint: urlToGet,
        method: 'GET',
        throwError: true,
    });
    if (!result) {
        return null;
    }
    if (!(0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result)) {
        sessionjs_logger_1.console.info('download from fileserver failed with status ', (0, sogsV3BatchPoll_1.parseBatchGlobalStatusCode)(result));
        return null;
    }
    const { bodyBinary } = result;
    if (!bodyBinary || !bodyBinary.byteLength) {
        sessionjs_logger_1.console.info('download from fileserver failed with status, empty content downloaded ');
        return null;
    }
    return bodyBinary.buffer;
};
exports.downloadFileFromFileServer = downloadFileFromFileServer;
const parseStatusCodeFromOnionRequestV4 = (onionV4Result) => {
    if (!onionV4Result) {
        return undefined;
    }
    return onionV4Result?.body?.status_code || undefined;
};
const getLatestReleaseFromFileServer = async () => {
    const result = await onionSend_1.OnionSending.sendJsonViaOnionV4ToFileServer({
        abortSignal: new abort_controller_1.default().signal,
        endpoint: RELEASE_VERSION_ENDPOINT,
        method: 'GET',
        stringifiedBody: null,
    });
    if (!(0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result) || parseStatusCodeFromOnionRequestV4(result) !== 200) {
        return null;
    }
    const latestVersionWithV = result?.body?.result;
    if (!latestVersionWithV) {
        return null;
    }
    return latestVersionWithV;
};
exports.getLatestReleaseFromFileServer = getLatestReleaseFromFileServer;
