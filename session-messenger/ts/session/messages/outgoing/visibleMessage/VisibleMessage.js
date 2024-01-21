"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProfileForOutgoingMessage = exports.VisibleMessage = void 0;
const bytebuffer_1 = __importDefault(require("bytebuffer"));
const lodash_1 = require("lodash");
const __1 = require("..");
const protobuf_1 = require("../../../../protobuf");
class VisibleMessage extends __1.DataMessage {
    expireTimer;
    reaction;
    attachments;
    body;
    quote;
    profileKey;
    profile;
    preview;
    syncTarget;
    constructor(params) {
        super({ timestamp: params.timestamp, identifier: params.identifier });
        this.attachments = params.attachments;
        this.body = params.body;
        this.quote = params.quote;
        this.expireTimer = params.expireTimer;
        const profile = buildProfileForOutgoingMessage(params);
        this.profile = profile.lokiProfile;
        this.profileKey = profile.profileKey;
        this.preview = params.preview;
        this.reaction = params.reaction;
        this.syncTarget = params.syncTarget;
    }
    dataProto() {
        const dataMessage = new protobuf_1.SignalService.DataMessage();
        if (this.body) {
            dataMessage.body = this.body;
        }
        dataMessage.attachments = this.attachments || [];
        if (this.expireTimer) {
            dataMessage.expireTimer = this.expireTimer;
        }
        if (this.preview) {
            dataMessage.preview = this.preview;
        }
        if (this.reaction) {
            dataMessage.reaction = this.reaction;
        }
        if (this.syncTarget) {
            dataMessage.syncTarget = this.syncTarget;
        }
        if (this.profile) {
            dataMessage.profile = this.profile;
        }
        if (this.profileKey && this.profileKey.length) {
            dataMessage.profileKey = this.profileKey;
        }
        if (this.quote) {
            dataMessage.quote = new protobuf_1.SignalService.DataMessage.Quote();
            dataMessage.quote.id = this.quote.id;
            dataMessage.quote.author = this.quote.author;
            dataMessage.quote.text = this.quote.text;
            if (this.quote.attachments) {
                dataMessage.quote.attachments = this.quote.attachments.map(attachment => {
                    const quotedAttachment = new protobuf_1.SignalService.DataMessage.Quote.QuotedAttachment();
                    if (attachment.contentType) {
                        quotedAttachment.contentType = attachment.contentType;
                    }
                    if (attachment.fileName) {
                        quotedAttachment.fileName = attachment.fileName;
                    }
                    if (attachment.thumbnail && attachment.thumbnail.id) {
                        quotedAttachment.thumbnail = attachment.thumbnail;
                    }
                    return quotedAttachment;
                });
            }
        }
        if (Array.isArray(this.preview)) {
            dataMessage.preview = this.preview.map(preview => {
                const item = new protobuf_1.SignalService.DataMessage.Preview();
                if (preview.title) {
                    item.title = preview.title;
                }
                if (preview.url) {
                    item.url = preview.url;
                }
                item.image = preview.image || null;
                return item;
            });
        }
        dataMessage.timestamp = this.timestamp;
        return dataMessage;
    }
    isEqual(comparator) {
        return this.identifier === comparator.identifier && this.timestamp === comparator.timestamp;
    }
}
exports.VisibleMessage = VisibleMessage;
function buildProfileForOutgoingMessage(params) {
    let profileKey;
    if (params.lokiProfile && params.lokiProfile.profileKey) {
        if (params.lokiProfile.profileKey instanceof Uint8Array ||
            params.lokiProfile.profileKey instanceof bytebuffer_1.default) {
            profileKey = new Uint8Array(params.lokiProfile.profileKey);
        }
        else {
            profileKey = new Uint8Array(bytebuffer_1.default.wrap(params.lokiProfile.profileKey).toArrayBuffer());
        }
    }
    const displayName = params.lokiProfile?.displayName;
    const avatarPointer = params.lokiProfile?.avatarPointer &&
        !(0, lodash_1.isEmpty)(profileKey) &&
        params.lokiProfile.avatarPointer &&
        !(0, lodash_1.isEmpty)(params.lokiProfile.avatarPointer)
        ? params.lokiProfile.avatarPointer
        : undefined;
    let lokiProfile;
    if (avatarPointer || displayName) {
        lokiProfile = new protobuf_1.SignalService.DataMessage.LokiProfile();
        if (avatarPointer && avatarPointer.length && profileKey) {
            lokiProfile.profilePicture = avatarPointer;
        }
        if (displayName) {
            lokiProfile.displayName = displayName;
        }
    }
    return {
        lokiProfile,
        profileKey: lokiProfile?.profilePicture ? profileKey : undefined,
    };
}
exports.buildProfileForOutgoingMessage = buildProfileForOutgoingMessage;
