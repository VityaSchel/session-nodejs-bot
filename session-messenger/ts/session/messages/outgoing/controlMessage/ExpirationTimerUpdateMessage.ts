import { DataMessage } from '..';
import { SignalService } from '../../../../protobuf';
import { PubKey } from '../../../types';
import { StringUtils } from '../../../utils';
import { MessageParams } from '../Message';

interface ExpirationTimerUpdateMessageParams extends MessageParams {
  groupId?: string | PubKey;
  syncTarget?: string | PubKey;
  expireTimer: number | null;
}

export class ExpirationTimerUpdateMessage extends DataMessage {
  public readonly groupId?: PubKey;
  public readonly syncTarget?: string;
  public readonly expireTimer: number | null;

  constructor(params: ExpirationTimerUpdateMessageParams) {
    super({ timestamp: params.timestamp, identifier: params.identifier });
    this.expireTimer = params.expireTimer;

    const { groupId, syncTarget } = params;
    this.groupId = groupId ? PubKey.cast(groupId) : undefined;
    this.syncTarget = syncTarget ? PubKey.cast(syncTarget).key : undefined;
  }

  public dataProto(): SignalService.DataMessage {
    const data = new SignalService.DataMessage();

    data.flags = SignalService.DataMessage.Flags.EXPIRATION_TIMER_UPDATE;

    // TODOLATER we won't need this once legacy groups are not supported anymore
    // the envelope stores the groupId for a closed group already.
    if (this.groupId) {
      const groupMessage = new SignalService.GroupContext();
      const groupIdWithPrefix = PubKey.addTextSecurePrefixIfNeeded(this.groupId.key);
      const encoded = StringUtils.encode(groupIdWithPrefix, 'utf8');
      const id = new Uint8Array(encoded);
      groupMessage.id = id;
      groupMessage.type = SignalService.GroupContext.Type.DELIVER;

      data.group = groupMessage;
    }

    if (this.syncTarget) {
      data.syncTarget = this.syncTarget;
    }

    if (this.expireTimer) {
      data.expireTimer = this.expireTimer;
    }

    return data;
  }
}
