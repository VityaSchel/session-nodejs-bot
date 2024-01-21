import Backbone from 'backbone';

import autoBind from 'auto-bind';
import {
  cloneDeep,
  debounce,
  groupBy,
  isEmpty,
  size as lodashSize,
  map,
  partition,
  pick,
  reject,
  sortBy,
  uniq,
} from 'lodash';
import filesize from 'filesize';
import { SignalService } from '../protobuf';
import { getMessageQueue } from '../session';
import { getConversationController } from '../session/conversations';
import { DataMessage } from '../session/messages/outgoing';
import { PubKey } from '../session/types';
import {
  uploadAttachmentsToFileServer,
  uploadLinkPreviewToFileServer,
  uploadQuoteThumbnailsToFileServer,
  UserUtils,
} from '../session/utils';
import { ClosedGroupVisibleMessage } from '../session/messages/outgoing/visibleMessage/ClosedGroupVisibleMessage';
import {
  DataExtractionNotificationMsg,
  fillMessageAttributesWithDefaults,
  MessageAttributes,
  MessageAttributesOptionals,
  MessageGroupUpdate,
  MessageModelType,
  PropsForDataExtractionNotification,
  PropsForMessageRequestResponse,
} from './messageType';

import { Data } from '../data/data';
import { OpenGroupData } from '../data/opengroups';
import { SettingsKey } from '../data/settings-key';
import { isUsAnySogsFromCache } from '../session/apis/open_group_api/sogsv3/knownBlindedkeys';
import { GetNetworkTime } from '../session/apis/snode_api/getNetworkTime';
import { SnodeNamespaces } from '../session/apis/snode_api/namespaces';
import { OpenGroupVisibleMessage } from '../session/messages/outgoing/visibleMessage/OpenGroupVisibleMessage';
import {
  VisibleMessage,
  VisibleMessageParams,
} from '../session/messages/outgoing/visibleMessage/VisibleMessage';
import {
  uploadAttachmentsV3,
  uploadLinkPreviewsV3,
  uploadQuoteThumbnailsV3,
} from '../session/utils/AttachmentsV2';
import { perfEnd, perfStart } from '../session/utils/Performance';
import { buildSyncMessage } from '../session/utils/sync/syncUtils';
import { isUsFromCache } from '../session/utils/User';
import { AttachmentTypeWithPath, isVoiceMessage } from '../types/Attachment';
import { getAttachmentMetadata } from '../types/message/initializeAttachmentMetadata';
import {
  deleteExternalMessageFiles,
  getAbsoluteAttachmentPath,
  loadAttachmentData,
  loadPreviewData,
  loadQuoteData,
} from '../types/MessageAttachment';
import { ReactionList } from '../types/Reaction';
import { roomHasBlindEnabled } from '../types/sqlSharedTypes';
import { ExpirationTimerOptions } from '../util/expiringMessages';
import { LinkPreviews } from '../util/linkPreviews';
import { Storage } from '../util/storage';
import { ConversationModel } from './conversation';
import { READ_MESSAGE_STATE } from './conversationAttributes';
import { console } from '../sessionjs-logger';

/**
 * @returns true if the array contains only a single item being 'You', 'you' or our device pubkey
 */
export function arrayContainsUsOnly(arrayToCheck: Array<string> | undefined) {
  return (
    arrayToCheck &&
    arrayToCheck.length === 1 &&
    (arrayToCheck[0] === UserUtils.getOurPubKeyStrFromCache() ||
      arrayToCheck[0].toLowerCase() === 'you')
  );
}

export function arrayContainsOneItemOnly(arrayToCheck: Array<string> | undefined) {
  return arrayToCheck && arrayToCheck.length === 1;
}

export class MessageModel extends Backbone.Model<MessageAttributes> {
  constructor(attributes: MessageAttributesOptionals & { skipTimerInit?: boolean }) {
    const filledAttrs = fillMessageAttributesWithDefaults(attributes);
    super(filledAttrs);

    if (!this.id) {
      throw new Error('A message always needs to have an id.');
    }
    if (!this.get('conversationId')) {
      throw new Error('A message always needs to have an conversationId.');
    }

    if (!attributes.skipTimerInit) {
      void this.setToExpire();
    }
    autoBind(this);

    this.getMessageModelProps();
  }

