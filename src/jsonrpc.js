const JSONStream = require('JSONStream');
const Client = require('./lib/Client');

class MyClient extends Client {

    constructor() {
        super(...arguments);
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
        this._jsonstream.on('data', this.onMessage.bind(this));
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
