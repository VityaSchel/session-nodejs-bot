/* eslint-disable no-restricted-syntax */
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { omit, toNumber } from 'lodash';
import { ReplyingToMessageProps } from '../../components/conversation/composition/CompositionBox';
import { QuotedAttachmentType } from '../../components/conversation/message/message-content/quote/Quote';
import { LightBoxOptions } from '../../components/conversation/SessionConversation';
import { Data } from '../../data/data';
import {
  CONVERSATION_PRIORITIES,
  ConversationNotificationSettingType,
  ConversationTypeEnum,
} from '../../models/conversationAttributes';
import {
  MessageModelType,
  PropsForDataExtractionNotification,
  PropsForMessageRequestResponse,
} from '../../models/messageType';
import { getConversationController } from '../../session/conversations';
import { ReactionList } from '../../types/Reaction';

export type CallNotificationType = 'missed-call' | 'started-call' | 'answered-a-call';
export type PropsForCallNotification = {
  notificationType: CallNotificationType;
  messageId: string;
  receivedAt: number;
  isUnread: boolean;
};

export type MessageModelPropsWithoutConvoProps = {
  propsForMessage: PropsForMessageWithoutConvoProps;
  propsForGroupInvitation?: PropsForGroupInvitation;
  propsForTimerNotification?: PropsForExpirationTimer;
  propsForDataExtractionNotification?: PropsForDataExtractionNotification;
  propsForGroupUpdateMessage?: PropsForGroupUpdate;
  propsForCallNotification?: PropsForCallNotification;
  propsForMessageRequestResponse?: PropsForMessageRequestResponse;
  propsForQuote?: PropsForQuote;
};

export type MessageModelPropsWithConvoProps = SortedMessageModelProps & {
  propsForMessage: PropsForMessageWithConvoProps;
};

export type ContactPropsMessageDetail = {
  status: string | undefined;
  pubkey: string;
  name?: string | null;
  profileName?: string | null;
  avatarPath?: string | null;
  errors?: Array<Error>;
};

export type MessagePropsDetails = {
  sentAt: number;
  receivedAt: number;
  errors: Array<Error>;
  contacts: Array<ContactPropsMessageDetail>;
  convoId: string;
  messageId: string;
  direction: MessageModelType;
};

export type LastMessageStatusType = 'sending' | 'sent' | 'read' | 'error' | undefined;

export type FindAndFormatContactType = {
  pubkey: string;
  avatarPath: string | null;
  name: string | null;
  profileName: string | null;
  isMe: boolean;
};

export type PropsForExpirationTimer = {
  timespan: string;
  disabled: boolean;
  pubkey: string;
  avatarPath: string | null;
  name: string | null;
  profileName: string | null;
  type: 'fromMe' | 'fromSync' | 'fromOther';
  messageId: string;
  isUnread: boolean;
  receivedAt: number | undefined;
};

export type PropsForGroupUpdateGeneral = {
  type: 'general';
};

export type PropsForGroupUpdateAdd = {
  type: 'add';
  added: Array<string>;
};

export type PropsForGroupUpdateKicked = {
  type: 'kicked';
  kicked: Array<string>;
};

export type PropsForGroupUpdateLeft = {
  type: 'left';
  left: Array<string>;
};

export type PropsForGroupUpdateName = {
  type: 'name';
  newName: string;
};

export type PropsForGroupUpdateType =
  | PropsForGroupUpdateGeneral
  | PropsForGroupUpdateAdd
  | PropsForGroupUpdateKicked
  | PropsForGroupUpdateName
  | PropsForGroupUpdateLeft;

export type PropsForGroupUpdate = {
  change: PropsForGroupUpdateType;
  messageId: string;
  receivedAt: number | undefined;
  isUnread: boolean;
};

export type PropsForGroupInvitation = {
  serverName: string;
  url: string;
  direction: MessageModelType;
  acceptUrl: string;
  messageId: string;
  receivedAt?: number;
  isUnread: boolean;
};

export type PropsForAttachment = {
  id: number;
  contentType: string;
  caption?: string;
  size: number;
  width?: number;
  height?: number;
  url: string;
  path: string;
  fileSize: string | null;
  isVoiceMessage: boolean;
  pending: boolean;
  fileName: string;
  error?: number; // if the download somhehow failed, this will be set to true and be 0-1 once saved in the db
  screenshot: {
    contentType: string;
    width: number;
    height: number;
    url?: string;
    path?: string;
  } | null;
  thumbnail: {
    contentType: string;
    width: number;
    height: number;
    url?: string;
    path?: string;
  } | null;
};