  public getMessageModelProps(): any {
    perfStart(`getPropsMessage-${this.id}`);
    const propsForDataExtractionNotification = this.getPropsForDataExtractionNotification();
    const propsForGroupInvitation = this.getPropsForGroupInvitation();
    const propsForGroupUpdateMessage = this.getPropsForGroupUpdateMessage();
    const propsForTimerNotification = this.getPropsForTimerNotification();
    const propsForMessageRequestResponse = this.getPropsForMessageRequestResponse();
    const propsForQuote = this.getPropsForQuote();
    const callNotificationType = this.get('callNotificationType');
    const messageProps: any = {
      propsForMessage: this.getPropsForMessage(),
    };
    if (propsForDataExtractionNotification) {
      messageProps.propsForDataExtractionNotification = propsForDataExtractionNotification;
    }
    if (propsForMessageRequestResponse) {
      messageProps.propsForMessageRequestResponse = propsForMessageRequestResponse;
    }
    if (propsForGroupInvitation) {
      messageProps.propsForGroupInvitation = propsForGroupInvitation;
    }
    if (propsForGroupUpdateMessage) {
      messageProps.propsForGroupUpdateMessage = propsForGroupUpdateMessage;
    }
    if (propsForTimerNotification) {
      messageProps.propsForTimerNotification = propsForTimerNotification;
    }
    if (propsForQuote) {
      messageProps.propsForQuote = propsForQuote;
    }

    if (callNotificationType) {
      messageProps.propsForCallNotification = {
        notificationType: callNotificationType,
        messageId: this.id,
        receivedAt: this.get('received_at') || Date.now(),
        isUnread: this.isUnread(),
      };
    }
    perfEnd(`getPropsMessage-${this.id}`, 'getPropsMessage');
    return messageProps;
  }

  public idForLogging() {
    return `${this.get('source')} ${this.get('sent_at')}`;
  }

  public isExpirationTimerUpdate() {
    const expirationTimerFlag = SignalService.DataMessage.Flags.EXPIRATION_TIMER_UPDATE;
    const flags = this.get('flags') || 0;
    const expirationTimerUpdate = this.get('expirationTimerUpdate');

    // eslint-disable-next-line no-bitwise
    return Boolean(flags & expirationTimerFlag) || !isEmpty(expirationTimerUpdate);
  }

  public isIncoming() {
    return this.get('type') === 'incoming';
  }

  public isUnread() {
    return !!this.get('unread');
  }

  // Important to allow for this.set({ unread}), save to db, then fetch()
  // to propagate. We don't want the unset key in the db so our unread index
  // stays small.
  public merge(model: any) {
    const attributes = model.attributes || model;

    const { unread } = attributes;
    if (unread === undefined) {
      this.set({ unread: READ_MESSAGE_STATE.read });
    }

    this.set(attributes);
  }

  public isGroupInvitation() {
    return !!this.get('groupInvitation');
  }

  public isMessageRequestResponse() {
    return !!this.get('messageRequestResponse');
  }

  public isDataExtractionNotification() {
    return !!this.get('dataExtractionNotification');
  }

  public getNotificationText() {
    let description = this.getDescription();
    if (description) {
      // regex with a 'g' to ignore part groups
      const regex = new RegExp(`@${PubKey.regexForPubkeys}`, 'g');
      // @ts-ignore
      const pubkeysInDesc = description.match(regex);
      (pubkeysInDesc || []).forEach((pubkeyWithAt: string) => {
        const pubkey = pubkeyWithAt.slice(1);
        const isUS = isUsAnySogsFromCache(pubkey);
        const displayName = getConversationController().getContactProfileNameOrShortenedPubKey(
          pubkey
        );
        if (isUS) {
          // @ts-ignore
          description = description?.replace(pubkeyWithAt, `@${('you')}`);
        } else if (displayName && displayName.length) {
          // @ts-ignore
          description = description?.replace(pubkeyWithAt, `@${displayName}`);
        }
      });
      return description;
    }
    if ((this.get('attachments') || []).length > 0) {
      return ('mediaMessage');
    }
    if (this.isExpirationTimerUpdate()) {
      const expireTimerUpdate = this.get('expirationTimerUpdate');
      if (!expireTimerUpdate || !expireTimerUpdate.expireTimer) {
        return ('disappearingMessagesDisabled');
      }

      return 'timerSetTo';
    }

    return '';
  }

  public onDestroy() {
    void this.cleanup();
  }

  public async cleanup() {
    await deleteExternalMessageFiles(this.attributes);
  }

  public getPropsForTimerNotification(): any | null {
    if (!this.isExpirationTimerUpdate()) {
      return null;
    }
    const timerUpdate = this.get('expirationTimerUpdate');
    if (!timerUpdate || !timerUpdate.source) {
      return null;
    }

    const { expireTimer, fromSync, source } = timerUpdate;
    const timespan = ExpirationTimerOptions.getName(expireTimer || 0);
    const disabled = !expireTimer;

    const basicProps: any = {
      ...findAndFormatContact(source),
      timespan,
      disabled,
      type: fromSync ? 'fromSync' : UserUtils.isUsFromCache(source) ? 'fromMe' : 'fromOther',
      messageId: this.id,
      receivedAt: this.get('received_at'),
      isUnread: this.isUnread(),
    };

    return basicProps;
  }

