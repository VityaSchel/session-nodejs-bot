"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeSessionUsername = exports.stringToUint8Array = exports.stringToArrayBuffer = exports.fromUInt8ArrayToBase64 = exports.fromArrayBufferToBase64 = exports.fromBase64ToArray = exports.fromBase64ToArrayBuffer = exports.fromHexToArray = exports.fromHex = exports.toHex = exports.decode = exports.encode = void 0;
const bytebuffer_1 = __importDefault(require("bytebuffer"));
const constants_1 = require("../constants");
function encode(value, encoding) {
    return bytebuffer_1.default.wrap(value, encoding).toArrayBuffer();
}
exports.encode = encode;
function decode(buffer, stringEncoding) {
    return bytebuffer_1.default.wrap(buffer).toString(stringEncoding);
}
exports.decode = decode;
const toHex = (d) => decode(d, 'hex');
exports.toHex = toHex;
const fromHex = (d) => encode(d, 'hex');
exports.fromHex = fromHex;
const fromHexToArray = (d) => new Uint8Array((0, exports.fromHex)(d));
exports.fromHexToArray = fromHexToArray;
const fromBase64ToArrayBuffer = (d) => encode(d, 'base64');
exports.fromBase64ToArrayBuffer = fromBase64ToArrayBuffer;
const fromBase64ToArray = (d) => new Uint8Array((0, exports.fromBase64ToArrayBuffer)(d));
exports.fromBase64ToArray = fromBase64ToArray;
const fromArrayBufferToBase64 = (d) => decode(d, 'base64');
exports.fromArrayBufferToBase64 = fromArrayBufferToBase64;
const fromUInt8ArrayToBase64 = (d) => decode(d, 'base64');
exports.fromUInt8ArrayToBase64 = fromUInt8ArrayToBase64;
const stringToArrayBuffer = (str) => {
    if (typeof str !== 'string') {
        throw new TypeError("'string' must be a string");
    }
    return encode(str, 'binary');
};
exports.stringToArrayBuffer = stringToArrayBuffer;
const stringToUint8Array = (str) => {
    if (!str) {
        return new Uint8Array();
    }
    return new Uint8Array((0, exports.stringToArrayBuffer)(str));
};
exports.stringToUint8Array = stringToUint8Array;
const forbiddenDisplayCharRegex = /\uFFD2*/g;
const sanitizeSessionUsername = (inputName) => {
    const validChars = inputName.replace(forbiddenDisplayCharRegex, '');
    const lengthBytes = encode(validChars, 'utf8').byteLength;
    if (lengthBytes > constants_1.MAX_USERNAME_BYTES) {
        throw new Error('Display name is too long');
    }
    return validChars;
};
exports.sanitizeSessionUsername = sanitizeSessionUsername;
