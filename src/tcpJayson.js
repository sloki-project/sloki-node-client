const net = require('net');
const JSONStream = require('JSONStream');
const EventEmitter = require('events');
const debug = require('debug')('sloki-client')
const version = require('../package.json').version;

// fastest uuid generator for sloki
const hyperid = require('hyperid');
const uuid = hyperid(true);


class ClientTCP extends EventEmitter {

    constructor(port, host, options) {
        super();

        this._port = port;
        this._host = host;
        this._options = options || {};

        this._isConnected = false;
        this._jsonstream = null;
        this._requests = {};
        this._methods = [];
        this._eventsByName = null;
    }

    /*
     * Privates
     */

     _getMethods(callback) {
        this._request({
            method:'methods',
            callback:(err, methods) => {
                if (err) {
                    return callback(err);
                }

                this._methods = methods;

                for (let methodTitle in methods) {
                    this[methodTitle] = (...args) => {
                        if (typeof args[args.length-1] === 'function') {
                            this._request({
                                method:methodTitle,
                                params:args[0]||undefined,
                                callback:args[args.length-1]
                            });
                        } else {
                            return new Promise((resolve, reject) => {
                                this._request({
                                    method:methodTitle,
                                    params:args[0]||undefined,
                                    resolve:resolve,
                                    reject:reject
                                });
                            });
                        }
                    };
                }
                callback();
            }
        });
    }

    _eventExists(eventName) {

        if (this._eventsByName) {
            return this._eventsByName[eventName];
        }

        if (!this._eventsByName) {
            this._eventsByName = {};
            for (const ev of this.eventNames()) {
                this._eventsByName[ev] = true;
            }
        }

        return this._eventsByName[eventName];
    }

    _initializeJsonStream() {

        let self = this;

        this._jsonstream = JSONStream.parse();

        this._jsonstream.on('data', (data) => {

            let r = this._requests[data.id];

            // no callback stored for this request ?
            // fake id sent by the "server" ?
            if (!r) {
                if (data.error) {
                    debug(JSON.stringify(data.error));
                } else {
                    debug(JSON.stringify(data));
                }
                this._emit("error", data.error);
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

    _emit(eventName, data) {
        if (this._eventExists(eventName)) {
            this.emit(eventName, data);
        }
    }

    _initializeSocket(callback) {

        this._conn = net.connect(this._port, this._host);

        this._conn.on('timeout', () => {
            this._emit('timeout');
            debug('onTimeout');
            this._close();
        });

        this._conn.on('error', (err) => {
            callback(err);
            this._emit('error', err);
            debug('onError', err.message);
            this._conn.destroy();
        });

        this._conn.on('close', () => {
            this._emit('close');
            debug('close');
            this._isConnected = false;
        });

        this._conn.on('end', () => {
            this._emit('end');
            debug('end');
            this._isConnected = false;
        });

        this._conn.on('destroy', () => {
            this._emit('destroy');
            debug('destroy');
            this._isConnected = false;
        });

        this._conn.on('connect', () => {
            this._isConnected = true;
            this._getMethods(callback);
        });

        this._conn.pipe(this._jsonstream);
    }

    _close() {
        this._isConnected = false;
        this.conn.end();
    }

    _requestSend(id, method, params) {

        let req = {
            jsonrpc:"2.0",
            id,
            method,
            params
        }

        //@TODO: take a look at fastify to speed up stringify() ?
        req = JSON.stringify(req);
        this._conn.write(req);
        debug(req);
    }

    _requestPush(id, method, params, callback) {
        if (!this._isConnected) {
            callback(new Error('not connected'));
            return;
        }

        this._requests[id] = {method, params, callback};
        this._requestSend(id, method, params);
    }

    _request(op) {
        if (op.callback) {
            this._requestPush(uuid(), op.method, op.params, op.callback);
        } else {
            this._requestPush(uuid(), op.method, op.params, (err, result) => {
                if (err) {
                    return op.reject(err);
                }
                op.resolve(result);
            });
        }
    }

    /*
     * Public
     */
    connect(callback) {
        this._initializeJsonStream();
        if (!callback) {
            return new Promise((resolve, reject) => {
                this._initializeSocket((err) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve();
                });
            });
        }

        this._initializeSocket(callback);

    }

    close(callback) {
        process.nextTick(() => {
            const pendingRequests = Object.keys(this._requests).length;
            if (pendingRequests>0) {
                debug(`closing client, but missed ${pendingRequests} pending requests`);
            }
            this._conn.end();
            if (callback) {
                callback();
            }
        });
    }

    getMethodsName() {
        return Object.keys(this._methods);
    }

    getMethodDescription(method) {
        if (!this._methods[method]) {
            return "method not found";
        }

        return this._methods[method].description;
    }

}

module.exports = ClientTCP;