export type PropsForQuote = {
  attachment?: QuotedAttachmentType;
  author: string;
  convoId?: string;
  id?: string; // this is the quoted message timestamp
  isFromMe?: boolean;
  referencedMessageNotFound?: boolean;
  text?: string;
};

export type PropsForMessageWithoutConvoProps = {
  id: string; // messageId
  direction: MessageModelType;
  timestamp: number;
  sender: string; // this is the sender
  convoId: string; // this is the conversation in which this message was sent
  text?: string;

  receivedAt?: number;
  serverTimestamp?: number;
  serverId?: number;
  status?: LastMessageStatusType;
  attachments?: Array<PropsForAttachment>;
  reacts?: ReactionList;
  reactsIndex?: number;
  previews?: Array<any>;
  quote?: PropsForQuote;
  messageHash?: string;
  isDeleted?: boolean;
  isUnread?: boolean;
  expirationLength?: number;
  expirationTimestamp?: number | null;
  isExpired?: boolean;
  isTrustedForAttachmentDownload?: boolean;
};

export type PropsForMessageWithConvoProps = PropsForMessageWithoutConvoProps & {
  conversationType: ConversationTypeEnum;
  isPublic: boolean;
  isKickedFromGroup: boolean;
  weAreAdmin: boolean;
  isSenderAdmin: boolean;
  isDeletable: boolean;
  isDeletableForEveryone: boolean;
  isBlocked: boolean;
  isDeleted?: boolean;
};

export type LastMessageType = {
  status: LastMessageStatusType;
  text: string | null;
};

/**
 * This closely matches ConversationAttributes except making a lot of fields optional.
 * The size of the redux store is an issue considering the number of conversations we have, so having optional fields here
 * allows us to not have them set if they have their default values.
 */
export interface ReduxConversationType {
  id: string;
  /**
   * This must hold the real session username of the user for a private chat (not the nickname), and the real name of the group/closed group otherwise
   */
  displayNameInProfile?: string;
  nickname?: string;

  activeAt?: number;
  lastMessage?: LastMessageType;
  type: ConversationTypeEnum;
  isMe?: boolean;
  isPublic?: boolean;
  isPrivate?: boolean; // !isPrivate means isGroup (group or community)
  weAreAdmin?: boolean;
  unreadCount?: number;
  mentionedUs?: boolean;
  expireTimer?: number;

  isTyping?: boolean;
  isBlocked?: boolean;
  isKickedFromGroup?: boolean;
  left?: boolean;
  avatarPath?: string | null; // absolute filepath to the avatar
  groupAdmins?: Array<string>; // admins for closed groups and admins for open groups
  members?: Array<string>; // members for closed groups only
  zombies?: Array<string>; // members for closed groups only

  /**
   * If this is undefined, it means all notification are enabled
   */
  currentNotificationSetting?: ConversationNotificationSettingType;

  priority?: number; // undefined means 0
  isInitialFetchingInProgress?: boolean;
  isApproved?: boolean;
  didApproveMe?: boolean;

  isMarkedUnread?: boolean;

  blocksSogsMsgReqsTimestamp?: number; // undefined means 0
}

export interface NotificationForConvoOption {
  name: string;
  value: ConversationNotificationSettingType;
}

export type ConversationLookupType = {
  [key: string]: ReduxConversationType;
};

export type QuoteLookupType = {
  // key is message [timestamp]-[author-pubkey]
  [key: string]: MessageModelPropsWithoutConvoProps;
};

export type ConversationsStateType = {
  conversationLookup: ConversationLookupType;
  selectedConversation?: string;
  // NOTE the messages that are in view
  messages: Array<MessageModelPropsWithoutConvoProps>;
  // NOTE the messages quoted by other messages which are in view
  quotes: QuoteLookupType;
  firstUnreadMessageId: string | undefined;
  messageDetailProps?: MessagePropsDetails;
  showRightPanel: boolean;
  selectedMessageIds: Array<string>;
  lightBox?: LightBoxOptions;
  quotedMessage?: ReplyingToMessageProps;
  areMoreMessagesBeingFetched: boolean;

  /**
   * oldTopMessageId should only be set when, as the user scroll up we trigger a load of more top messages.
   * Saving it here, make it possible to restore the position of the user before the refresh by pointing
   * at that same messageId and aligning the list to the top.
   *
   * Once the view scrolled, this value is reset by resetOldTopMessageId
   */

  oldTopMessageId: string | null;
  /**
   * oldBottomMessageId should only be set when, as the user scroll down we trigger a load of more bottom messages.
   * Saving it here, make it possible to restore the position of the user before the refresh by pointing
   * at that same messageId and aligning the list to the bottom.
   *
   * Once the view scrolled, this value is reset by resetOldBottomMessageId
   */
  oldBottomMessageId: string | null;

  /**
   * Contains the most recent message id for this conversation.
   * This is the one at the bottom, if the most recent page of the conversation was loaded.
   * But this might also be a message not visible (like if the user scrolled up, the most recent message is not rendered)
   */
  mostRecentMessageId: string | null;

  showScrollButton: boolean;
  animateQuotedMessageId?: string;
  shouldHighlightMessage: boolean;
  nextMessageToPlayId?: string;
  mentionMembers: MentionsMembersType;
};

