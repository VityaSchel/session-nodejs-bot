export type LocalizerKeys =
  | 'ByUsingThisService...'
  | 'about'
  | 'accept'
  | 'activeMembers'
  | 'add'
  | 'addACaption'
  | 'addAsModerator'
  | 'addModerators'
  | 'addingContacts'
  | 'allUsersAreRandomly...'
  | 'anonymous'
  | 'answeredACall'
  | 'appMenuHide'
  | 'appMenuHideOthers'
  | 'appMenuQuit'
  | 'appMenuUnhide'
  | 'appearanceSettingsTitle'
  | 'areYouSureClearDevice'
  | 'areYouSureDeleteDeviceOnly'
  | 'areYouSureDeleteEntireAccount'
  | 'audio'
  | 'audioMessageAutoplayDescription'
  | 'audioMessageAutoplayTitle'
  | 'audioNotificationsSettingsTitle'
  | 'audioPermissionNeeded'
  | 'audioPermissionNeededTitle'
  | 'autoUpdateDownloadButtonLabel'
  | 'autoUpdateDownloadInstructions'
  | 'autoUpdateDownloadedMessage'
  | 'autoUpdateLaterButtonLabel'
  | 'autoUpdateNewVersionInstructions'
  | 'autoUpdateNewVersionMessage'
  | 'autoUpdateNewVersionTitle'
  | 'autoUpdateRestartButtonLabel'
  | 'autoUpdateSettingDescription'
  | 'autoUpdateSettingTitle'
  | 'banUser'
  | 'banUserAndDeleteAll'
  | 'beginYourSession'
  | 'blindedMsgReqsSettingDesc'
  | 'blindedMsgReqsSettingTitle'
  | 'block'
  | 'blocked'
  | 'blockedSettingsTitle'
  | 'callMediaPermissionsDescription'
  | 'callMediaPermissionsDialogContent'
  | 'callMediaPermissionsDialogTitle'
  | 'callMediaPermissionsTitle'
  | 'callMissed'
  | 'callMissedCausePermission'
  | 'callMissedNotApproved'
  | 'callMissedTitle'
  | 'cameraPermissionNeeded'
  | 'cameraPermissionNeededTitle'
  | 'cancel'
  | 'cannotMixImageAndNonImageAttachments'
  | 'cannotRemoveCreatorFromGroup'
  | 'cannotRemoveCreatorFromGroupDesc'
  | 'cannotUpdate'
  | 'cannotUpdateDetail'
  | 'changeAccountPasswordDescription'
  | 'changeAccountPasswordTitle'
  | 'changeNickname'
  | 'changeNicknameMessage'
  | 'changePassword'
  | 'changePasswordInvalid'
  | 'changePasswordTitle'
  | 'changePasswordToastDescription'
  | 'chooseAnAction'
  | 'classicDarkThemeTitle'
  | 'classicLightThemeTitle'
  | 'clear'
  | 'clearAll'
  | 'clearAllConfirmationBody'
  | 'clearAllConfirmationTitle'
  | 'clearAllData'
  | 'clearAllReactions'
  | 'clearDataSettingsTitle'
  | 'clearDevice'
  | 'clearNickname'
  | 'clickToTrustContact'
  | 'close'
  | 'closedGroupInviteFailMessage'
  | 'closedGroupInviteFailMessagePlural'
  | 'closedGroupInviteFailTitle'
  | 'closedGroupInviteFailTitlePlural'
  | 'closedGroupInviteOkText'
  | 'closedGroupInviteSuccessMessage'
  | 'closedGroupInviteSuccessTitle'
  | 'closedGroupInviteSuccessTitlePlural'
  | 'closedGroupMaxSize'
  | 'confirmNewPassword'
  | 'confirmPassword'
  | 'connectToServerFail'
  | 'connectToServerSuccess'
  | 'connectingToServer'
  | 'contactAvatarAlt'
  | 'contactsHeader'
  | 'contextMenuNoSuggestions'
  | 'continue'
  | 'continueYourSession'
  | 'conversationsHeader'
  | 'conversationsSettingsTitle'
  | 'copiedToClipboard'
  | 'copyErrorAndQuit'
  | 'copyMessage'
  | 'copyOpenGroupURL'
  | 'copySessionID'
  | 'couldntFindServerMatching'
  | 'create'
  | 'createAccount'
  | 'createClosedGroupNamePrompt'
  | 'createClosedGroupPlaceholder'
  | 'createConversationNewContact'
  | 'createConversationNewGroup'
  | 'createGroup'
  | 'createPassword'
  | 'createSessionID'
  | 'databaseError'
  | 'debugLog'
  | 'debugLogExplanation'
  | 'decline'
  | 'declineRequestMessage'
  | 'delete'
  | 'deleteAccountFromLogin'
  | 'deleteAccountWarning'
  | 'deleteContactConfirmation'
  | 'deleteConversation'
  | 'deleteConversationConfirmation'
  | 'deleteForEveryone'
  | 'deleteJustForMe'
  | 'deleteMessageQuestion'
  | 'deleteMessages'
  | 'deleteMessagesQuestion'
  | 'deleted'
  | 'destination'
  | 'device'
  | 'deviceOnly'
  | 'dialogClearAllDataDeletionFailedDesc'
  | 'dialogClearAllDataDeletionFailedMultiple'
  | 'dialogClearAllDataDeletionFailedTitle'
  | 'dialogClearAllDataDeletionFailedTitleQuestion'
  | 'dialogClearAllDataDeletionQuestion'
  | 'disabledDisappearingMessages'
  | 'disappearingMessages'
  | 'disappearingMessagesDisabled'
  | 'displayName'
  | 'displayNameEmpty'
  | 'displayNameTooLong'
  | 'document'
  | 'documents'
  | 'documentsEmptyState'
  | 'done'
  | 'downloadAttachment'
  | 'editGroup'
  | 'editGroupName'
  | 'editMenuCopy'
  | 'editMenuCut'
  | 'editMenuDeleteContact'
  | 'editMenuDeleteGroup'
  | 'editMenuPaste'
  | 'editMenuRedo'
  | 'editMenuSelectAll'
  | 'editMenuUndo'
  | 'editProfileModalTitle'
  | 'emptyGroupNameError'
  | 'enable'
  | 'endCall'
  | 'enterAnOpenGroupURL'
  | 'enterDisplayName'
  | 'enterKeySettingDescription'
  | 'enterKeySettingTitle'
  | 'enterNewLineDescription'
  | 'enterNewPassword'
  | 'enterPassword'
  | 'enterRecoveryPhrase'
  | 'enterSendNewMessageDescription'
  | 'enterSessionID'
  | 'enterSessionIDOfRecipient'
  | 'enterSessionIDOrONSName'
  | 'entireAccount'
  | 'error'
  | 'establishingConnection'
  | 'expandedReactionsText'
  | 'failedResolveOns'
  | 'failedToAddAsModerator'
  | 'failedToRemoveFromModerator'
  | 'faq'
  | 'fileSizeWarning'
  | 'from'
  | 'getStarted'
  | 'goToReleaseNotes'
  | 'goToSupportPage'
  | 'groupMembers'
  | 'groupNamePlaceholder'
  | 'helpSettingsTitle'
  | 'helpUsTranslateSession'
  | 'hideBanner'
  | 'hideMenuBarDescription'
  | 'hideMenuBarTitle'
  | 'hideRequestBanner'
  | 'hideRequestBannerDescription'
  | 'iAmSure'
  | 'image'
  | 'imageAttachmentAlt'
  | 'imageCaptionIconAlt'
  | 'incomingCallFrom'
  | 'incomingError'
  | 'invalidGroupNameTooLong'
  | 'invalidGroupNameTooShort'
  | 'invalidNumberError'
  | 'invalidOldPassword'
  | 'invalidOpenGroupUrl'
  | 'invalidPassword'
  | 'invalidPubkeyFormat'
  | 'invalidSessionId'
  | 'inviteContacts'
  | 'join'
  | 'joinACommunity'
  | 'joinOpenGroup'
  | 'joinOpenGroupAfterInvitationConfirmationDesc'
  | 'joinOpenGroupAfterInvitationConfirmationTitle'
  | 'joinedTheGroup'
  | 'keepDisabled'
  | 'kickedFromTheGroup'
  | 'learnMore'
  | 'leaveAndRemoveForEveryone'
  | 'leaveGroup'
  | 'leaveGroupConfirmation'
  | 'leaveGroupConfirmationAdmin'
  | 'leftTheGroup'
  | 'lightboxImageAlt'
  | 'linkDevice'
  | 'linkPreviewDescription'
  | 'linkPreviewsConfirmMessage'
  | 'linkPreviewsTitle'
  | 'linkVisitWarningMessage'
  | 'linkVisitWarningTitle'
  | 'loading'
  | 'mainMenuEdit'
  | 'mainMenuFile'
  | 'mainMenuHelp'
  | 'mainMenuView'
  | 'mainMenuWindow'
  | 'markAllAsRead'
  | 'markUnread'
  | 'maxPasswordAttempts'
  | 'maximumAttachments'
  | 'media'
  | 'mediaEmptyState'
  | 'mediaMessage'
  | 'mediaPermissionsDescription'
  | 'mediaPermissionsTitle'
  | 'members'
  | 'message'
  | 'messageBody'
  | 'messageBodyMissing'
  | 'messageDeletedPlaceholder'
  | 'messageDeletionForbidden'
  | 'messageRequestAccepted'
  | 'messageRequestAcceptedOurs'
  | 'messageRequestAcceptedOursNoName'
  | 'messageRequestPending'
  | 'messageRequests'
  | 'messagesHeader'
  | 'moreInformation'
  | 'multipleJoinedTheGroup'
  | 'multipleKickedFromTheGroup'
  | 'multipleLeftTheGroup'
  | 'mustBeApproved'
  | 'nameAndMessage'
  | 'nameOnly'
  | 'newMessage'
  | 'newMessages'
  | 'next'
  | 'nicknamePlaceholder'
  | 'noAudioInputFound'
  | 'noAudioOutputFound'
  | 'noBlockedContacts'
  | 'noCameraFound'
  | 'noContactsForGroup'
  | 'noContactsToAdd'
  | 'noGivenPassword'
  | 'noMediaUntilApproved'
  | 'noMembersInThisGroup'
  | 'noMessageRequestsPending'
  | 'noMessagesInBlindedDisabledMsgRequests'
  | 'noMessagesInEverythingElse'
  | 'noMessagesInNoteToSelf'
  | 'noMessagesInReadOnly'
  | 'noModeratorsToRemove'
  | 'noNameOrMessage'
  | 'noSearchResults'
  | 'noteToSelf'
  | 'notificationForConvo'
  | 'notificationForConvo_all'
  | 'notificationForConvo_disabled'
  | 'notificationForConvo_mentions_only'
  | 'notificationFrom'
  | 'notificationMostRecent'
  | 'notificationMostRecentFrom'
  | 'notificationPreview'
  | 'notificationSettingsDialog'
  | 'notificationSubtitle'
  | 'notificationsSettingsContent'
  | 'notificationsSettingsTitle'
  | 'oceanDarkThemeTitle'
  | 'oceanLightThemeTitle'
  | 'offline'
  | 'ok'
  | 'oneNonImageAtATimeToast'
  | 'onionPathIndicatorDescription'
  | 'onionPathIndicatorTitle'
  | 'onlyAdminCanRemoveMembers'
  | 'onlyAdminCanRemoveMembersDesc'
  | 'open'
  | 'openGroupInvitation'
  | 'openGroupURL'
  | 'openMessageRequestInbox'
  | 'openMessageRequestInboxDescription'
  | 'or'
  | 'orJoinOneOfThese'
  | 'originalMessageNotFound'
  | 'otherPlural'
  | 'otherSingular'
  | 'password'
  | 'passwordCharacterError'
  | 'passwordLengthError'
  | 'passwordTypeError'
  | 'passwordViewTitle'
  | 'passwordsDoNotMatch'
  | 'permissionsSettingsTitle'
  | 'photo'
  | 'pickClosedGroupMember'
  | 'pinConversation'
  | 'pleaseWaitOpenAndOptimizeDb'
  | 'previewThumbnail'
  | 'primaryColor'
  | 'primaryColorBlue'
  | 'primaryColorGreen'
  | 'primaryColorOrange'
  | 'primaryColorPink'
  | 'primaryColorPurple'
  | 'primaryColorRed'
  | 'primaryColorYellow'
  | 'privacySettingsTitle'
  | 'pruneSettingDescription'
  | 'pruneSettingTitle'
  | 'publicChatExists'
  | 'quoteThumbnailAlt'
  | 'rateLimitReactMessage'
  | 'reactionListCountPlural'
  | 'reactionListCountSingular'
  | 'reactionNotification'
  | 'reactionPopup'
  | 'reactionPopupMany'
  | 'reactionPopupOne'
  | 'reactionPopupThree'
  | 'reactionPopupTwo'
  | 'readReceiptSettingDescription'
  | 'readReceiptSettingTitle'
  | 'received'
  | 'recoveryPhrase'
  | 'recoveryPhraseEmpty'
  | 'recoveryPhraseRevealButtonText'
  | 'recoveryPhraseRevealMessage'
  | 'recoveryPhraseSavePromptMain'
  | 'recoveryPhraseSecureTitle'
  | 'remove'
  | 'removeAccountPasswordDescription'
  | 'removeAccountPasswordTitle'
  | 'removeFromModerators'
  | 'removeModerators'
  | 'removePassword'
  | 'removePasswordInvalid'
  | 'removePasswordTitle'
  | 'removePasswordToastDescription'
  | 'removeResidueMembers'
  | 'replyToMessage'
  | 'replyingToMessage'
  | 'reportIssue'
  | 'requestsPlaceholder'
  | 'requestsSubtitle'
  | 'resend'
  | 'respondingToRequestWarning'
  | 'restoreUsingRecoveryPhrase'
  | 'ringing'
  | 'save'
  | 'saveLogToDesktop'
  | 'saved'
  | 'savedTheFile'
  | 'searchFor...'
  | 'searchForContactsOnly'
  | 'searchMessagesHeader'
  | 'selectMessage'
  | 'sendFailed'
  | 'sendMessage'
  | 'sendRecoveryPhraseMessage'
  | 'sendRecoveryPhraseTitle'
  | 'sent'
  | 'sessionMessenger'
  | 'setAccountPasswordDescription'
  | 'setAccountPasswordTitle'
  | 'setDisplayPicture'
  | 'setPassword'
  | 'setPasswordFail'
  | 'setPasswordInvalid'
  | 'setPasswordTitle'
  | 'setPasswordToastDescription'
  | 'settingsHeader'
  | 'shareBugDetails'
  | 'show'
  | 'showDebugLog'
  | 'showRecoveryPhrase'
  | 'showRecoveryPhrasePasswordRequest'
  | 'showUserDetails'
  | 'someOfYourDeviceUseOutdatedVersion'
  | 'spellCheckDescription'
  | 'spellCheckDirty'
  | 'spellCheckTitle'
  | 'stagedImageAttachment'
  | 'stagedPreviewThumbnail'
  | 'startConversation'
  | 'startInTrayDescription'
  | 'startInTrayTitle'
  | 'startNewConversationBy...'
  | 'startedACall'
  | 'support'
  | 'surveyTitle'
  | 'themesSettingTitle'
  | 'theyChangedTheTimer'
  | 'thisMonth'
  | 'thisWeek'
  | 'timerOption_0_seconds'
  | 'timerOption_0_seconds_abbreviated'
  | 'timerOption_10_seconds'
  | 'timerOption_10_seconds_abbreviated'
  | 'timerOption_12_hours'
  | 'timerOption_12_hours_abbreviated'
  | 'timerOption_1_day'
  | 'timerOption_1_day_abbreviated'
  | 'timerOption_1_hour'
  | 'timerOption_1_hour_abbreviated'
  | 'timerOption_1_minute'
  | 'timerOption_1_minute_abbreviated'
  | 'timerOption_1_week'
  | 'timerOption_1_week_abbreviated'
  | 'timerOption_2_weeks'
  | 'timerOption_2_weeks_abbreviated'
  | 'timerOption_30_minutes'
  | 'timerOption_30_minutes_abbreviated'
  | 'timerOption_30_seconds'
  | 'timerOption_30_seconds_abbreviated'
  | 'timerOption_5_minutes'
  | 'timerOption_5_minutes_abbreviated'
  | 'timerOption_5_seconds'
  | 'timerOption_5_seconds_abbreviated'
  | 'timerOption_6_hours'
  | 'timerOption_6_hours_abbreviated'
  | 'timerSetOnSync'
  | 'timerSetTo'
  | 'titleIsNow'
  | 'to'
  | 'today'
  | 'tookAScreenshot'
  | 'trimDatabase'
  | 'trimDatabaseConfirmationBody'
  | 'trimDatabaseDescription'
  | 'trustThisContactDialogDescription'
  | 'trustThisContactDialogTitle'
  | 'tryAgain'
  | 'typeInOldPassword'
  | 'typingAlt'
  | 'typingIndicatorsSettingDescription'
  | 'typingIndicatorsSettingTitle'
  | 'unableToCall'
  | 'unableToCallTitle'
  | 'unableToLoadAttachment'
  | 'unbanUser'
  | 'unblock'
  | 'unblockToSend'
  | 'unblocked'
  | 'unknown'
  | 'unknownCountry'
  | 'unpinConversation'
  | 'unreadMessages'
  | 'updateGroupDialogTitle'
  | 'updatedTheGroup'
  | 'userAddedToModerators'
  | 'userBanFailed'
  | 'userBanned'
  | 'userRemovedFromModerators'
  | 'userUnbanFailed'
  | 'userUnbanned'
  | 'video'
  | 'videoAttachmentAlt'
  | 'viewMenuResetZoom'
  | 'viewMenuToggleDevTools'
  | 'viewMenuToggleFullScreen'
  | 'viewMenuZoomIn'
  | 'viewMenuZoomOut'
  | 'voiceMessage'
  | 'welcomeToYourSession'
  | 'windowMenuClose'
  | 'windowMenuMinimize'
  | 'windowMenuZoom'
  | 'yesterday'
  | 'you'
  | 'youChangedTheTimer'
  | 'youDisabledDisappearingMessages'
  | 'youGotKickedFromGroup'
  | 'youHaveANewFriendRequest'
  | 'youLeftTheGroup'
  | 'yourSessionID'
  | 'yourUniqueSessionID'
  | 'zoomFactorSettingTitle';
