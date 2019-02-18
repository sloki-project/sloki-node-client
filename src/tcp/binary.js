const missive = require('missive');
const debug = require('debug')('sloki-client');
const version = require('../../package.json').version;
const TcpClient = require('./TCP');

const DEFLATE = false;

class Client extends TcpClient {

    constructor(port, host, options) {
        super();
        this._port = port;
        this._host = host;
        this._options = options || {};
    }

    /*
     * Privates
     */

    _initializeStream() {

        this._decoder = missive.parse({ inflate: true });

        this._decoder.on('message', response => {

            if (!response.id) {
                debug(`response message don't have any id ! ${JSON.stringify(response)}`);
                return;
            }

            const r = this._requests[response.id];

            // no callback stored for this request ?
            // fake id sent by the "server" ?
            if (!r) {
                if (response.error) {
                    debug(JSON.stringify(response.error));
                } else {
                    debug(JSON.stringify(response));
                }
                this._emit('error', response.error);
                return;
            }

            response.error && debug(response.error.message);

            if (r.method === 'versions' && typeof response.r === 'object') {
                response.r['sloki-node-client'] = version;
            }

            if (r.method != 'methods') {
                debug('response', JSON.stringify(response));
            }

            r.callback(response.error, response.r);
            delete this._requests[response.id];
        });

        this._encoder = missive.encode({ deflate: DEFLATE });
    }

    _pipeSocket() {
        this._conn.pipe(this._decoder);
        this._encoder.pipe(this._conn);
    }

    _unpipeSocket() {
        this._conn.unpipe(this._decoder);
        this._encoder.unpipe(this._conn);
    }

    _requestSend(id, method, params) {
        const req = { id, m:method };
        if (params) {
            req.p = params;
        }
        this._encoder.write(req);
        debug('request', JSON.stringify(req));
    }

}

module.exports = Client;
