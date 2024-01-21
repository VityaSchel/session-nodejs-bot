"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttachmentsPath = exports.createDeleter = void 0;
const path_1 = __importDefault(require("path"));
const lodash_1 = require("lodash");
const fs_extra_1 = __importDefault(require("fs-extra"));
const createDeleter = (root) => {
    if (!(0, lodash_1.isString)(root)) {
        throw new TypeError("'root' must be a path");
    }
    return async (relativePath) => {
        if (!(0, lodash_1.isString)(relativePath)) {
            throw new TypeError("'relativePath' must be a string");
        }
        const absolutePath = path_1.default.join(root, relativePath);
        const normalized = path_1.default.normalize(absolutePath);
        if (!normalized.startsWith(root)) {
            throw new Error('Invalid relative path');
        }
        await fs_extra_1.default.remove(absolutePath);
    };
};
exports.createDeleter = createDeleter;
const PATH = 'attachments.noindex';
const getAttachmentsPath = (userDataPath) => {
    if (!(0, lodash_1.isString)(userDataPath)) {
        throw new TypeError("'userDataPath' must be a string");
    }
    return path_1.default.join(userDataPath, PATH);
};
exports.getAttachmentsPath = getAttachmentsPath;
