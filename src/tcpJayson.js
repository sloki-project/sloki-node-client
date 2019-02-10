const net = require('net');
const JSONStream = require('JSONStream');
const EventEmitter = require('events');
const debug = require('debug')('sloki-client')

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
        this._request(['methods', (err, methods) => {

            if (err) {
                return callback(err);
            }

            this._methods = methods;

            for (let methodName in methods) {
                this[methodName] = (...args) => {
                    args.unshift(methodName);
                    if (typeof args[args.length-1] === 'function') {
                        this._request(args);
                        return this;
                    }
                    return new Promise((resolve, reject) => {
                        this._request(args, resolve, reject);
                    });
                };
            }

            callback();
        }]);
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
            method
        }

        if (params != null && params != undefined) {
            if (typeof params === "number" || typeof params === "string") {
                req.params = [params];
            } else {
                req.params = params;
            }
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

    _request(args, resolve, reject) {
        let method = args.shift();

        if (typeof args[args.length-1] === 'function') {
            let callback = args.pop();
            if (!args.length) {
                args = undefined;
            }
            this._requestPush(uuid(), method, args, callback);
        } else {
            this._requestPush(uuid(), method, args, (err, result) => {
                if (err) {
                    return reject(err);
                }
                resolve(result);
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

}

module.exports = ClientTCP;
