const JSONStream = require('JSONStream');
const debug = require('debug')('sloki-client');
const version = require('../../package.json').version;
const TcpClient = require('./TCP');

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

        this._jsonstream = JSONStream.parse();

        this._jsonstream.on('data', (data) => {

            const r = this._requests[data.id];

            // no callback stored for this request ?
            // fake id sent by the "server" ?
            if (!r) {
                if (data.error) {
                    debug(JSON.stringify(data.error));
                } else {
                    debug(JSON.stringify(data));
                }
                this._emit('error', data.error);
                return;
            }

            data.error && debug(data.error.message);

            if (r.method === 'versions' && typeof data.result === 'object') {
                data.result['sloki-node-client'] = version;
            }

            r.callback(data.error, data.result);
            delete this._requests[data.id];
        });
    }

    _requestSend(id, method, params) {

        let req = {
            jsonrpc:'2.0',
            id,
            method,
            params
        };

        //@TODO: take a look at fastify to speed up stringify() ?
        req = JSON.stringify(req);
        this._conn.write(req);
        debug(req);
    }
}

module.exports = Client;