export type MentionsMembersType = Array<{
  id: string;
  authorProfileName: string;
}>;

/**
 * Fetches the messages for a conversation to put into redux.
 * @param conversationKey - the id of the conversation
 * @param messageId - the id of the message in view so we can fetch the messages around it
 * @returns the fetched models for messages and quoted messages
 */
async function getMessages({
  conversationKey,
  messageId,
}: {
  conversationKey: string;
  messageId: string | null;
}): Promise<{
  messagesProps: Array<MessageModelPropsWithoutConvoProps>;
  quotesProps: QuoteLookupType;
}> {
  const beforeTimestamp = Date.now();

  const conversation = getConversationController().get(conversationKey);
  if (!conversation) {
    // no valid conversation, early return
    window?.log?.error('Failed to get convo on reducer.');
    return { messagesProps: [], quotesProps: {} };
  }

  const {
    messages: messagesCollection,
    quotes: quotesCollection,
  } = await Data.getMessagesByConversation(conversationKey, {
    messageId,
    returnQuotes: true,
  });

  const messagesProps: Array<MessageModelPropsWithoutConvoProps> = messagesCollection.models.map(
    m => m.getMessageModelProps()
  );
  const time = Date.now() - beforeTimestamp;
  window?.log?.info(`Loading ${messagesProps.length} messages took ${time}ms to load.`);

  const quotesProps: QuoteLookupType = {};

  if (quotesCollection?.length) {
    const quotePropsList = quotesCollection.map(quote => ({
      timestamp: toNumber(quote.id),
      source: String(quote.author),
    }));

    const quotedMessagesCollection = await Data.getMessagesBySenderAndSentAt(quotePropsList);

    if (quotedMessagesCollection?.length) {
      for (let i = 0; i < quotedMessagesCollection.length; i++) {
        const quotedMessage = quotedMessagesCollection.models.at(i)?.getMessageModelProps();
        if (quotedMessage) {
          const timestamp = quotedMessage.propsForMessage.timestamp;
          const sender = quotedMessage.propsForMessage.sender;
          if (timestamp && sender) {
            quotesProps[`${timestamp}-${sender}`] = quotedMessage;
          }
        }
      }
    }
  }

  return { messagesProps, quotesProps };
}

export type SortedMessageModelProps = MessageModelPropsWithoutConvoProps & {
  firstMessageOfSeries: boolean;
  lastMessageOfSeries: boolean;
};

type FetchedTopMessageResults = {
  conversationKey: string;
  messagesProps: Array<MessageModelPropsWithoutConvoProps>;
  quotesProps: QuoteLookupType;
  oldTopMessageId: string | null;
  newMostRecentMessageIdInConversation: string | null;
} | null;

export const fetchTopMessagesForConversation = createAsyncThunk(
  'messages/fetchTopByConversationKey',
  async ({
    conversationKey,
    oldTopMessageId,
  }: {
    conversationKey: string;
    oldTopMessageId: string | null;
  }): Promise<FetchedTopMessageResults> => {
    // no need to load more top if we are already at the top
    const oldestMessage = await Data.getOldestMessageInConversation(conversationKey);
    const mostRecentMessage = await Data.getLastMessageInConversation(conversationKey);

    if (!oldestMessage || oldestMessage.id === oldTopMessageId) {
      // console.debug('fetchTopMessagesForConversation: we are already at the top');
      return null;
    }
    const { messagesProps, quotesProps } = await getMessages({
      conversationKey,
      messageId: oldTopMessageId,
    });

    return {
      conversationKey,
      messagesProps,
      quotesProps,
      oldTopMessageId,
      newMostRecentMessageIdInConversation: mostRecentMessage?.id || null,
    };
  }
);

type FetchedBottomMessageResults = {
  conversationKey: string;
  messagesProps: Array<MessageModelPropsWithoutConvoProps>;
  quotesProps: QuoteLookupType;
  oldBottomMessageId: string | null;
  newMostRecentMessageIdInConversation: string | null;
} | null;