  public getPropsForGroupInvitation(): any | null {
    if (!this.isGroupInvitation()) {
      return null;
    }
    const invitation = this.get('groupInvitation');

    let direction = this.get('direction');
    if (!direction) {
      direction = this.get('type') === 'outgoing' ? 'outgoing' : 'incoming';
    }

    let serverAddress = '';
    try {
      const url = new URL(invitation.url);
      serverAddress = url.origin;
    } catch (e) {
      console.warn('failed to get hostname from opengroupv2 invitation', invitation);
    }

    return {
      serverName: invitation.name,
      url: serverAddress,
      direction,
      acceptUrl: invitation.url,
      messageId: this.id as string,
      receivedAt: this.get('received_at'),
      isUnread: this.isUnread(),
    };
  }

  public getPropsForDataExtractionNotification(): PropsForDataExtractionNotification | null {
    if (!this.isDataExtractionNotification()) {
      return null;
    }
    const dataExtractionNotification = this.get('dataExtractionNotification');

    if (!dataExtractionNotification) {
      console.warn('dataExtractionNotification should not happen');
      return null;
    }

    const contact = findAndFormatContact(dataExtractionNotification.source);

    return {
      ...dataExtractionNotification,
      name: contact.profileName || contact.name || dataExtractionNotification.source,
      messageId: this.id,
      receivedAt: this.get('received_at'),
      isUnread: this.isUnread(),
    };
  }

  public getPropsForMessageRequestResponse(): PropsForMessageRequestResponse | null {
    if (!this.isMessageRequestResponse()) {
      return null;
    }
    const messageRequestResponse = this.get('messageRequestResponse');

    if (!messageRequestResponse) {
      console.warn('messageRequestResponse should not happen');
      return null;
    }

    const contact = findAndFormatContact(messageRequestResponse.source);

    return {
      ...messageRequestResponse,
      name: contact.profileName || contact.name || messageRequestResponse.source,
      messageId: this.id,
      receivedAt: this.get('received_at'),
      isUnread: this.isUnread(),
      conversationId: this.get('conversationId'),
      source: this.get('source'),
    };
  }

  public getPropsForGroupUpdateMessage(): any | null {
    const groupUpdate = this.getGroupUpdateAsArray();

    if (!groupUpdate || isEmpty(groupUpdate)) {
      return null;
    }

    const sharedProps = {
      messageId: this.id,
      isUnread: this.isUnread(),
      receivedAt: this.get('received_at'),
    };

    if (groupUpdate.joined?.length) {
      const change: any = {
        type: 'add',
        added: groupUpdate.joined,
      };
      return { change, ...sharedProps };
    }

    if (groupUpdate.kicked?.length) {
      const change: any = {
        type: 'kicked',
        kicked: groupUpdate.kicked,
      };
      return { change, ...sharedProps };
    }

    if (groupUpdate.left?.length) {
      const change: any = {
        type: 'left',
        left: groupUpdate.left,
      };
      return { change, ...sharedProps };
    }

    if (groupUpdate.name) {
      const change: any = {
        type: 'name',
        newName: groupUpdate.name,
      };
      return { change, ...sharedProps };
    }

    // Just show a "Group Updated" message, not sure what was changed
    const changeGeneral: any = {
      type: 'general',
    };
    return { change: changeGeneral, ...sharedProps };
  }

  public getMessagePropStatus(): any {
    if (this.hasErrors()) {
      return 'error';
    }

    // Only return the status on outgoing messages
    if (!this.isOutgoing()) {
      return undefined;
    }

    if (this.isDataExtractionNotification() || this.get('callNotificationType')) {
      return undefined;
    }

    if (this.getConversation()?.get('left')) {
      return 'sent';
    }

    const readBy = this.get('read_by') || [];
    if (Storage.get(SettingsKey.settingsReadReceipt) && readBy.length > 0) {
      return 'read';
    }
    const sent = this.get('sent');
    // control messages we've sent, synced from the network appear to just have the
    // sent_at field set, but our current devices also have this field set when we are just sending it... So idk how to have behavior work fine.,
    // TODOLATER
    // const sentAt = this.get('sent_at');
    const sentTo = this.get('sent_to') || [];

    if (sent || sentTo.length > 0) {
      return 'sent';
    }

    return 'sending';
  }

