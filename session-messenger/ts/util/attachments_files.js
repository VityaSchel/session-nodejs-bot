"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAbsolutePathGetter = exports.createWriterForNew = exports.createReader = void 0;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const lodash_1 = require("lodash");
const local_attachments_encrypter_1 = require("./local_attachments_encrypter");
const createReader = (root) => {
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
        const buffer = await fs_extra_1.default.readFile(normalized);
        if (!(0, lodash_1.isBuffer)(buffer)) {
            throw new TypeError("'bufferIn' must be a buffer");
        }
        const decryptedData = await (0, local_attachments_encrypter_1.decryptAttachmentBufferRenderer)(buffer.buffer);
        return decryptedData.buffer;
    };
};
exports.createReader = createReader;
const createWriterForNew = (root) => {
    if (!(0, lodash_1.isString)(root)) {
        throw new TypeError("'root' must be a path");
    }
    return async (arrayBuffer) => {
        if (!(0, lodash_1.isArrayBuffer)(arrayBuffer)) {
            throw new TypeError("'arrayBuffer' must be an array buffer");
        }
        const name = createName();
        const relativePath = getRelativePath(name);
        return createWriterForExisting(root)({
            data: arrayBuffer,
            path: relativePath,
        });
    };
};
exports.createWriterForNew = createWriterForNew;
const createWriterForExisting = (root) => {
    if (!(0, lodash_1.isString)(root)) {
        throw new TypeError("'root' must be a path");
    }
    return async ({ data: arrayBuffer, path: relativePath, } = {}) => {
        if (!(0, lodash_1.isString)(relativePath)) {
            throw new TypeError("'relativePath' must be a path");
        }
        if (!(0, lodash_1.isArrayBuffer)(arrayBuffer)) {
            throw new TypeError("'arrayBuffer' must be an array buffer");
        }
        const absolutePath = path_1.default.join(root, relativePath);
        const normalized = path_1.default.normalize(absolutePath);
        if (!normalized.startsWith(root)) {
            throw new Error('Invalid relative path');
        }
        await fs_extra_1.default.ensureFile(normalized);
        if (!(0, lodash_1.isArrayBuffer)(arrayBuffer)) {
            throw new TypeError("'bufferIn' must be an array buffer");
        }
        const { encryptedBufferWithHeader } = (await (0, local_attachments_encrypter_1.encryptAttachmentBufferRenderer)(arrayBuffer));
        const buffer = Buffer.from(encryptedBufferWithHeader.buffer);
        await fs_extra_1.default.writeFile(normalized, buffer);
        return relativePath;
    };
};
const createName = () => {
    const buffer = crypto_1.default.randomBytes(32);
    return buffer.toString('hex');
};
const getRelativePath = (name) => {
    if (!(0, lodash_1.isString)(name)) {
        throw new TypeError("'name' must be a string");
    }
    const prefix = name.slice(0, 2);
    return path_1.default.join(prefix, name);
};
const createAbsolutePathGetter = (rootPath) => (relativePath) => {
    const absolutePath = path_1.default.join(rootPath, relativePath);
    const normalized = path_1.default.normalize(absolutePath);
    if (!normalized.startsWith(rootPath)) {
        throw new Error('Invalid relative path');
    }
    return normalized;
};
exports.createAbsolutePathGetter = createAbsolutePathGetter;
