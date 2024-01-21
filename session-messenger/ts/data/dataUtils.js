"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanData = void 0;
const lodash_1 = __importDefault(require("lodash"));
const web_file_polyfill_1 = require("web-file-polyfill");
const sessionjs_logger_1 = require("../sessionjs-logger");
function cleanData(data) {
    const keys = Object.keys(data);
    for (let index = 0, max = keys.length; index < max; index += 1) {
        const key = keys[index];
        const value = data[key];
        if (value === null || value === undefined) {
            continue;
        }
        if (lodash_1.default.isFunction(value.toNumber)) {
            data[key] = value.toNumber();
        }
        else if (lodash_1.default.isFunction(value)) {
            delete data[key];
        }
        else if (Array.isArray(value)) {
            data[key] = value.map(cleanData);
        }
        else if (lodash_1.default.isObject(value) && value instanceof web_file_polyfill_1.File) {
            data[key] = { name: value.name, path: value.path, size: value.size, type: value.type };
        }
        else if (lodash_1.default.isObject(value) && value instanceof ArrayBuffer) {
            sessionjs_logger_1.console.error('Trying to save an ArrayBuffer to the db is most likely an error. This specific field should be removed before the cleanData call');
            continue;
        }
        else if (lodash_1.default.isObject(value)) {
            data[key] = cleanData(value);
        }
        else if (lodash_1.default.isBoolean(value)) {
            data[key] = value ? 1 : 0;
        }
        else if (typeof value !== 'string' &&
            typeof value !== 'number' &&
            typeof value !== 'boolean') {
            sessionjs_logger_1.console.info(`cleanData: key ${key} had type ${typeof value}`);
        }
    }
    return data;
}
exports.cleanData = cleanData;