  public getPropsForMessage(): any {
    const sender = this.getSource();
    const expirationLength = this.get('expireTimer') * 1000;
    const expireTimerStart = this.get('expirationStartTimestamp');
    const expirationTimestamp =
      expirationLength && expireTimerStart ? expireTimerStart + expirationLength : null;

    const attachments = this.get('attachments') || [];
    const isTrustedForAttachmentDownload = this.isTrustedForAttachmentDownload();
    const body = this.get('body');
    const props: any = {
      id: this.id,
      direction: (this.isIncoming() ? 'incoming' : 'outgoing') as MessageModelType,
      timestamp: this.get('sent_at') || 0,
      sender,
      convoId: this.get('conversationId'),
    };
    if (body) {
      props.text = body;
    }
    if (this.get('isDeleted')) {
      props.isDeleted = this.get('isDeleted');
    }

    if (this.get('messageHash')) {
      props.messageHash = this.get('messageHash');
    }
    if (this.get('received_at')) {
      props.receivedAt = this.get('received_at');
    }
    if (this.get('serverTimestamp')) {
      props.serverTimestamp = this.get('serverTimestamp');
    }
    if (this.get('serverId')) {
      props.serverId = this.get('serverId');
    }
    if (expirationLength) {
      props.expirationLength = expirationLength;
    }
    if (expirationTimestamp) {
      props.expirationTimestamp = expirationTimestamp;
    }
    if (isTrustedForAttachmentDownload) {
      props.isTrustedForAttachmentDownload = isTrustedForAttachmentDownload;
    }
    const isUnread = this.isUnread();
    if (isUnread) {
      props.isUnread = isUnread;
    }
    const isExpired = this.isExpired();
    if (isExpired) {
      props.isExpired = isExpired;
    }
    const previews = this.getPropsForPreview();
    if (previews && previews.length) {
      props.previews = previews;
    }
    const reacts = this.getPropsForReacts();
    if (reacts && Object.keys(reacts).length) {
      props.reacts = reacts;
    }
    const quote = this.getPropsForQuote();
    if (quote) {
      props.quote = quote;
    }
    const status = this.getMessagePropStatus();
    if (status) {
      props.status = status;
    }

    const attachmentsProps = attachments.map(this.getPropsForAttachment);
    if (attachmentsProps && attachmentsProps.length) {
      props.attachments = attachmentsProps;
    }

    return props;
  }

  public getPropsForPreview(): Array<any> | null {
    const previews = this.get('preview') || null;

    if (!previews || previews.length === 0) {
      return null;
    }

    return previews.map((preview: any) => {
      let image: any | null = null;
      try {
        if (preview.image) {
          image = this.getPropsForAttachment(preview.image);
        }
      } catch (e) {
        console.info('Failed to show preview');
      }

      return {
        ...preview,
        domain: LinkPreviews.getDomain(preview.url),
        image,
      };
    });
  }

  public getPropsForReacts(): ReactionList | null {
    return this.get('reacts') || null;
  }

  public getPropsForQuote(): any | null {
    return this.get('quote') || null;
  }

  public getPropsForAttachment(attachment: AttachmentTypeWithPath): any | null {
    if (!attachment) {
      return null;
    }

    const {
      id,
      path,
      contentType,
      width,
      height,
      pending,
      flags,
      size,
      screenshot,
      thumbnail,
      fileName,
      caption,
    } = attachment;

    const isVoiceMessageBool =
      // eslint-disable-next-line no-bitwise
      Boolean(flags && flags & SignalService.AttachmentPointer.Flags.VOICE_MESSAGE) || false;

    return {
      id,
      contentType,
      caption,
      size: size || 0,
      width: width || 0,
      height: height || 0,
      path,
      fileName,
      fileSize: size ? filesize(size, { base: 10 }) : null,
      isVoiceMessage: isVoiceMessageBool,
      pending: Boolean(pending),
      url: path ? getAbsoluteAttachmentPath(path) : '',
      screenshot: screenshot
        ? {
            ...screenshot,
            url: getAbsoluteAttachmentPath(screenshot.path),
          }
        : null,
      thumbnail: thumbnail
        ? {
            ...thumbnail,
            url: getAbsoluteAttachmentPath(thumbnail.path),
          }
        : null,
    };
  }

  public async getPropsForMessageDetail(): Promise<any> {
    // We include numbers we didn't successfully send to so we can display errors.
    // Older messages don't have the recipients included on the message, so we fall
    //   back to the conversation's current recipients
    const contacts: Array<string> = this.isIncoming()
      ? [this.get('source')]
      : this.get('sent_to') || [];

    // This will make the error message for outgoing key errors a bit nicer
    const allErrors = (this.get('errors') || []).map((error: any) => {
      return error;
    });

    // If an error has a specific number it's associated with, we'll show it next to
    //   that contact. Otherwise, it will be a standalone entry.
    const errors = reject(allErrors, error => Boolean(error.number));
    const errorsGroupedById = groupBy(allErrors, 'number');
    const finalContacts = await Promise.all(
      (contacts || []).map(async id => {
        const errorsForContact = errorsGroupedById[id];

        const contact = findAndFormatContact(id);
        return {
          ...contact,
          status: this.getMessagePropStatus(),
          errors: errorsForContact,
          profileName: contact.profileName,
        };
      })
    );

    // sort by pubkey
    const sortedContacts = sortBy(finalContacts, contact => contact.pubkey);

    const toRet: any = {
      sentAt: this.get('sent_at') || 0,
      receivedAt: this.get('received_at') || 0,
      convoId: this.get('conversationId'),
      messageId: this.get('id'),
      errors,
      direction: this.get('direction'),
      contacts: sortedContacts || [],
    };

    return toRet;
  }