export const fetchBottomMessagesForConversation = createAsyncThunk(
  'messages/fetchBottomByConversationKey',
  async ({
    conversationKey,
    oldBottomMessageId,
  }: {
    conversationKey: string;
    oldBottomMessageId: string | null;
  }): Promise<FetchedBottomMessageResults> => {
    // no need to load more bottom if we are already at the bottom
    const mostRecentMessage = await Data.getLastMessageInConversation(conversationKey);

    if (!mostRecentMessage || mostRecentMessage.id === oldBottomMessageId) {
      // console.debug('fetchBottomMessagesForConversation: we are already at the bottom');
      return null;
    }
    const { messagesProps, quotesProps } = await getMessages({
      conversationKey,
      messageId: oldBottomMessageId,
    });

    return {
      conversationKey,
      messagesProps,
      quotesProps,
      oldBottomMessageId,
      newMostRecentMessageIdInConversation: mostRecentMessage.id,
    };
  }
);

// Reducer

export function getEmptyConversationState(): ConversationsStateType {
  return {
    conversationLookup: {},
    messages: [],
    quotes: {},
    messageDetailProps: undefined,
    showRightPanel: false,
    selectedMessageIds: [],
    areMoreMessagesBeingFetched: false, // top or bottom
    showScrollButton: false,
    mentionMembers: [],
    firstUnreadMessageId: undefined,
    oldTopMessageId: null,
    oldBottomMessageId: null,
    shouldHighlightMessage: false,
    mostRecentMessageId: null,
  };
}

function handleMessageChangedOrAdded(
  state: ConversationsStateType,
  changedOrAddedMessageProps: MessageModelPropsWithoutConvoProps
) {
  if (changedOrAddedMessageProps.propsForMessage.convoId !== state.selectedConversation) {
    return state;
  }

  const messageInStoreIndex = state.messages.findIndex(
    m => m.propsForMessage.id === changedOrAddedMessageProps.propsForMessage.id
  );
  if (messageInStoreIndex >= 0) {
    state.messages[messageInStoreIndex] = changedOrAddedMessageProps;

    return state;
  }

  // this message was not present before in the state, and we assume it was added at the bottom.
  // as showScrollButton is set, it means we are not scrolled down, hence, that message is not visible
  // this is to avoid adding messages at the bottom when we are scrolled up looking at old messages. The new message which just came in is not going to at his right place by adding it at the end here.
  if (state.showScrollButton) {
    return state;
  }
  // sorting happens in the selector

  state.messages.push(changedOrAddedMessageProps);
  return state;
}

function handleMessagesChangedOrAdded(
  state: ConversationsStateType,
  payload: Array<MessageModelPropsWithoutConvoProps>
) {
  let stateCopy = state;
  payload.forEach(element => {
    stateCopy = handleMessageChangedOrAdded(stateCopy, element);
  });

  return stateCopy;
}

function handleMessageExpiredOrDeleted(
  state: ConversationsStateType,
  payload: {
    messageId: string;
    conversationKey: string;
  }
) {
  const { conversationKey, messageId } = payload;
  if (conversationKey === state.selectedConversation) {
    // search if we find this message id.
    // we might have not loaded yet, so this case might not happen
    const messageInStoreIndex = state?.messages.findIndex(m => m.propsForMessage.id === messageId);
    const editedQuotes = { ...state.quotes };
    if (messageInStoreIndex >= 0) {
      // we cannot edit the array directly, so slice the first part, and slice the second part,
      // keeping the index removed out
      const editedMessages = [
        ...state.messages.slice(0, messageInStoreIndex),
        ...state.messages.slice(messageInStoreIndex + 1),
      ];

      // Check if the message is quoted somewhere, and if so, remove it from the quotes
      const msgProps = state.messages[messageInStoreIndex].propsForMessage;
      const { timestamp, sender } = msgProps;
      if (timestamp && sender) {
        const message2Delete = lookupQuote(editedQuotes, editedMessages, timestamp, sender);
        console.debug(
          `Deleting quote {${timestamp}-${sender}} ${JSON.stringify(message2Delete)}`
        );

        delete editedQuotes[`${timestamp}-${sender}`];
      }

      return {
        ...state,
        messages: editedMessages,
        quotes: editedQuotes,
        firstUnreadMessageId:
          state.firstUnreadMessageId === messageId ? undefined : state.firstUnreadMessageId,
      };
    }

    return state;
  }
  return state;
}

