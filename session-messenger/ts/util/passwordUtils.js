"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePassword = exports.matchesHash = exports.generateHash = exports.MAX_PASSWORD_LENGTH = void 0;
const crypto = __importStar(require("crypto"));
const ERRORS = {
    TYPE: 'Password must be a string',
    LENGTH: 'Password must be between 6 and 64 characters long',
    CHARACTER: 'Password must only contain letters, numbers and symbols',
};
const sha512 = (text) => {
    const hash = crypto.createHash('sha512');
    hash.update(text.trim());
    return hash.digest('hex');
};
exports.MAX_PASSWORD_LENGTH = 64;
const generateHash = (phrase) => phrase && sha512(phrase.trim());
exports.generateHash = generateHash;
const matchesHash = (phrase, hash) => phrase && sha512(phrase.trim()) === hash.trim();
exports.matchesHash = matchesHash;
const validatePassword = (phrase) => {
    if (typeof phrase !== 'string') {
        return window?.i18n ? window?.i18n('passwordTypeError') : ERRORS.TYPE;
    }
    const trimmed = phrase.trim();
    if (trimmed.length === 0) {
        return window?.i18n ? window?.i18n('noGivenPassword') : ERRORS.LENGTH;
    }
    if (trimmed.length < 6 || trimmed.length > exports.MAX_PASSWORD_LENGTH) {
        return window?.i18n ? window?.i18n('passwordLengthError') : ERRORS.LENGTH;
    }
    const characterRegex = /^[a-zA-Z0-9-!?/\\()._`~@#$%^&*+=[\]{}|<>,;: ]+$/;
    if (!characterRegex.test(trimmed)) {
        return window?.i18n ? window?.i18n('passwordCharacterError') : ERRORS.CHARACTER;
    }
    return null;
};
exports.validatePassword = validatePassword;