  /**
   * Uploads attachments, previews and quotes.
   *
   * @returns The uploaded data which includes: body, attachments, preview and quote.
   * Also returns the uploaded ids to include in the message post so that those attachments are linked to that message.
   */
  public async uploadData() {
    const finalAttachments = await Promise.all(
      (this.get('attachments') || []).map(loadAttachmentData)
    );
    const body = this.get('body');

    const quoteWithData = await loadQuoteData(this.get('quote'));
    const previewWithData = await loadPreviewData(this.get('preview'));

    const { hasAttachments, hasVisualMediaAttachments, hasFileAttachments } = getAttachmentMetadata(
      this
    );
    this.set({ hasAttachments, hasVisualMediaAttachments, hasFileAttachments });
    await this.commit();

    const conversation = this.getConversation();

    let attachmentPromise;
    let linkPreviewPromise;
    let quotePromise;
    const fileIdsToLink: Array<number> = [];

    // we can only send a single preview
    const firstPreviewWithData = previewWithData?.[0] || null;

    // we want to go for the v1, if this is an OpenGroupV1 or not an open group at all
    if (conversation?.isPublic()) {
      const openGroupV2 = conversation.toOpenGroupV2();
      attachmentPromise = uploadAttachmentsV3(finalAttachments, openGroupV2);
      linkPreviewPromise = uploadLinkPreviewsV3(firstPreviewWithData, openGroupV2);
      quotePromise = uploadQuoteThumbnailsV3(openGroupV2, quoteWithData);
    } else {
      // if that's not an sogs, the file is uploaded to the fileserver instead
      attachmentPromise = uploadAttachmentsToFileServer(finalAttachments);
      linkPreviewPromise = uploadLinkPreviewToFileServer(firstPreviewWithData);
      quotePromise = uploadQuoteThumbnailsToFileServer(quoteWithData);
    }

    const [attachments, preview, quote] = await Promise.all([
      attachmentPromise,
      linkPreviewPromise,
      quotePromise,
    ]);
    fileIdsToLink.push(...attachments.map(m => m.id));
    if (preview) {
      fileIdsToLink.push(preview.id);
    }

    if (quote && quote.attachments?.length) {
      // typing for all of this Attachment + quote + preview + send or unsend is pretty bad
      const firstQuoteAttachmentId = (quote.attachments[0].thumbnail as any)?.id;
      if (firstQuoteAttachmentId) {
        fileIdsToLink.push(firstQuoteAttachmentId);
      }
    }

    const isFirstAttachmentVoiceMessage = finalAttachments?.[0]?.isVoiceMessage;
    if (isFirstAttachmentVoiceMessage) {
      attachments[0].flags = SignalService.AttachmentPointer.Flags.VOICE_MESSAGE;
    }

    console.info(`Upload of message data for message ${this.idForLogging()} is finished.`);
    return {
      body,
      attachments,
      preview,
      quote,
      fileIdsToLink: uniq(fileIdsToLink),
    };
  }

  /**
   * Marks the message as deleted to show the author has deleted this message for everyone.
   * Sets isDeleted property to true. Set message body text to deletion placeholder for conversation list items.
   */
  public async markAsDeleted() {
    this.set({
      isDeleted: true,
      body: ('messageDeletedPlaceholder'),
      quote: undefined,
      groupInvitation: undefined,
      dataExtractionNotification: undefined,
      hasAttachments: 0,
      hasFileAttachments: 0,
      hasVisualMediaAttachments: 0,
      attachments: undefined,
      preview: undefined,
      reacts: undefined,
      reactsIndex: undefined,
    });
    await this.markMessageAsRead(Date.now());
    await this.commit();
  }

