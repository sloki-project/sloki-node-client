const JSONStream = require('JSONStream');
const debug = require('debug')('sloki-client');
const version = require('../package.json').version;
const Client = require('./lib/Client');

class MyClient extends Client {

    constructor(port, host, options) {
        if (!port) {
            if (options.protocol.match(/s$/)) {
                port = 6373;
            } else {
                port = 6372;
            }
        }
        super(port, host, options);
        this._jsonstream = null;
    }

    pipeSocket(socket) {
        socket.pipe(this._jsonstream);
    }

    unpipeSocket(socket) {
        socket.unpipe(this._jsonstream);
    }

    initializeStream() {

        this._jsonstream = JSONStream.parse();

        this._jsonstream.on('data', (response) => {

            const r = this._requests[response.id];

            // no callback stored for this request ?
            // fake id sent by the "server" ?
            if (!r) {
                if (response.error) {
                    debug(JSON.stringify(response.error));
                } else {
                    debug(JSON.stringify(response));
                }
                this.emitEvent('error', response.error);
                return;
            }

            response.error && debug(response.error.message);

            if (r.method === 'versions' && typeof response.result === 'object') {
                response.result['sloki-node-client'] = version;
            }

            r.callback(response.error, response.result);
            delete this._requests[response.id];
        });
    }

    requestSend(id, method, params) {

        let req = {
            jsonrpc:'2.0',
            id,
            method,
            params
        };

        req = JSON.stringify(req);
        this._socket.write(req);
        //debug(req);
    }
}

module.exports = MyClient;
