"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnionV4 = exports.encodeV4Request = void 0;
const libsodium_wrappers_sumo_1 = require("libsodium-wrappers-sumo");
const lodash_1 = require("lodash");
const crypto_1 = require("../crypto");
const sessionjs_logger_1 = require("../../sessionjs-logger");
const encodeV4Request = (requestInfo) => {
    const { body } = requestInfo;
    const infoWithoutBody = (0, lodash_1.omit)(requestInfo, 'body');
    const requestInfoData = (0, libsodium_wrappers_sumo_1.from_string)(JSON.stringify(infoWithoutBody));
    const prefixData = (0, libsodium_wrappers_sumo_1.from_string)(`l${requestInfoData.length}:`);
    const suffixData = (0, libsodium_wrappers_sumo_1.from_string)('e');
    if (body) {
        const bodyData = body && (0, lodash_1.isString)(body) ? (0, libsodium_wrappers_sumo_1.from_string)(body) : body;
        const bodyCountdata = (0, libsodium_wrappers_sumo_1.from_string)(`${bodyData.length}:`);
        return (0, crypto_1.concatUInt8Array)(prefixData, requestInfoData, bodyCountdata, bodyData, suffixData);
    }
    return (0, crypto_1.concatUInt8Array)(prefixData, requestInfoData, suffixData);
};
exports.encodeV4Request = encodeV4Request;
const decodeV4Response = (snodeResponse) => {
    const eAscii = 'e'.charCodeAt(0);
    const lAscii = 'l'.charCodeAt(0);
    const colonAscii = ':'.charCodeAt(0);
    const binary = snodeResponse.bodyBinary;
    if (!(binary &&
        binary.byteLength &&
        binary[0] === lAscii &&
        binary[binary.byteLength - 1] === eAscii)) {
        sessionjs_logger_1.console.error('decodeV4Response: response is missing prefix and suffix characters - Dropping response');
        return undefined;
    }
    try {
        const firstDelimitIdx = binary.indexOf(colonAscii);
        const infoLength = (0, lodash_1.toNumber)((0, libsodium_wrappers_sumo_1.to_string)(binary.slice(1, firstDelimitIdx)));
        const infoStringStartIndex = firstDelimitIdx + 1;
        const infoStringEndIndex = infoStringStartIndex + infoLength;
        const infoJson = JSON.parse((0, libsodium_wrappers_sumo_1.to_string)(binary.slice(infoStringStartIndex, infoStringEndIndex)));
        const beforeBodyIndex = binary.indexOf(colonAscii, infoStringEndIndex);
        const bodyLength = (0, lodash_1.toNumber)((0, libsodium_wrappers_sumo_1.to_string)(binary.slice(infoStringEndIndex, beforeBodyIndex)));
        const bodyBinary = binary.slice(beforeBodyIndex + 1, beforeBodyIndex + (bodyLength + 1));
        const bodyContentType = infoJson?.headers['content-type'];
        let bodyParsed = null;
        switch (bodyContentType) {
            case 'application/json':
                bodyParsed = JSON.parse((0, libsodium_wrappers_sumo_1.to_string)(bodyBinary));
                break;
            case 'text/plain; charset=utf-8':
                bodyParsed = { plainText: (0, libsodium_wrappers_sumo_1.to_string)(bodyBinary) };
                break;
            case 'application/octet-stream':
                break;
            case 'text/html; charset=utf-8':
                try {
                    sessionjs_logger_1.console.warn('decodeV4Response - received raw body of type "text/html; charset=utf-8": ', (0, libsodium_wrappers_sumo_1.to_string)(bodyBinary));
                }
                catch (e) {
                    sessionjs_logger_1.console.warn('decodeV4Response - received raw body of type "text/html; charset=utf-8" but not a string');
                }
                break;
            default:
                sessionjs_logger_1.console.warn('decodeV4Response - No or unknown content-type information for response: ', bodyContentType);
        }
        return {
            metadata: infoJson,
            body: bodyParsed,
            bodyContentType,
            bodyBinary,
        };
    }
    catch (e) {
        sessionjs_logger_1.console.warn('failed to decodeV4Response:', e.message);
        return undefined;
    }
};
exports.OnionV4 = { decodeV4Response };