  // One caller today: event handler for the 'Retry Send' entry on right click of a failed send message
  public async retrySend() {

    this.set({ errors: null, sent: false, sent_to: [] });
    await this.commit();
    try {
      const conversation: ConversationModel | undefined = this.getConversation();
      if (!conversation) {
        console.info(
          'cannot retry send message, the corresponding conversation was not found.'
        );
        return null;
      }
      const { body, attachments, preview, quote, fileIdsToLink } = await this.uploadData();

      if (conversation.isPublic()) {
        const openGroupParams: VisibleMessageParams = {
          identifier: this.id,
          timestamp: GetNetworkTime.getNowWithNetworkOffset(),
          lokiProfile: UserUtils.getOurProfile(),
          body,
          attachments,
          preview: preview ? [preview] : [],
          quote,
        };
        const roomInfos = OpenGroupData.getV2OpenGroupRoom(conversation.id);
        if (!roomInfos) {
          throw new Error('Could not find roomInfos for this conversation');
        }

        const openGroupMessage = new OpenGroupVisibleMessage(openGroupParams);
        const openGroup = OpenGroupData.getV2OpenGroupRoom(conversation.id);

        return getMessageQueue().sendToOpenGroupV2({
          message: openGroupMessage,
          roomInfos,
          blinded: roomHasBlindEnabled(openGroup),
          filesToLink: fileIdsToLink,
        });
      }

      const chatParams = {
        identifier: this.id,
        body,
        timestamp: Date.now(), // force a new timestamp to handle user fixed his clock
        expireTimer: this.get('expireTimer'),
        attachments,
        preview: preview ? [preview] : [],
        reacts: this.get('reacts'),
        quote,
        lokiProfile: UserUtils.getOurProfile(),
      };
      if (!chatParams.lokiProfile) {
        delete chatParams.lokiProfile;
      }

      const chatMessage = new VisibleMessage(chatParams);

      // Special-case the self-send case - we send only a sync message
      if (conversation.isMe()) {
        return this.sendSyncMessageOnly(chatMessage);
      }

      if (conversation.isPrivate()) {
        return getMessageQueue().sendToPubKey(
          PubKey.cast(conversation.id),
          chatMessage,
          SnodeNamespaces.UserMessages
        );
      }

      // Here, the convo is neither an open group, a private convo or ourself. It can only be a closed group.
      // For a closed group, retry send only means trigger a send again to all recipients
      // as they are all polling from the same group swarm pubkey
      if (!conversation.isClosedGroup()) {
        throw new Error(
          'We should only end up with a closed group here. Anything else is an error'
        );
      }

      const closedGroupVisibleMessage = new ClosedGroupVisibleMessage({
        identifier: this.id,
        chatMessage,
        groupId: this.get('conversationId'),
      });

      return getMessageQueue().sendToGroup({
        message: closedGroupVisibleMessage,
        namespace: SnodeNamespaces.ClosedGroupMessage,
      });
    } catch (e) {
      await this.saveErrors(e);
      return null;
    }
  }

  public removeOutgoingErrors(number: string) {
    const errors = partition(
      this.get('errors'),
      e => e.number === number && e.name === 'SendMessageNetworkError'
    );
    this.set({ errors: errors[1] });
    return errors[0][0];
  }

  public getConversation(): ConversationModel | undefined {
    // This needs to be an unsafe call, because this method is called during
    //   initial module setup. We may be in the middle of the initial fetch to
    //   the database.
    return getConversationController().getUnsafe(this.get('conversationId'));
  }

  public getQuoteContact() {
    const quote = this.get('quote');
    if (!quote) {
      return null;
    }
    const { author } = quote;
    if (!author) {
      return null;
    }

    return getConversationController().get(author);
  }

  public getSource() {
    if (this.isIncoming()) {
      return this.get('source');
    }

    return UserUtils.getOurPubKeyStrFromCache();
  }

  public isOutgoing() {
    return this.get('type') === 'outgoing';
  }

  public hasErrors() {
    return lodashSize(this.get('errors')) > 0;
  }

  public async updateMessageHash(messageHash: string) {
    if (!messageHash) {
      console.error('Message hash not provided to update message hash');
    }
    this.set({
      messageHash,
    });

    await this.commit();
  }

  public async sendSyncMessageOnly(dataMessage: DataMessage) {
    const now = Date.now();
    this.set({
      sent_to: [UserUtils.getOurPubKeyStrFromCache()],
      sent: true,
      expirationStartTimestamp: now,
    });

    await this.commit();

    const data = dataMessage instanceof DataMessage ? dataMessage.dataProto() : dataMessage;
    await this.sendSyncMessage(data, now);
  }

  public async sendSyncMessage(dataMessage: SignalService.DataMessage, sentTimestamp: number) {
    if (this.get('synced') || this.get('sentSync')) {
      return;
    }

    // if this message needs to be synced
    if (
      dataMessage.body?.length ||
      dataMessage.attachments.length ||
      dataMessage.flags === SignalService.DataMessage.Flags.EXPIRATION_TIMER_UPDATE
    ) {
      const conversation = this.getConversation();
      if (!conversation) {
        throw new Error('Cannot trigger syncMessage with unknown convo.');
      }
      const syncMessage = buildSyncMessage(this.id, dataMessage, conversation.id, sentTimestamp);
      await getMessageQueue().sendSyncMessage({
        namespace: SnodeNamespaces.UserMessages,
        message: syncMessage,
      });
    }
    this.set({ sentSync: true });
    await this.commit();
  }

  public async saveErrors(providedErrors: any) {
    let errors = providedErrors;

    if (!(errors instanceof Array)) {
      errors = [errors];
    }
    errors.forEach((e: any) => {
      console.error(
        'Message.saveErrors:',
        e && e.reason ? e.reason : null,
        e && e.stack ? e.stack : e
      );
    });
    errors = errors.map((e: any) => {
      if (
        e.constructor === Error ||
        e.constructor === TypeError ||
        e.constructor === ReferenceError
      ) {
        return pick(e, 'name', 'message', 'code', 'number', 'reason');
      }
      return e;
    });
    errors = errors.concat(this.get('errors') || []);

    this.set({ errors });
    await this.commit();
  }

