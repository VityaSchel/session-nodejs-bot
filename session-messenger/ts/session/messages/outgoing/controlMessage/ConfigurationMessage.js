"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationMessageClosedGroup = exports.ConfigurationMessageContact = exports.ConfigurationMessage = void 0;
const protobuf_1 = require("../../../../protobuf");
const String_1 = require("../../../utils/String");
const types_1 = require("../../../types");
const __1 = require("..");
class ConfigurationMessage extends __1.ContentMessage {
    activeClosedGroups;
    activeOpenGroups;
    displayName;
    profilePicture;
    profileKey;
    contacts;
    constructor(params) {
        super({ timestamp: params.timestamp, identifier: params.identifier });
        this.activeClosedGroups = params.activeClosedGroups;
        this.activeOpenGroups = params.activeOpenGroups;
        this.displayName = params.displayName;
        this.profilePicture = params.profilePicture;
        this.profileKey = params.profileKey;
        this.contacts = params.contacts;
        if (!this.activeClosedGroups) {
            throw new Error('closed group must be set');
        }
        if (!this.activeOpenGroups) {
            throw new Error('open group must be set');
        }
        if (!this.displayName || !this.displayName?.length) {
            throw new Error('displayName must be set');
        }
        if (this.profilePicture && typeof this.profilePicture !== 'string') {
            throw new Error('profilePicture set but not an Uin8Array');
        }
        if (this.profileKey && !(this.profileKey instanceof Uint8Array)) {
            throw new Error('profileKey set but not an Uin8Array');
        }
        if (!this.contacts) {
            throw new Error('contacts must be set');
        }
    }
    contentProto() {
        return new protobuf_1.SignalService.Content({
            configurationMessage: this.configurationProto(),
        });
    }
    configurationProto() {
        return new protobuf_1.SignalService.ConfigurationMessage({
            closedGroups: this.mapClosedGroupsObjectToProto(this.activeClosedGroups),
            openGroups: this.activeOpenGroups,
            displayName: this.displayName,
            profilePicture: this.profilePicture,
            profileKey: this.profileKey,
            contacts: this.mapContactsObjectToProto(this.contacts),
        });
    }
    mapClosedGroupsObjectToProto(closedGroups) {
        return (closedGroups || []).map(m => m.toProto());
    }
    mapContactsObjectToProto(contacts) {
        return (contacts || []).map(m => m.toProto());
    }
}
exports.ConfigurationMessage = ConfigurationMessage;
class ConfigurationMessageContact {
    publicKey;
    displayName;
    profilePictureURL;
    profileKey;
    isApproved;
    isBlocked;
    didApproveMe;
    constructor({ publicKey, displayName, profilePictureURL, profileKey, isApproved, isBlocked, didApproveMe, }) {
        this.publicKey = publicKey;
        this.displayName = displayName;
        this.profilePictureURL = profilePictureURL;
        this.profileKey = profileKey;
        this.isApproved = isApproved;
        this.isBlocked = isBlocked;
        this.didApproveMe = didApproveMe;
        types_1.PubKey.cast(publicKey);
        if (this.displayName?.length === 0) {
            throw new Error('displayName must be set or undefined');
        }
        if (this.profilePictureURL !== undefined && this.profilePictureURL?.length === 0) {
            throw new Error('profilePictureURL must either undefined or not empty');
        }
        if (this.profileKey !== undefined && this.profileKey?.length === 0) {
            throw new Error('profileKey must either undefined or not empty');
        }
    }
    toProto() {
        return new protobuf_1.SignalService.ConfigurationMessage.Contact({
            publicKey: (0, String_1.fromHexToArray)(this.publicKey),
            name: this.displayName,
            profilePicture: this.profilePictureURL,
            profileKey: this.profileKey,
            isApproved: this.isApproved,
            isBlocked: this.isBlocked,
            didApproveMe: this.didApproveMe,
        });
    }
}
exports.ConfigurationMessageContact = ConfigurationMessageContact;
class ConfigurationMessageClosedGroup {
    publicKey;
    name;
    encryptionKeyPair;
    members;
    admins;
    constructor({ publicKey, name, encryptionKeyPair, members, admins, }) {
        this.publicKey = publicKey;
        this.name = name;
        this.encryptionKeyPair = encryptionKeyPair;
        this.members = members;
        this.admins = admins;
        types_1.PubKey.cast(publicKey);
        if (!encryptionKeyPair?.privateKeyData?.byteLength ||
            !encryptionKeyPair?.publicKeyData?.byteLength) {
            throw new Error('Encryption key pair looks invalid');
        }
        if (!this.name?.length) {
            throw new Error('name must be set');
        }
        if (!this.members?.length) {
            throw new Error('members must be set');
        }
        if (!this.admins?.length) {
            throw new Error('admins must be set');
        }
        if (this.admins.some(a => !this.members.includes(a))) {
            throw new Error('some admins are not members');
        }
    }
    toProto() {
        return new protobuf_1.SignalService.ConfigurationMessage.ClosedGroup({
            publicKey: (0, String_1.fromHexToArray)(this.publicKey),
            name: this.name,
            encryptionKeyPair: {
                publicKey: this.encryptionKeyPair.publicKeyData,
                privateKey: this.encryptionKeyPair.privateKeyData,
            },
            members: this.members.map(String_1.fromHexToArray),
            admins: this.admins.map(String_1.fromHexToArray),
        });
    }
}
exports.ConfigurationMessageClosedGroup = ConfigurationMessageClosedGroup;
