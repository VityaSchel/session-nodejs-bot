"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenGroupManagerV2 = exports.getOpenGroupManager = void 0;
const lodash_1 = require("lodash");
const auto_bind_1 = __importDefault(require("auto-bind"));
const opengroups_1 = require("../../../../data/opengroups");
const conversations_1 = require("../../../conversations");
const Promise_1 = require("../../../utils/Promise");
const OpenGroupUtils_1 = require("../utils/OpenGroupUtils");
const ApiUtil_1 = require("./ApiUtil");
const OpenGroupServerPoller_1 = require("./OpenGroupServerPoller");
const conversationAttributes_1 = require("../../../../models/conversationAttributes");
const libsession_utils_user_groups_1 = require("../../../utils/libsession/libsession_utils_user_groups");
const sogsV3RoomInfos_1 = require("../sogsv3/sogsV3RoomInfos");
const libsession_worker_interface_1 = require("../../../../webworker/workers/browser/libsession_worker_interface");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
let instance;
const getOpenGroupManager = () => {
    if (!instance) {
        instance = new OpenGroupManagerV2();
    }
    return instance;
};
exports.getOpenGroupManager = getOpenGroupManager;
class OpenGroupManagerV2 {
    static useV2OpenGroups = false;
    pollers = new Map();
    isPolling = false;
    constructor() {
        (0, auto_bind_1.default)(this);
    }
    async attemptConnectionV2OneAtATime(serverUrl, roomId, publicKey) {
        const overridenUrl = (serverUrl.includes(`://${ApiUtil_1.ourSogsDomainName}`) && !serverUrl.startsWith('https')) ||
            serverUrl.includes(`://${ApiUtil_1.ourSogsLegacyIp}`)
            ? ApiUtil_1.ourSogsUrl
            : serverUrl;
        const oneAtaTimeStr = `oneAtaTimeOpenGroupV2Join:${overridenUrl}${roomId}`;
        return (0, Promise_1.allowOnlyOneAtATime)(oneAtaTimeStr, async () => {
            return this.attemptConnectionV2(overridenUrl, roomId, publicKey);
        });
    }
    async startPolling() {
        await (0, Promise_1.allowOnlyOneAtATime)('V2ManagerStartPolling', this.startPollingBouncy);
    }
    stopPolling() {
        if (!this.isPolling) {
            return;
        }
        this.pollers.forEach(poller => {
            poller.stop();
        });
        this.pollers.clear();
        this.isPolling = false;
    }
    addRoomToPolledRooms(roomInfos) {
        const grouped = (0, lodash_1.groupBy)(roomInfos, r => r.serverUrl);
        const groupedArray = Object.values(grouped);
        for (const groupedRooms of groupedArray) {
            const groupedRoomsServerUrl = groupedRooms[0].serverUrl;
            const poller = this.pollers.get(groupedRoomsServerUrl);
            if (!poller) {
                const uniqGroupedRooms = (0, lodash_1.uniqBy)(groupedRooms, r => r.roomId);
                this.pollers.set(groupedRoomsServerUrl, new OpenGroupServerPoller_1.OpenGroupServerPoller(uniqGroupedRooms));
            }
            else {
                groupedRooms.forEach(poller.addRoomToPoll);
            }
        }
    }
    removeRoomFromPolledRooms(roomInfos) {
        const poller = this.pollers.get(roomInfos.serverUrl);
        if (!poller) {
            return;
        }
        poller.removeRoomFromPoll(roomInfos);
        if (poller.getPolledRoomsCount() === 0) {
            this.pollers.delete(roomInfos.serverUrl);
            poller.stop();
        }
    }
    async startPollingBouncy() {
        if (this.isPolling) {
            return;
        }
        const inWrapperCommunities = await libsession_utils_user_groups_1.SessionUtilUserGroups.getAllCommunitiesNotCached();
        const inWrapperIds = inWrapperCommunities.map(m => (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(m.baseUrl, m.roomCasePreserved));
        let allRoomInfos = opengroups_1.OpenGroupData.getAllV2OpenGroupRoomsMap();
        if (allRoomInfos?.size) {
            const roomInfosAsArray = [...allRoomInfos.values()];
            for (let index = 0; index < roomInfosAsArray.length; index++) {
                const infos = roomInfosAsArray[index];
                try {
                    const roomConvoId = (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(infos.serverUrl, infos.roomId);
                    if (!inWrapperIds.includes(roomConvoId)) {
                        await opengroups_1.OpenGroupData.removeV2OpenGroupRoom(roomConvoId);
                        (0, exports.getOpenGroupManager)().removeRoomFromPolledRooms(infos);
                        await (0, conversations_1.getConversationController)().deleteCommunity(roomConvoId, {
                            fromSyncMessage: false,
                        });
                    }
                }
                catch (e) {
                    sessionjs_logger_1.console.warn('cleanup roomInfos error', e);
                }
            }
        }
        allRoomInfos = opengroups_1.OpenGroupData.getAllV2OpenGroupRoomsMap();
        if (allRoomInfos?.size) {
            this.addRoomToPolledRooms([...allRoomInfos.values()]);
        }
        this.isPolling = true;
    }
    async attemptConnectionV2(serverUrl, roomId, serverPublicKey) {
        let conversationId = (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(serverUrl, roomId);
        if ((0, conversations_1.getConversationController)().get(conversationId)) {
            throw new Error(window.i18n('publicChatExists'));
        }
        try {
            const fullUrl = await libsession_worker_interface_1.UserGroupsWrapperActions.buildFullUrlFromDetails(serverUrl, roomId, serverPublicKey);
            await opengroups_1.OpenGroupData.removeV2OpenGroupRoom(conversationId);
            try {
                await libsession_utils_user_groups_1.SessionUtilUserGroups.removeCommunityFromWrapper(conversationId, fullUrl);
            }
            catch (e) {
                sessionjs_logger_1.console.warn('failed to removeCommunityFromWrapper', conversationId);
            }
            const room = {
                serverUrl,
                roomId,
                conversationId,
                serverPublicKey,
            };
            const updatedRoom = (0, lodash_1.clone)(room);
            await opengroups_1.OpenGroupData.saveV2OpenGroupRoom(room);
            const roomInfos = await (0, sogsV3RoomInfos_1.openGroupV2GetRoomInfoViaOnionV4)({
                serverPubkey: serverPublicKey,
                serverUrl,
                roomId,
            });
            if (!roomInfos || !roomInfos.id) {
                throw new Error('Invalid open group roomInfo result');
            }
            updatedRoom.roomId = roomInfos.id;
            conversationId = (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(serverUrl, roomInfos.id);
            updatedRoom.conversationId = conversationId;
            if (!(0, lodash_1.isEqual)(room, updatedRoom)) {
                await opengroups_1.OpenGroupData.removeV2OpenGroupRoom(conversationId);
                await opengroups_1.OpenGroupData.saveV2OpenGroupRoom(updatedRoom);
            }
            const conversation = await (0, conversations_1.getConversationController)().getOrCreateAndWait(conversationId, conversationAttributes_1.ConversationTypeEnum.GROUP);
            updatedRoom.imageID = roomInfos.imageId || undefined;
            updatedRoom.roomName = roomInfos.name || undefined;
            updatedRoom.capabilities = roomInfos.capabilities;
            await opengroups_1.OpenGroupData.saveV2OpenGroupRoom(updatedRoom);
            conversation.set({
                active_at: Date.now(),
                displayNameInProfile: updatedRoom.roomName,
                isApproved: true,
                didApproveMe: true,
                priority: conversationAttributes_1.CONVERSATION_PRIORITIES.default,
                isTrustedForAttachmentDownload: true,
            });
            await conversation.commit();
            this.addRoomToPolledRooms([updatedRoom]);
            return conversation;
        }
        catch (e) {
            sessionjs_logger_1.console.warn('Failed to join open group v2', e.message);
            await opengroups_1.OpenGroupData.removeV2OpenGroupRoom(conversationId);
            return undefined;
        }
    }
}
exports.OpenGroupManagerV2 = OpenGroupManagerV2;