function handleMessagesExpiredOrDeleted(
  state: ConversationsStateType,
  action: PayloadAction<
    Array<{
      messageId: string;
      conversationKey: string;
    }>
  >
): ConversationsStateType {
  let stateCopy = state;
  action.payload.forEach(element => {
    stateCopy = handleMessageExpiredOrDeleted(stateCopy, element);
  });

  return stateCopy;
}

function handleConversationReset(state: ConversationsStateType, action: PayloadAction<string>) {
  const conversationKey = action.payload;
  if (conversationKey === state.selectedConversation) {
    // just empty the list of messages
    return {
      ...state,
      messages: [],
    };
  }
  return state;
}

const conversationsSlice = createSlice({
  name: 'conversations',
  initialState: getEmptyConversationState(),
  reducers: {
    showMessageDetailsView(
      state: ConversationsStateType,
      action: PayloadAction<MessagePropsDetails>
    ) {
      // force the right panel to be hidden when showing message detail view
      return { ...state, messageDetailProps: action.payload, showRightPanel: false };
    },

    closeMessageDetailsView(state: ConversationsStateType) {
      return { ...state, messageDetailProps: undefined };
    },

    openRightPanel(state: ConversationsStateType) {
      if (
        state.selectedConversation === undefined ||
        !state.conversationLookup[state.selectedConversation]
      ) {
        return state;
      }
      const selected = state.conversationLookup[state.selectedConversation];

      // we can open the right panel always for non private chats. and also when the chat is private, and we are friends with the other person
      if (!selected.isPrivate || (selected.isApproved && selected.didApproveMe)) {
        return { ...state, showRightPanel: true };
      }

      return state;
    },
    closeRightPanel(state: ConversationsStateType) {
      return { ...state, showRightPanel: false };
    },
    addMessageIdToSelection(state: ConversationsStateType, action: PayloadAction<string>) {
      if (state.selectedMessageIds.some(id => id === action.payload)) {
        return state;
      }
      return { ...state, selectedMessageIds: [...state.selectedMessageIds, action.payload] };
    },
    removeMessageIdFromSelection(state: ConversationsStateType, action: PayloadAction<string>) {
      const index = state.selectedMessageIds.findIndex(id => id === action.payload);

      if (index === -1) {
        return state;
      }
      return { ...state, selectedMessageIds: state.selectedMessageIds.splice(index, 1) };
    },
    toggleSelectedMessageId(state: ConversationsStateType, action: PayloadAction<string>) {
      const index = state.selectedMessageIds.findIndex(id => id === action.payload);

      if (index === -1) {
        state.selectedMessageIds = [...state.selectedMessageIds, action.payload];
      } else {
        state.selectedMessageIds.splice(index, 1);
      }

      return state;
    },
    resetSelectedMessageIds(state: ConversationsStateType) {
      return { ...state, selectedMessageIds: [] };
    },

    conversationAdded(
      state: ConversationsStateType,
      action: PayloadAction<{
        id: string;
        data: ReduxConversationType;
      }>
    ) {
      const { conversationLookup } = state;

      return {
        ...state,
        conversationLookup: {
          ...conversationLookup,
          [action.payload.id]: action.payload.data,
        },
      };
    },

    conversationsChanged(
      state: ConversationsStateType,
      action: PayloadAction<Array<ReduxConversationType>>
    ) {
      const { payload } = action;

      let updatedState = state;
      if (payload.length) {
        updatedState = applyConversationsChanged(updatedState, payload);
      }

      return updatedState;
    },

    conversationRemoved(state: ConversationsStateType, action: PayloadAction<string>) {
      const { payload: conversationId } = action;
      const { conversationLookup, selectedConversation } = state;
      return {
        ...state,
        conversationLookup: omit(conversationLookup, [conversationId]),
        selectedConversation:
          selectedConversation === conversationId ? undefined : selectedConversation,
      };
    },

    removeAllConversations() {
      return getEmptyConversationState();
    },

    messagesChanged(
      state: ConversationsStateType,
      action: PayloadAction<Array<MessageModelPropsWithoutConvoProps>>
    ) {
      return handleMessagesChangedOrAdded(state, action.payload);
    },

    messagesExpired(
      state: ConversationsStateType,
      action: PayloadAction<
        Array<{
          messageId: string;
          conversationKey: string;
        }>
      >
    ) {
      return handleMessagesExpiredOrDeleted(state, action);
    },

    messagesDeleted(
      state: ConversationsStateType,
      action: PayloadAction<
        Array<{
          messageId: string;
          conversationKey: string;
        }>
      >
    ) {
      return handleMessagesExpiredOrDeleted(state, action);
    },

    conversationReset(state: ConversationsStateType, action: PayloadAction<string>) {
      return handleConversationReset(state, action);
    },

    markConversationFullyRead(state: ConversationsStateType, action: PayloadAction<string>) {
      if (state.selectedConversation !== action.payload) {
        return state;
      }

      let updatedMessages = state.messages;

      // if some are unread, mark them as read
      if (state.messages.some(m => m.propsForMessage.isUnread)) {
        updatedMessages = state.messages.map(m => ({
          ...m,
          propsForMessage: { ...m.propsForMessage, isUnread: false },
        }));
      }

      // keep the unread visible just like in other apps. It will be shown until the user changes convo
      return {
        ...state,
        shouldHighlightMessage: false,
        firstUnreadMessageId: undefined,

        messages: updatedMessages,
      };
    },
    /**
     * Closes any existing conversation and returns state to the placeholder screen
     */
    resetConversationExternal(state: ConversationsStateType) {
      return { ...getEmptyConversationState(), conversationLookup: state.conversationLookup };
    },
    openConversationExternal(
      state: ConversationsStateType,
      action: PayloadAction<{
        conversationKey: string;
        firstUnreadIdOnOpen: string | undefined;
        mostRecentMessageIdOnOpen: string | null;
        initialMessages: Array<MessageModelPropsWithoutConvoProps>;
        initialQuotes: QuoteLookupType;
      }>
    ) {
      // this is quite hacky, but we don't want to show the showScrollButton if we have only a small amount of messages,
      // or if the first unread message is not far from the most recent one.
      // this is because when a new message get added, we do not add it to redux depending on the showScrollButton state.
      const messagesToConsiderForShowingUnreadBanner = 10;

      let showScrollButton = Boolean(action.payload.firstUnreadIdOnOpen);

      if (
        action.payload.initialMessages?.length <= messagesToConsiderForShowingUnreadBanner ||
        action.payload.initialMessages
          ?.slice(0, messagesToConsiderForShowingUnreadBanner)
          .some(n => n.propsForMessage.id === action.payload.firstUnreadIdOnOpen)
      ) {
        showScrollButton = false;
      }
      return {
        conversationLookup: state.conversationLookup,
        mostRecentMessageId: action.payload.mostRecentMessageIdOnOpen,
        selectedConversation: action.payload.conversationKey,
        firstUnreadMessageId: action.payload.firstUnreadIdOnOpen,
        messages: action.payload.initialMessages,
        quotes: action.payload.initialQuotes,

        areMoreMessagesBeingFetched: false,
        showRightPanel: false,
        selectedMessageIds: [],

        lightBox: undefined,
        messageDetailProps: undefined,
        quotedMessage: undefined,

        nextMessageToPlay: undefined,
        showScrollButton,
        animateQuotedMessageId: undefined,
        shouldHighlightMessage: false,
        oldTopMessageId: null,
        oldBottomMessageId: null,
        mentionMembers: [],
      };
    },
    openConversationToSpecificMessage(
      state: ConversationsStateType,
      action: PayloadAction<{
        conversationKey: string;
        messageIdToNavigateTo: string;
        shouldHighlightMessage: boolean;
        mostRecentMessageIdOnOpen: string | null;

        initialMessages: Array<MessageModelPropsWithoutConvoProps>;
        initialQuotes: QuoteLookupType;
      }>
    ) {
      return {
        ...state,
        selectedConversation: action.payload.conversationKey,
        mostRecentMessageIdOnOpen: action.payload.mostRecentMessageIdOnOpen,
        areMoreMessagesBeingFetched: false,
        messages: action.payload.initialMessages,
        quotes: action.payload.initialQuotes,
        showScrollButton: Boolean(
          action.payload.messageIdToNavigateTo !== action.payload.mostRecentMessageIdOnOpen
        ),
        animateQuotedMessageId: action.payload.messageIdToNavigateTo,
        shouldHighlightMessage: action.payload.shouldHighlightMessage,
        oldTopMessageId: null,
        oldBottomMessageId: null,
      };
    },
    resetOldTopMessageId(state: ConversationsStateType) {
      state.oldTopMessageId = null;
      return state;
    },
    resetOldBottomMessageId(state: ConversationsStateType) {
      state.oldBottomMessageId = null;
      return state;
    },
    showLightBox(
      state: ConversationsStateType,
      action: PayloadAction<LightBoxOptions | undefined>
    ) {
      state.lightBox = action.payload;
      return state;
    },
    showScrollToBottomButton(state: ConversationsStateType, action: PayloadAction<boolean>) {
      state.showScrollButton = action.payload;
      return state;
    },
    quoteMessage(
      state: ConversationsStateType,
      action: PayloadAction<ReplyingToMessageProps | undefined>
    ) {
      state.quotedMessage = action.payload;
      return state;
    },
    quotedMessageToAnimate(
      state: ConversationsStateType,
      action: PayloadAction<string | undefined>
    ) {
      state.animateQuotedMessageId = action.payload;
      state.shouldHighlightMessage = Boolean(state.animateQuotedMessageId);
      return state;
    },
    setNextMessageToPlayId(
      state: ConversationsStateType,
      action: PayloadAction<string | undefined>
    ) {
      state.nextMessageToPlayId = action.payload;
      return state;
    },
    updateMentionsMembers(
      state: ConversationsStateType,
      action: PayloadAction<MentionsMembersType>
    ) {
      window?.log?.info('updating mentions input members length', action.payload?.length);
      state.mentionMembers = action.payload;
      return state;
    },
    markConversationInitialLoadingInProgress(
      state: ConversationsStateType,
      action: PayloadAction<{ conversationKey: string; isInitialFetchingInProgress: boolean }>
    ) {
      window?.log?.info(
        `mark conversation initialLoading ${action.payload.conversationKey}: ${action.payload.isInitialFetchingInProgress}`
      );
      if (state.conversationLookup[action.payload.conversationKey]) {
        state.conversationLookup[action.payload.conversationKey].isInitialFetchingInProgress =
          action.payload.isInitialFetchingInProgress;
      }

      return state;
    },
  },
  extraReducers: (builder: any) => {
    // Add reducers for additional action types here, and handle loading state as needed
    builder.addCase(
      fetchTopMessagesForConversation.fulfilled,
      (
        state: ConversationsStateType,
        action: PayloadAction<FetchedTopMessageResults>
      ): ConversationsStateType => {
        if (!action.payload) {
          return { ...state, areMoreMessagesBeingFetched: false };
        }
        // this is called once the messages are loaded from the db for the currently selected conversation
        const {
          messagesProps,
          conversationKey,
          oldTopMessageId,
          newMostRecentMessageIdInConversation,
        } = action.payload;
        // double check that this update is for the shown convo
        if (conversationKey === state.selectedConversation) {
          return {
            ...state,
            oldTopMessageId,
            messages: messagesProps,
            areMoreMessagesBeingFetched: false,
            mostRecentMessageId: newMostRecentMessageIdInConversation,
          };
        }
        return state;
      }
    );
    builder.addCase(
      fetchTopMessagesForConversation.pending,
      (state: ConversationsStateType): ConversationsStateType => {
        state.areMoreMessagesBeingFetched = true;
        return state;
      }
    );
    builder.addCase(
      fetchTopMessagesForConversation.rejected,
      (state: ConversationsStateType): ConversationsStateType => {
        state.areMoreMessagesBeingFetched = false;
        return state;
      }
    );
    builder.addCase(
      fetchBottomMessagesForConversation.fulfilled,
      (
        state: ConversationsStateType,
        action: PayloadAction<FetchedBottomMessageResults>
      ): ConversationsStateType => {
        if (!action.payload) {
          return { ...state, areMoreMessagesBeingFetched: false };
        }
        // this is called once the messages are loaded from the db for the currently selected conversation
        const {
          messagesProps,
          conversationKey,
          oldBottomMessageId,
          newMostRecentMessageIdInConversation,
        } = action.payload;
        // double check that this update is for the shown convo
        if (conversationKey === state.selectedConversation) {
          return {
            ...state,
            oldBottomMessageId,
            messages: messagesProps,
            areMoreMessagesBeingFetched: false,
            mostRecentMessageId: newMostRecentMessageIdInConversation,
          };
        }
        return state;
      }
    );
    builder.addCase(
      fetchBottomMessagesForConversation.pending,
      (state: ConversationsStateType): ConversationsStateType => {
        state.areMoreMessagesBeingFetched = true;
        return state;
      }
    );
    builder.addCase(
      fetchBottomMessagesForConversation.rejected,
      (state: ConversationsStateType): ConversationsStateType => {
        state.areMoreMessagesBeingFetched = false;
        return state;
      }
    );
  },
});

