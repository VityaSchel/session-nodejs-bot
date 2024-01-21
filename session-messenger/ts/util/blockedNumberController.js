"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockedNumberController = void 0;
const data_1 = require("../data/data");
const conversation_1 = require("../models/conversation");
const types_1 = require("../session/types");
const sessionjs_logger_1 = require("../sessionjs-logger");
const storage_1 = require("./storage");
const BLOCKED_NUMBERS_ID = 'blocked';
class BlockedNumberController {
    static loaded = false;
    static blockedNumbers = new Set();
    static isBlocked(device) {
        const stringValue = device instanceof types_1.PubKey ? device.key : device.toLowerCase();
        return this.blockedNumbers.has(stringValue);
    }
    static async block(user) {
        await this.load();
        const toBlock = types_1.PubKey.cast(user);
        if (!this.blockedNumbers.has(toBlock.key)) {
            this.blockedNumbers.add(toBlock.key);
            await this.saveToDB(BLOCKED_NUMBERS_ID, this.blockedNumbers);
            await (0, conversation_1.commitConversationAndRefreshWrapper)(toBlock.key);
        }
    }
    static async unblockAll(users) {
        await this.load();
        let changes = false;
        users.forEach(user => {
            const toUnblock = types_1.PubKey.cast(user);
            if (this.blockedNumbers.has(toUnblock.key)) {
                this.blockedNumbers.delete(toUnblock.key);
                changes = true;
            }
        });
        for (let index = 0; index < users.length; index++) {
            const user = users[index];
            try {
                await (0, conversation_1.commitConversationAndRefreshWrapper)(user);
            }
            catch (e) {
                sessionjs_logger_1.console.warn('failed to SessionUtilContact.insertContactFromDBIntoWrapperAndRefresh with: ', user);
            }
        }
        if (changes) {
            await this.saveToDB(BLOCKED_NUMBERS_ID, this.blockedNumbers);
        }
    }
    static async setBlocked(user, blocked) {
        if (blocked) {
            return BlockedNumberController.block(user);
        }
        return BlockedNumberController.unblockAll([types_1.PubKey.cast(user).key]);
    }
    static getBlockedNumbers() {
        return [...this.blockedNumbers];
    }
    static async load() {
        if (!this.loaded) {
            this.blockedNumbers = await this.getNumbersFromDB(BLOCKED_NUMBERS_ID);
            this.loaded = true;
        }
    }
    static reset() {
        this.loaded = false;
        this.blockedNumbers = new Set();
    }
    static async getNumbersFromDB(id) {
        const data = await data_1.Data.getItemById(id);
        if (!data || !data.value) {
            return new Set();
        }
        return new Set(data.value);
    }
    static async saveToDB(id, numbers) {
        await storage_1.Storage.put(id, [...numbers]);
    }
}
exports.BlockedNumberController = BlockedNumberController;
