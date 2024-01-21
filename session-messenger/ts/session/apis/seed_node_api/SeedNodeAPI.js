"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_fetchSnodePoolFromSeedNodeRetryable = exports.getMinTimeout = exports.fetchSnodePoolFromSeedNodeWithRetries = void 0;
const tls_1 = __importDefault(require("tls"));
const https_1 = __importDefault(require("https"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const lodash_1 = __importDefault(require("lodash"));
const p_retry_1 = __importDefault(require("p-retry"));
const crypto_1 = require("../../crypto");
const __1 = require("../..");
const _1 = require(".");
const Promise_1 = require("../../utils/Promise");
const MIME_1 = require("../../../types/MIME");
const OS_1 = require("../../../OS");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
async function fetchSnodePoolFromSeedNodeWithRetries(seedNodes) {
    try {
        sessionjs_logger_1.console.info(`fetchSnodePoolFromSeedNode with seedNodes.length ${seedNodes.length}`);
        let snodes = await getSnodeListFromSeednodeOneAtAtime(seedNodes);
        snodes = lodash_1.default.shuffle(snodes);
        const fetchSnodePool = snodes.map(snode => ({
            ip: snode.public_ip,
            port: snode.storage_port,
            pubkey_x25519: snode.pubkey_x25519,
            pubkey_ed25519: snode.pubkey_ed25519,
        }));
        sessionjs_logger_1.console.info('SeedNodeAPI::fetchSnodePoolFromSeedNodeWithRetries - Refreshed random snode pool with', snodes.length, 'snodes');
        return fetchSnodePool;
    }
    catch (e) {
        sessionjs_logger_1.console.warn('SessionSnodeAPI::fetchSnodePoolFromSeedNodeWithRetries - error', e.code, e.message);
        throw new Error('Failed to contact seed node');
    }
}
exports.fetchSnodePoolFromSeedNodeWithRetries = fetchSnodePoolFromSeedNodeWithRetries;
const getSslAgentForSeedNode = async (seedNodeHost, isSsl = false) => {
    let certContent = '';
    let pubkey256 = '';
    let cert256 = '';
    if (!isSsl) {
        return undefined;
    }
    switch (seedNodeHost) {
        case 'seed1.getsession.org':
            certContent = (0, OS_1.isLinux)() ? storageSeed1Crt : Buffer.from(storageSeed1Crt, 'utf-8').toString();
            pubkey256 = 'mlYTXvkmIEYcpswANTpnBwlz9Cswi0py/RQKkbdQOZQ=';
            cert256 =
                '36:EA:0B:25:35:37:98:85:51:EE:85:6E:4F:D2:0D:55:01:1E:9C:8B:27:EA:A2:F3:4B:8F:32:A0:BD:F0:4F:2D';
            break;
        case 'seed2.getsession.org':
            certContent = (0, OS_1.isLinux)() ? storageSeed2Crt : Buffer.from(storageSeed2Crt, 'utf-8').toString();
            pubkey256 = 'ZuUxe4wopBR83Yy5fePPNX0c00BnkQCu/49oapFpB0k=';
            cert256 =
                'C5:90:8D:D4:13:9A:CD:96:AE:DD:1E:45:57:65:97:65:08:09:C8:A5:EA:02:AF:55:6D:48:53:D4:53:96:E0:E7';
            break;
        case 'seed3.getsession.org':
            certContent = (0, OS_1.isLinux)() ? storageSeed3Crt : Buffer.from(storageSeed3Crt, 'utf-8').toString();
            pubkey256 = '4xe+8k1NjxerVTjUsWlZJNKt3PA7Y31pUls2tHYippA=';
            cert256 =
                '8A:0A:F2:C7:12:34:2F:22:CE:00:E5:3C:16:01:41:0E:F8:D8:41:56:AE:E0:A9:80:9C:32:F6:F7:EF:BE:55:6E';
            break;
        default:
            throw new Error(`Unknown seed node: ${seedNodeHost}`);
    }
    const sslOptions = {
        ca: certContent,
        rejectUnauthorized: true,
        keepAlive: true,
        checkServerIdentity: (host, cert) => {
            sessionjs_logger_1.console.info(`seednode checkServerIdentity: ${host}`);
            const err = tls_1.default.checkServerIdentity(host, cert);
            if (err) {
                return err;
            }
            if ((0, crypto_1.sha256)(cert.pubkey) !== pubkey256) {
                sessionjs_logger_1.console.error('checkServerIdentity: cert.pubkey issue');
                const msg = 'Certificate verification error: ' +
                    `The public key of '${cert.subject.CN}' ` +
                    'does not match our pinned fingerprint';
                return new Error(msg);
            }
            if (cert.fingerprint256 !== cert256) {
                sessionjs_logger_1.console.error('checkServerIdentity: fingerprint256 issue');
                const msg = 'Certificate verification error: ' +
                    `The certificate of '${cert.subject.CN}' ` +
                    'does not match our pinned fingerprint';
                return new Error(msg);
            }
            return undefined;
        },
    };
    return new https_1.default.Agent(sslOptions);
};
const getSnodeListFromSeednodeOneAtAtime = async (seedNodes) => (0, Promise_1.allowOnlyOneAtATime)('getSnodeListFromSeednode', () => getSnodeListFromSeednode(seedNodes));
async function getSnodeListFromSeednode(seedNodes) {
    const SEED_NODE_RETRIES = 4;
    return (0, p_retry_1.default)(async () => {
        sessionjs_logger_1.console.info('getSnodeListFromSeednode starting...');
        if (!seedNodes.length) {
            sessionjs_logger_1.console.info('loki_snode_api::getSnodeListFromSeednode - seedNodes are empty');
            throw new Error('getSnodeListFromSeednode - seedNodes are empty');
        }
        const snodes = await _1.SeedNodeAPI.TEST_fetchSnodePoolFromSeedNodeRetryable(seedNodes);
        return snodes;
    }, {
        retries: SEED_NODE_RETRIES - 1,
        factor: 2,
        minTimeout: _1.SeedNodeAPI.getMinTimeout(),
        onFailedAttempt: e => {
            sessionjs_logger_1.console.warn(`fetchSnodePoolFromSeedNodeRetryable attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left... Error: ${e.message}`);
        },
    });
}
function getMinTimeout() {
    return 1000;
}
exports.getMinTimeout = getMinTimeout;
async function TEST_fetchSnodePoolFromSeedNodeRetryable(seedNodes) {
    sessionjs_logger_1.console.info('fetchSnodePoolFromSeedNodeRetryable starting...');
    if (!seedNodes.length) {
        sessionjs_logger_1.console.info('loki_snode_api::fetchSnodePoolFromSeedNodeRetryable - seedNodes are empty');
        throw new Error('fetchSnodePoolFromSeedNodeRetryable: Seed nodes are empty');
    }
    const seedNodeUrl = lodash_1.default.sample(seedNodes);
    if (!seedNodeUrl) {
        sessionjs_logger_1.console.warn('loki_snode_api::fetchSnodePoolFromSeedNodeRetryable - Could not select random snodes from', seedNodes);
        throw new Error('fetchSnodePoolFromSeedNodeRetryable: Seed nodes are empty #2');
    }
    const tryUrl = new URL(seedNodeUrl);
    const snodes = await getSnodesFromSeedUrl(tryUrl);
    if (snodes.length === 0) {
        sessionjs_logger_1.console.warn(`loki_snode_api::fetchSnodePoolFromSeedNodeRetryable - ${seedNodeUrl} did not return any snodes`);
        throw new Error(`Failed to contact seed node: ${seedNodeUrl}`);
    }
    return snodes;
}
exports.TEST_fetchSnodePoolFromSeedNodeRetryable = TEST_fetchSnodePoolFromSeedNodeRetryable;
async function getSnodesFromSeedUrl(urlObj) {
    sessionjs_logger_1.console.info(`getSnodesFromSeedUrl starting with ${urlObj.href}`);
    const params = {
        active_only: true,
        fields: {
            public_ip: true,
            storage_port: true,
            pubkey_x25519: true,
            pubkey_ed25519: true,
        },
    };
    const endpoint = 'json_rpc';
    const url = `${urlObj.href}${endpoint}`;
    const body = {
        jsonrpc: '2.0',
        method: 'get_n_service_nodes',
        params,
    };
    const sslAgent = await getSslAgentForSeedNode(urlObj.hostname, urlObj.protocol !== __1.Constants.PROTOCOLS.HTTP);
    const fetchOptions = {
        method: 'POST',
        timeout: 5000,
        body: JSON.stringify(body),
        headers: {
            'User-Agent': 'WhatsApp',
            'Accept-Language': 'en-us',
        },
        agent: sslAgent,
    };
    sessionjs_logger_1.console.info(`insecureNodeFetch => plaintext for getSnodesFromSeedUrl  ${url}`);
    const response = await (0, node_fetch_1.default)(url, fetchOptions);
    if (response.status !== 200) {
        sessionjs_logger_1.console.error(`loki_snode_api:::getSnodesFromSeedUrl - invalid response from seed ${urlObj.toString()}:`, response);
        throw new Error(`getSnodesFromSeedUrl: status is not 200 ${response.status} from ${urlObj.href}`);
    }
    if (response.headers.get('Content-Type') !== MIME_1.APPLICATION_JSON) {
        sessionjs_logger_1.console.error('Response is not json');
        throw new Error(`getSnodesFromSeedUrl: response is not json Content-Type from ${urlObj.href}`);
    }
    try {
        const json = await response.json();
        const result = json.result;
        if (!result) {
            sessionjs_logger_1.console.error(`loki_snode_api:::getSnodesFromSeedUrl - invalid result from seed ${urlObj.toString()}:`, response);
            throw new Error(`getSnodesFromSeedUrl: json.result is empty from ${urlObj.href}`);
        }
        const validNodes = result.service_node_states.filter((snode) => snode.public_ip !== '0.0.0.0');
        if (validNodes.length === 0) {
            throw new Error(`Did not get a single valid snode from ${urlObj.href}`);
        }
        return validNodes;
    }
    catch (e) {
        sessionjs_logger_1.console.error('Invalid json response. error:', e.message);
        throw new Error(`getSnodesFromSeedUrl: cannot parse content as JSON from ${urlObj.href}`);
    }
}
const storageSeed1Crt = `-----BEGIN CERTIFICATE-----
MIIEDTCCAvWgAwIBAgIUWk96HLAovn4uFSI057KhnMxqosowDQYJKoZIhvcNAQEL
BQAwejELMAkGA1UEBhMCQVUxETAPBgNVBAgMCFZpY3RvcmlhMRIwEAYDVQQHDAlN
ZWxib3VybmUxJTAjBgNVBAoMHE94ZW4gUHJpdmFjeSBUZWNoIEZvdW5kYXRpb24x
HTAbBgNVBAMMFHNlZWQxLmdldHNlc3Npb24ub3JnMB4XDTIzMDQwNTAxMjQzNVoX
DTMzMDQwNTAxMjQzNVowejELMAkGA1UEBhMCQVUxETAPBgNVBAgMCFZpY3Rvcmlh
MRIwEAYDVQQHDAlNZWxib3VybmUxJTAjBgNVBAoMHE94ZW4gUHJpdmFjeSBUZWNo
IEZvdW5kYXRpb24xHTAbBgNVBAMMFHNlZWQxLmdldHNlc3Npb24ub3JnMIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2wlGkR2aDOHoizik4mqvWEwDPOQG
o/Afd/6VqKzo4BpNerVZQNgdMgdLTedZE4FRfetubonYu6iSYALK2iKoGsIlru1u
Q9dUl0abA9v+yg6duh1aHw8oS16JPL0zdq8QevJaTxd0MeDnx4eXfFjtv8L0xO4r
CRFH+H6ATcJy+zhVBcWLjiNPe6mGSHM4trx3hwJY6OuuWX5FkO0tMqj9aKJtJ+l0
NArra0BZ9MaMwAFE7AxWwyD0jWIcSvwK06eap+6jBcZIr+cr7fPO5mAlT+CoGB68
yUFwh1wglcVdNPoa1mbFQssCsCRa3MWgpzbMq+KregVzjVEtilwLFjx7FQIDAQAB
o4GKMIGHMB0GA1UdDgQWBBQ1XAjGKhyIU22mYdUEIlzlktogNzAfBgNVHSMEGDAW
gBQ1XAjGKhyIU22mYdUEIlzlktogNzAPBgNVHRMBAf8EBTADAQH/MB8GA1UdEQQY
MBaCFHNlZWQxLmdldHNlc3Npb24ub3JnMBMGA1UdJQQMMAoGCCsGAQUFBwMBMA0G
CSqGSIb3DQEBCwUAA4IBAQC4PRiu4LyxK71Gk+f3dDvjinuE9F0XtAamKfRlLMEo
KxK8dtLrT8p62rME7QiigSv15AmSNyqAp751N/j0th1prOnxBoG38BXKLBDDClri
u91MR4h034G6LIYCiM99ldc8Q5a5WCKu9/9z6CtVxZcNlfe477d6lKHSwb3mQ581
1Ui3RnpkkU1n4XULI+TW2n/Hb8gN6IyTHFB9y2jb4kdg7N7PZIN8FS3n3XGiup9r
b/Rujkuy7rFW78Q1BuHWrQPbJ3RU2CKh1j5o6mtcJFRqP1PfqWmbuaomam48s5hU
4JEiR9tyxP+ewl/bToFcet+5Lp9wRLxn0afm/3V00WyP
-----END CERTIFICATE-----
`;
const storageSeed2Crt = `-----BEGIN CERTIFICATE-----
MIIEDTCCAvWgAwIBAgIUXkVaUNO/G727mNeaiso9MjvBEm4wDQYJKoZIhvcNAQEL
BQAwejELMAkGA1UEBhMCQVUxETAPBgNVBAgMCFZpY3RvcmlhMRIwEAYDVQQHDAlN
ZWxib3VybmUxJTAjBgNVBAoMHE94ZW4gUHJpdmFjeSBUZWNoIEZvdW5kYXRpb24x
HTAbBgNVBAMMFHNlZWQyLmdldHNlc3Npb24ub3JnMB4XDTIzMDQwNTAxMjI0MloX
DTMzMDQwNTAxMjI0MlowejELMAkGA1UEBhMCQVUxETAPBgNVBAgMCFZpY3Rvcmlh
MRIwEAYDVQQHDAlNZWxib3VybmUxJTAjBgNVBAoMHE94ZW4gUHJpdmFjeSBUZWNo
IEZvdW5kYXRpb24xHTAbBgNVBAMMFHNlZWQyLmdldHNlc3Npb24ub3JnMIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvT493tt1EWdyIa++X59ffrQt+ghK
+3Hv/guCPmR0FxPUeVnayoLbeKgbe8dduThh7nlmlYnpwbulvDnMF/rRpX51AZiT
A8UGktBzGXi17/D/X71EXGqlM41QZfVm5MCdQcghvbwO8MP0nWmbV4DdiNYAwSNh
fpGMEiblCvKtGN71clTkOW+8Moq4eOxT9tKIlOv97uvkUS21NgmSzsj453hrb6oj
XR3rtW264zn99+Gv83rDE1jk0qfDjxCkaUb0BvRDREc+1q3p8GZ6euEFBM3AcXe7
Yl0qbJgIXd5I+W5nMJJCyJHPTxQNvS+uJqL4kLvdwQRFAkwEM+t9GCH1PQIDAQAB
o4GKMIGHMB0GA1UdDgQWBBQOdqxllTHj+fmGjmdgIXBl+k0PRDAfBgNVHSMEGDAW
gBQOdqxllTHj+fmGjmdgIXBl+k0PRDAPBgNVHRMBAf8EBTADAQH/MB8GA1UdEQQY
MBaCFHNlZWQyLmdldHNlc3Npb24ub3JnMBMGA1UdJQQMMAoGCCsGAQUFBwMBMA0G
CSqGSIb3DQEBCwUAA4IBAQBkmmX+mopdnhzQC5b5rgbU7wVhlDaG7eJCRgUvqkYm
Pbv6XFfvtshykhw2BjSyQetofJaBh5KOR7g0MGRSn3AqRPBeEpXfkBI9urhqFwBF
F5atmp1rTCeHuAS6w4mL6rmj7wHl2CRSom7czRdUCNM+Tu1iK6xOrtOLwQ1H1ps1
KK3siJb3W0eKykHnheQPn77RulVBNLz1yedEUTVkkuVhzSUj5yc8tiwrcagwWX6m
BlfVCJgsBbrJ754rg0AJ0k59wriRamimcUIBvKIo3g3UhJHDI8bt4+SvsRYkSmbi
rzVthAlJjSlRA28X/OLnknWcgEdkGhu0F1tkBtVjIQXd
-----END CERTIFICATE-----
`;
const storageSeed3Crt = `-----BEGIN CERTIFICATE-----
MIIEDTCCAvWgAwIBAgIUTz5rHKUe+VA9IM6vY6QACc0ORFkwDQYJKoZIhvcNAQEL
BQAwejELMAkGA1UEBhMCQVUxETAPBgNVBAgMCFZpY3RvcmlhMRIwEAYDVQQHDAlN
ZWxib3VybmUxJTAjBgNVBAoMHE94ZW4gUHJpdmFjeSBUZWNoIEZvdW5kYXRpb24x
HTAbBgNVBAMMFHNlZWQzLmdldHNlc3Npb24ub3JnMB4XDTIzMDQwNTAxMjYzMVoX
DTMzMDQwNTAxMjYzMVowejELMAkGA1UEBhMCQVUxETAPBgNVBAgMCFZpY3Rvcmlh
MRIwEAYDVQQHDAlNZWxib3VybmUxJTAjBgNVBAoMHE94ZW4gUHJpdmFjeSBUZWNo
IEZvdW5kYXRpb24xHTAbBgNVBAMMFHNlZWQzLmdldHNlc3Npb24ub3JnMIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6FgxIk9KmYISL5fk7BLaGAW6lBx8
b4VL3DjlyrFMz7ZhSbcUcavWyyYB+iJxBRhfQGJ7vbwJZ1AwVJisjDFdiLcWzTF8
gzZ7LVXH8qlVnqcx0gksrWYFnG3Y2WJrxEBFdD29lP7LVN3xLQdplMitOciqg5jN
oRjtwGo+wzaMW6WNPzgTvxLzPce9Rl3oN4tSK7qlA9VtsyHwOWBMcogv9LC9IUFZ
2yu0RdcxPdlwLwywYtSRt/W87KbAWTcYY1DfN2VA68p9Cip7/dPOokRduMh1peux
swmIybpC/wz/Ql6J6scSOjDUp/2UsIdYIvyP/Dibi4nHRmD+oz9kb+J3AQIDAQAB
o4GKMIGHMB0GA1UdDgQWBBSQAFetDPIzVg9rfgOI7bfaeEHd8TAfBgNVHSMEGDAW
gBSQAFetDPIzVg9rfgOI7bfaeEHd8TAPBgNVHRMBAf8EBTADAQH/MB8GA1UdEQQY
MBaCFHNlZWQzLmdldHNlc3Npb24ub3JnMBMGA1UdJQQMMAoGCCsGAQUFBwMBMA0G
CSqGSIb3DQEBCwUAA4IBAQCiBNdbKNSHyCZJKvC/V+pHy9E/igwvih2GQ5bNZJFA
daOiKBgaADxaxB4lhtzasr2LdgZdLrn0oONw+wYaui9Z12Yfdr9oWuOgktn8HKLY
oKkJc5EcMYFsd00FnnFcO2U8lQoL6PB/tdcEmpOfqtvShpNhp8SbadSNiqlttvtV
1dqvqSBiRdQm1kz2b8hA6GR6SPzSKlSuwI0J+ZcXEi232EJFbgJ3ESHFVHrhUZro
8A16/WDvZOMWCjOqJsFBw15WzosW9kyNwBtZinXVO3LW/7tVl08PDcarpH4IWjd0
LDpU7zGjcD/A19tfdfMFTOmETuq40I8xxtlR2NENFOAL
-----END CERTIFICATE-----
`;