function applyConversationsChanged(
  state: ConversationsStateType,
  payload: Array<ReduxConversationType>
) {
  const { conversationLookup, selectedConversation } = state;

  for (let index = 0; index < payload.length; index++) {
    const convoProps = payload[index];
    const { id } = convoProps;
    // In the `change` case we only modify the lookup if we already had that conversation
    const existing = conversationLookup[id];

    if (!existing) {
      continue;
    }

    if (
      state.selectedConversation &&
      convoProps.isPrivate &&
      convoProps.id === selectedConversation &&
      convoProps.priority &&
      convoProps.priority < CONVERSATION_PRIORITIES.default
    ) {
      // A private conversation hidden cannot be a selected.
      // When opening a hidden conversation, we unhide it so it can be selected again.
      state.selectedConversation = undefined;
    }

    state.conversationLookup[id] = {
      ...convoProps,
      isInitialFetchingInProgress: existing.isInitialFetchingInProgress,
    };
  }

  return state;
}

export const { actions, reducer } = conversationsSlice;
export const {
  // conversation and messages list
  conversationAdded,
  conversationsChanged,
  conversationRemoved,
  removeAllConversations,
  messagesExpired,
  messagesDeleted,
  conversationReset,
  messagesChanged,
  resetOldTopMessageId,
  resetOldBottomMessageId,
  markConversationFullyRead,
  // layout stuff
  showMessageDetailsView,
  closeMessageDetailsView,
  openRightPanel,
  closeRightPanel,
  addMessageIdToSelection,
  resetSelectedMessageIds,
  toggleSelectedMessageId,
  showLightBox,
  quoteMessage,
  showScrollToBottomButton,
  quotedMessageToAnimate,
  setNextMessageToPlayId,
  updateMentionsMembers,
  resetConversationExternal,
  markConversationInitialLoadingInProgress,
} = actions;