  public async commit(triggerUIUpdate = true) {
    if (!this.id) {
      throw new Error('A message always needs an id');
    }

    perfStart(`messageCommit-${this.id}`);
    // because the saving to db calls _cleanData which mutates the field for cleaning, we need to save a copy
    const id = await Data.saveMessage(cloneDeep(this.attributes));
    if (triggerUIUpdate) {
      this.dispatchMessageUpdate();
    }
    perfEnd(`messageCommit-${this.id}`, 'messageCommit');

    return id;
  }

  public async markMessageAsRead(readAt: number) {
    this.markMessageReadNoCommit(readAt);
    await this.commit();
    // the line below makes sure that getNextExpiringMessage will find this message as expiring.
    // getNextExpiringMessage is used on app start to clean already expired messages which should have been removed already, but are not
    await this.setToExpire();

    await this.getConversation()?.refreshInMemoryDetails();
  }

  public markMessageReadNoCommit(readAt: number) {
    this.set({ unread: READ_MESSAGE_STATE.read });

    if (
      this.get('expireTimer') &&
      !this.get('expirationStartTimestamp') &&
      !this.get('expires_at')
    ) {
      const expirationStartTimestamp = Math.min(Date.now(), readAt || Date.now());
      this.set({ expirationStartTimestamp });
      const start = this.get('expirationStartTimestamp');
      const delta = this.get('expireTimer') * 1000;
      if (!start) {
        return;
      }
      const expiresAt = start + delta;
      // based on `setToExpire()`
      this.set({ expires_at: expiresAt });
    }
  }

  public isExpiring() {
    return this.get('expireTimer') && this.get('expirationStartTimestamp');
  }

  public isExpired() {
    return this.msTilExpire() <= 0;
  }

  public msTilExpire() {
    if (!this.isExpiring()) {
      return Infinity;
    }
    const now = Date.now();
    const start = this.get('expirationStartTimestamp');
    if (!start) {
      return Infinity;
    }
    const delta = this.get('expireTimer') * 1000;
    let msFromNow = start + delta - now;
    if (msFromNow < 0) {
      msFromNow = 0;
    }
    return msFromNow;
  }

  public async setToExpire() {
    if (this.isExpiring() && !this.get('expires_at')) {
      const start = this.get('expirationStartTimestamp');
      const delta = this.get('expireTimer') * 1000;
      if (!start) {
        return;
      }
      const expiresAt = start + delta;

      this.set({ expires_at: expiresAt });
      const id = this.get('id');
      if (id) {
        await this.commit();
      }

      console.info('Set message expiration', {
        expiresAt,
        sentAt: this.get('sent_at'),
      });
    }
  }

  public isTrustedForAttachmentDownload() {
    try {
      const senderConvoId = this.getSource();
      const isClosedGroup = this.getConversation()?.isClosedGroup() || false;
      const isOpengroup = this.getConversation()?.isOpenGroupV2() || false;
      if (isOpengroup || isClosedGroup || isUsFromCache(senderConvoId)) {
        return true;
      }
      // check the convo from this user
      // we want the convo of the sender of this message
      const senderConvo = getConversationController().get(senderConvoId);
      if (!senderConvo) {
        return false;
      }
      return senderConvo.get('isTrustedForAttachmentDownload') || false;
    } catch (e) {
      console.warn('isTrustedForAttachmentDownload: error; ', e.message);
      return false;
    }
  }

  private dispatchMessageUpdate() {
    updatesToDispatch.set(this.id, this.getMessageModelProps());
    throttledAllMessagesDispatch();
  }

  /**
   * Before, group_update attributes could be just the string 'You' and not an array.
   * Using this method to get the group update makes sure than the joined, kicked, or left are always an array of string, or undefined
   */
  private getGroupUpdateAsArray() {
    const groupUpdate = this.get('group_update');
    if (!groupUpdate || isEmpty(groupUpdate)) {
      return undefined;
    }
    const left: Array<string> | undefined = Array.isArray(groupUpdate.left)
      ? groupUpdate.left
      : groupUpdate.left
      ? [groupUpdate.left]
      : undefined;
    const kicked: Array<string> | undefined = Array.isArray(groupUpdate.kicked)
      ? groupUpdate.kicked
      : groupUpdate.kicked
      ? [groupUpdate.kicked]
      : undefined;
    const joined: Array<string> | undefined = Array.isArray(groupUpdate.joined)
      ? groupUpdate.joined
      : groupUpdate.joined
      ? [groupUpdate.joined]
      : undefined;

    const forcedArrayUpdate: MessageGroupUpdate = {};

    if (left) {
      forcedArrayUpdate.left = left;
    }
    if (joined) {
      forcedArrayUpdate.joined = joined;
    }
    if (kicked) {
      forcedArrayUpdate.kicked = kicked;
    }
    if (groupUpdate.name) {
      forcedArrayUpdate.name = groupUpdate.name;
    }
    return forcedArrayUpdate;
  }

