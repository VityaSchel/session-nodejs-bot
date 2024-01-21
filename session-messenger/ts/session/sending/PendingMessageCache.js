"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PendingMessageCache = void 0;
const lodash_1 = __importDefault(require("lodash"));
const data_1 = require("../../data/data");
const storage_1 = require("../../util/storage");
const types_1 = require("../types");
const utils_1 = require("../utils");
class PendingMessageCache {
    callbacks = new Map();
    loadPromise;
    cache = [];
    async getAllPending() {
        await this.loadFromDBIfNeeded();
        return [...this.cache];
    }
    async getForDevice(device) {
        const pending = await this.getAllPending();
        return pending.filter(m => m.device === device.key);
    }
    async getDevices() {
        await this.loadFromDBIfNeeded();
        const pubkeyStrings = lodash_1.default.uniq(this.cache.map(m => m.device));
        return pubkeyStrings.map(types_1.PubKey.from).filter((k) => !!k);
    }
    async add(destinationPubKey, message, namespace, sentCb, isGroup = false) {
        await this.loadFromDBIfNeeded();
        const rawMessage = await utils_1.MessageUtils.toRawMessage(destinationPubKey, message, namespace, isGroup);
        if (this.find(rawMessage)) {
            return rawMessage;
        }
        this.cache.push(rawMessage);
        if (sentCb) {
            this.callbacks.set(rawMessage.identifier, sentCb);
        }
        await this.saveToDB();
        return rawMessage;
    }
    async remove(message) {
        await this.loadFromDBIfNeeded();
        if (!this.find(message)) {
            return undefined;
        }
        const updatedCache = this.cache.filter(cached => !(cached.device === message.device && cached.identifier === message.identifier));
        this.cache = updatedCache;
        this.callbacks.delete(message.identifier);
        await this.saveToDB();
        return updatedCache;
    }
    find(message) {
        return this.cache.find(m => m.device === message.device && m.identifier === message.identifier);
    }
    async clear() {
        this.cache = [];
        this.callbacks = new Map();
        await this.saveToDB();
    }
    async loadFromDBIfNeeded() {
        if (!this.loadPromise) {
            this.loadPromise = this.loadFromDB();
        }
        await this.loadPromise;
    }
    async loadFromDB() {
        const messages = await this.getFromStorage();
        this.cache = messages;
    }
    async getFromStorage() {
        const data = await data_1.Data.getItemById('pendingMessages');
        if (!data || !data.value) {
            return [];
        }
        const barePending = JSON.parse(String(data.value));
        return barePending.map((message) => {
            return {
                ...message,
                plainTextBuffer: new Uint8Array(message.plainTextBuffer),
            };
        });
    }
    async saveToDB() {
        const encodedCache = [...this.cache].map(item => {
            const plainTextBuffer = Array.from(item.plainTextBuffer);
            return { ...item, plainTextBuffer };
        });
        const encodedPendingMessages = JSON.stringify(encodedCache) || '[]';
        await storage_1.Storage.put('pendingMessages', encodedPendingMessages);
    }
}
exports.PendingMessageCache = PendingMessageCache;
