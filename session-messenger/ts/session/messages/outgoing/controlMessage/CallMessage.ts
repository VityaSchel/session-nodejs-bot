import { SignalService } from '../../../../protobuf';
import { MessageParams } from '../Message';
import { ContentMessage } from '..';
import { signalservice } from '../../../../protobuf/compiled';
import { TTL_DEFAULT } from '../../../constants';

interface CallMessageParams extends MessageParams {
  type: SignalService.CallMessage.Type;
  sdpMLineIndexes?: Array<number>;
  sdpMids?: Array<string>;
  sdps?: Array<string>;
  uuid: string;
}

export class CallMessage extends ContentMessage {
  public readonly type: signalservice.CallMessage.Type;
  public readonly sdpMLineIndexes?: Array<number>;
  public readonly sdpMids?: Array<string>;
  public readonly sdps?: Array<string>;
  public readonly uuid: string;

  constructor(params: CallMessageParams) {
    super({ timestamp: params.timestamp, identifier: params.identifier });
    this.type = params.type;
    this.sdpMLineIndexes = params.sdpMLineIndexes;
    this.sdpMids = params.sdpMids;
    this.sdps = params.sdps;
    this.uuid = params.uuid;

    // this does not make any sense
    if (
      this.type !== signalservice.CallMessage.Type.END_CALL &&
      this.type !== signalservice.CallMessage.Type.PRE_OFFER &&
      (!this.sdps || this.sdps.length === 0)
    ) {
      throw new Error('sdps must be set unless this is a END_CALL type message');
    }
    if (this.uuid.length === 0) {
      throw new Error('uuid must cannot be empty');
    }
  }

  public contentProto(): SignalService.Content {
    return new SignalService.Content({
      callMessage: this.dataCallProto(),
    });
  }

  public ttl() {
    return TTL_DEFAULT.CALL_MESSAGE;
  }

  private dataCallProto(): SignalService.CallMessage {
    return new SignalService.CallMessage({
      type: this.type,
      sdpMLineIndexes: this.sdpMLineIndexes,
      sdpMids: this.sdpMids,
      sdps: this.sdps,
      uuid: this.uuid,
    });
  }
}