  private getDescription() {
    const groupUpdate = this.getGroupUpdateAsArray();
    if (groupUpdate) {
      if (arrayContainsUsOnly(groupUpdate.kicked)) {
        return ('youGotKickedFromGroup');
      }
      if (arrayContainsUsOnly(groupUpdate.left)) {
        return ('youLeftTheGroup');
      }

      if (groupUpdate.left && groupUpdate.left.length === 1) {
        return 'leftTheGroup';
      }

      const messages = [];
      if (!groupUpdate.name && !groupUpdate.joined && !groupUpdate.kicked && !groupUpdate.kicked) {
        return ('updatedTheGroup'); // Group Updated
      }
      if (groupUpdate.name) {
        return 'titleIsNow';
      }
      if (groupUpdate.joined && groupUpdate.joined.length) {
        const names = groupUpdate.joined.map(
          getConversationController().getContactProfileNameOrShortenedPubKey
        );

        if (names.length > 1) {
          messages.push('multipleJoinedTheGroup ' + names.join(', '));
        } else {
          messages.push('joinedTheGroup ' + names.join(', '));
        }
        return messages.join(' ');
      }

      if (groupUpdate.kicked && groupUpdate.kicked.length) {
        const names = map(
          groupUpdate.kicked,
          getConversationController().getContactProfileNameOrShortenedPubKey
        );

        if (names.length > 1) {
          messages.push('multipleKickedFromTheGroup');
        } else {
          messages.push('kickedFromTheGroup');
        }
      }
      return messages.join(' ');
    }
    if (this.isIncoming() && this.hasErrors()) {
      return ('incomingError');
    }
    if (this.isGroupInvitation()) {
      return `😎 ${('openGroupInvitation')}`;
    }

    if (this.isDataExtractionNotification()) {
      const dataExtraction = this.get(
        'dataExtractionNotification'
      ) as DataExtractionNotificationMsg;
      if (dataExtraction.type === SignalService.DataExtractionNotification.Type.SCREENSHOT) {
        return 'tookAScreenshot' + [
          getConversationController().getContactProfileNameOrShortenedPubKey(dataExtraction.source),
        ].join(', ');
      }

      return 'savedTheFile' + [
        getConversationController().getContactProfileNameOrShortenedPubKey(dataExtraction.source),
      ].join(', ');
    }
    if (this.get('callNotificationType')) {
      const displayName = getConversationController().getContactProfileNameOrShortenedPubKey(
        this.get('conversationId')
      );
      const callNotificationType = this.get('callNotificationType');
      if (callNotificationType === 'missed-call') {
        return 'callMissed '+ displayName;
      }
      if (callNotificationType === 'started-call') {
        return 'startedACall '+ displayName;
      }
      if (callNotificationType === 'answered-a-call') {
        return 'answeredACall '+ displayName;
      }
    }
    if (this.get('reaction')) {
      const reaction = this.get('reaction');
      if (reaction && reaction.emoji && reaction.emoji !== '') {
        return 'reactionNotification ' + reaction.emoji;
      }
    }
    return this.get('body');
  }
}

const throttledAllMessagesDispatch = debounce(
  () => {
    if (updatesToDispatch.size === 0) {
      return;
    }
    // window.inboxStore?.dispatch(messagesChanged([...updatesToDispatch.values()]));
    console.log('[SBOT/redux] messagesChanged')
    updatesToDispatch.clear();
  },
  500,
  { trailing: true, leading: true, maxWait: 1000 }
);

const updatesToDispatch: Map<string, any> = new Map();
export class MessageCollection extends Backbone.Collection<MessageModel> {}

MessageCollection.prototype.model = MessageModel;

export function findAndFormatContact(pubkey: string): any {
  const contactModel = getConversationController().get(pubkey);
  let profileName: string | null = null;
  let isMe = false;

  if (
    pubkey === UserUtils.getOurPubKeyStrFromCache() ||
    (pubkey && PubKey.isBlinded(pubkey) && isUsAnySogsFromCache(pubkey))
  ) {
    profileName = ('you');
    isMe = true;
  } else {
    profileName = contactModel?.getNicknameOrRealUsername() || null;
  }

  return {
    pubkey,
    avatarPath: contactModel ? contactModel.getAvatarPath() : null,
    name: contactModel?.getRealSessionUsername() || null,
    profileName,
    isMe,
  };
}

export function processQuoteAttachment(attachment: any) {
  const { thumbnail } = attachment;
  const path = thumbnail && thumbnail.path && getAbsoluteAttachmentPath(thumbnail.path);
  const objectUrl = thumbnail && thumbnail.objectUrl;

  const thumbnailWithObjectUrl =
    !path && !objectUrl ? null : { ...(attachment.thumbnail || {}), objectUrl: path || objectUrl };

  return {
    ...attachment,
    isVoiceMessage: isVoiceMessage(attachment),
    thumbnail: thumbnailWithObjectUrl,
  };
}
