const net = require('net');
const debug = require('debug')('sloki-client');
const EventEmitter = require('events');
const version = require('../package.json').version;
const missive = require('missive');

// fastest uuid generator for sloki
const hyperid = require('hyperid');
const uuid = hyperid(true);

const DEFLATE = false;

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

                for (const methodTitle in methods) {
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
                                    resolve,
                                    reject
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

    _emit(eventName, data) {
        if (this._eventExists(eventName)) {
            this.emit(eventName, data);
        }
    }

    _pipeSocket() {
        this._conn.pipe(this._decoder);
        this._encoder.pipe(this._conn);
    }

    _unpipeSocket() {
        this._conn.unpipe(this._decoder);
        this._encoder.unpipe(this._conn);
    }

    _initializeSocket(callback) {

        this._conn = net.createConnection(this._port, this._host);

        this._conn.on('timeout', () => {
            this._emit('timeout');
            debug('onTimeout');
            this._close();
        });

        this._conn.on('error', (err) => {
            callback(err);
            this._emit('error', err);
            debug('error', err.message);
            this._unpipeSocket();
            this._conn.destroy();
        });

        this._conn.on('close', () => {
            this._emit('close');
            debug('close');
            this._unpipeSocket();
            this._isConnected = false;
        });

        this._conn.on('end', () => {
            this._emit('end');
            debug('end');
            this._unpipeSocket();
            this._isConnected = false;
            this._conn.destroy();
        });

        this._conn.on('destroy', () => {
            this._emit('destroy');
            debug('destroy');
            this._unpipeSocket();
            this._isConnected = false;
        });

        this._conn.on('connect', () => {
            debug('connected');
            this._isConnected = true;
            this._getMethods(callback);
        });

        this._pipeSocket();
    }

    _close() {
        this._isConnected = false;
        this._conn.end();
    }

    _requestSend(id, method, params) {
        const req = { id, m:method };
        if (params) {
            req.p = params;
        }
        this._encoder.write(req);
        debug('request', JSON.stringify(req));
    }

    _requestPush(id, method, params, callback) {
        if (!this._isConnected) {
            callback(new Error('not connected'));
            return;
        }

        this._requests[id] = { method, params, callback };
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
            return 'method not found';
        }

        return this._methods[method].description;
    }

}

module.exports = ClientTCP;