async function unmarkAsForcedUnread(convoId: string) {
  const convo = getConversationController().get(convoId);
  if (convo && convo.isMarkedUnread()) {
    // we just opened it and it was forced "Unread", so we reset the unread state here
    await convo.markAsUnread(false, true);
  }
}

export async function openConversationWithMessages(args: {
  conversationKey: string;
  messageId: string | null;
}) {
  const { conversationKey, messageId } = args;

  await unmarkAsForcedUnread(conversationKey);

  const firstUnreadIdOnOpen = await Data.getFirstUnreadMessageIdInConversation(conversationKey);
  const mostRecentMessageIdOnOpen = await Data.getLastMessageIdInConversation(conversationKey);

  const { messagesProps: initialMessages, quotesProps: initialQuotes } = await getMessages({
    conversationKey,
    messageId: messageId || null,
  });

  window.inboxStore?.dispatch(
    actions.openConversationExternal({
      conversationKey,
      firstUnreadIdOnOpen,
      mostRecentMessageIdOnOpen,
      initialMessages,
      initialQuotes,
    })
  );
}

export async function openConversationToSpecificMessage(args: {
  conversationKey: string;
  messageIdToNavigateTo: string;
  shouldHighlightMessage: boolean;
}) {
  const { conversationKey, messageIdToNavigateTo, shouldHighlightMessage } = args;
  await unmarkAsForcedUnread(conversationKey);

  const {
    messagesProps: messagesAroundThisMessage,
    quotesProps: quotesAroundThisMessage,
  } = await getMessages({
    conversationKey,
    messageId: messageIdToNavigateTo,
  });

  const mostRecentMessageIdOnOpen = await Data.getLastMessageIdInConversation(conversationKey);

  // we do not care about the firstunread message id when opening to a specific message
  window.inboxStore?.dispatch(
    actions.openConversationToSpecificMessage({
      conversationKey,
      messageIdToNavigateTo,
      mostRecentMessageIdOnOpen,
      shouldHighlightMessage,
      initialMessages: messagesAroundThisMessage,
      initialQuotes: quotesAroundThisMessage,
    })
  );
}

/**
 * Look for quote matching the timestamp and author in the quote lookup map
 * @param quotes - the lookup map of the selected conversations quotes
 * @param messages - the messages in memory for the selected conversation
 * @param author - the pubkey of the quoted author
 * @param timestamp - usually the id prop on the quote object of a message
 * @returns - the message model if found, undefined otherwise
 */
export function lookupQuote(
  quotes: QuoteLookupType,
  messages: Array<MessageModelPropsWithoutConvoProps>,
  timestamp: number,
  author: string
): MessageModelPropsWithoutConvoProps | undefined {
  let sourceMessage = quotes[`${timestamp}-${author}`];

  // NOTE If a quote is processed but we haven't triggered a render, the quote might not be in the lookup map yet so we check the messages in memory.
  if (!sourceMessage) {
    const quotedMessages = messages.filter(message => {
      const msgProps = message.propsForMessage;
      return msgProps.timestamp === timestamp && msgProps.sender === author;
    });

    if (quotedMessages?.length) {
      for (const quotedMessage of quotedMessages) {
        if (quotedMessage) {
          sourceMessage = quotedMessage;
        }
      }
    }
  }

  return sourceMessage;
}
