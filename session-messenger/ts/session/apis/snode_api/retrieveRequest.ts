import { omit } from 'lodash';
import { Snode } from '../../../data/data';
// import { updateIsOnline } from '../../../state/ducks/onion';
import { doSnodeBatchRequest } from './batchRequest';
import { GetNetworkTime } from './getNetworkTime';
import { SnodeNamespace, SnodeNamespaces } from './namespaces';

import { DURATION } from '../../constants';
import { UserUtils } from '../../utils';
import {
  RetrieveLegacyClosedGroupSubRequestType,
  RetrieveSubRequestType,
  UpdateExpiryOnNodeSubRequest,
} from './SnodeRequestTypes';
import { SnodeSignature } from './snodeSignatures';
import { RetrieveMessagesResultsBatched, RetrieveMessagesResultsContent } from './types';
import { console } from '../../../sessionjs-logger';

async function buildRetrieveRequest(
  lastHashes: Array<string>,
  pubkey: string,
  namespaces: Array<SnodeNamespaces>,
  ourPubkey: string,
  configHashesToBump: Array<string> | null
): Promise<Array<RetrieveSubRequestType>> {
  const maxSizeMap = SnodeNamespace.maxSizeMap(namespaces);
  const retrieveRequestsParams: Array<RetrieveSubRequestType> = await Promise.all(
    namespaces.map(async (namespace, index) => {
      const foundMaxSize = maxSizeMap.find(m => m.namespace === namespace)?.maxSize;
      const retrieveParam = {
        pubkey,
        last_hash: lastHashes.at(index) || '',
        namespace,
        timestamp: GetNetworkTime.getNowWithNetworkOffset(),
        max_size: foundMaxSize,
      };

      if (namespace === SnodeNamespaces.ClosedGroupMessage) {
        if (pubkey === ourPubkey || !pubkey.startsWith('05')) {
          throw new Error(
            'namespace -10 can only be used to retrieve messages from a legacy closed group (prefix 05)'
          );
        }
        const retrieveLegacyClosedGroup = {
          ...retrieveParam,
          namespace,
        };
        const retrieveParamsLegacy: RetrieveLegacyClosedGroupSubRequestType = {
          method: 'retrieve',
          params: omit(retrieveLegacyClosedGroup, 'timestamp'), // if we give a timestamp, a signature will be required by the service node, and we don't want to provide one as this is an unauthenticated namespace
        };

        return retrieveParamsLegacy;
      }

      // all legacy closed group retrieves are unauthenticated and run above.
      // if we get here, this can only be a retrieve for our own swarm, which must be authenticated
      if (
        !SnodeNamespace.isUserConfigNamespace(namespace) &&
        namespace !== SnodeNamespaces.UserMessages
      ) {
        throw new Error(`not a legacy closed group. namespace can only be 0 and was ${namespace}`);
      }
      if (pubkey !== ourPubkey) {
        throw new Error('not a legacy closed group. pubkey can only be ours');
      }
      const signatureArgs = { ...retrieveParam, method: 'retrieve' as const, ourPubkey };
      const signatureBuilt = await SnodeSignature.getSnodeSignatureParams(signatureArgs);
      const retrieve: RetrieveSubRequestType = {
        method: 'retrieve',
        params: { ...retrieveParam, ...signatureBuilt },
      };
      return retrieve;
    })
  );

  if (configHashesToBump?.length) {
    const expiry = GetNetworkTime.getNowWithNetworkOffset() + DURATION.DAYS * 30;
    const signResult = await SnodeSignature.generateUpdateExpirySignature({
      shortenOrExtend: '',
      timestamp: expiry,
      messageHashes: configHashesToBump,
    });
    if (!signResult) {
      console.warn(
        `SnodeSignature.generateUpdateExpirySignature returned result empty for hashes ${configHashesToBump}`
      );
    } else {
      const expireParams: UpdateExpiryOnNodeSubRequest = {
        method: 'expire',
        params: {
          messages: configHashesToBump,
          pubkey: UserUtils.getOurPubKeyStrFromCache(),
          expiry,
          signature: signResult.signature,
          pubkey_ed25519: signResult.pubkey_ed25519,
        },
      };

      retrieveRequestsParams.push(expireParams);
    }
  }
  return retrieveRequestsParams;
}

async function retrieveNextMessages(
  targetNode: Snode,
  lastHashes: Array<string>,
  associatedWith: string,
  namespaces: Array<SnodeNamespaces>,
  ourPubkey: string,
  configHashesToBump: Array<string> | null
): Promise<RetrieveMessagesResultsBatched> {
  if (namespaces.length !== lastHashes.length) {
    throw new Error('namespaces and lasthashes does not match');
  }

  const retrieveRequestsParams = await buildRetrieveRequest(
    lastHashes,
    associatedWith,
    namespaces,
    ourPubkey,
    configHashesToBump
  );
  // let exceptions bubble up
  // no retry for this one as this a call we do every few seconds while polling for messages

  const results = await doSnodeBatchRequest(
    retrieveRequestsParams,
    targetNode,
    4000,
    associatedWith
  );

  if (!results || !results.length) {
    console.warn(
      `_retrieveNextMessages - sessionRpc could not talk to ${targetNode.ip}:${targetNode.port}`
    );
    throw new Error(
      `_retrieveNextMessages - sessionRpc could not talk to ${targetNode.ip}:${targetNode.port}`
    );
  }

  // the +1 is to take care of the extra `expire` method added once user config is released
  if (results.length !== namespaces.length && results.length !== namespaces.length + 1) {
    throw new Error(
      `We asked for updates about ${namespaces.length} messages but got results of length ${results.length}`
    );
  }

  // do a basic check to know if we have something kind of looking right (status 200 should always be there for a retrieve)
  const firstResult = results[0];

  if (firstResult.code !== 200) {
    console.warn(`retrieveNextMessages result is not 200 but ${firstResult.code}`);
    throw new Error(
      `_retrieveNextMessages - retrieve result is not 200 with ${targetNode.ip}:${targetNode.port} but ${firstResult.code}`
    );
  }

  try {
    // we rely on the code of the first one to check for online status
    const bodyFirstResult = firstResult.body;
    // if (!window.inboxStore?.getState().onionPaths.isOnline) {
    //   // window.inboxStore?.dispatch(updateIsOnline(true));
    //   console.log('[SBOT/redux] updateIsOnline')
    // }

    GetNetworkTime.handleTimestampOffsetFromNetwork('retrieve', bodyFirstResult.t);

    // merge results with their corresponding namespaces
    return results.map((result, index) => ({
      code: result.code,
      messages: result.body as RetrieveMessagesResultsContent,
      namespace: namespaces[index],
    }));
  } catch (e) {
    console.warn('exception while parsing json of nextMessage:', e);
    // if (!window.inboxStore?.getState().onionPaths.isOnline) {
    //   // window.inboxStore?.dispatch(updateIsOnline(true));
    //   console.log('[SBOT/redux] updateIsOnline')
    // }
    throw new Error(
      `_retrieveNextMessages - exception while parsing json of nextMessage ${targetNode.ip}:${targetNode.port}: ${e?.message}`
    );
  }
}

export const SnodeAPIRetrieve = { retrieveNextMessages };
