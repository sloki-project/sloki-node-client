const net = require('net');
const tls = require('tls');
const EventEmitter = require('events');
const debug = require('debug')('sloki-client');

// fastest uuid generator for sloki
const hyperid = require('hyperid');
const uuid = hyperid(true);

class BaseClient extends EventEmitter {

    constructor(port, host, options) {
        super();

        this._port = port;
        this._host = host;
        this._options = options || {};
        this._options.tls = this._options.protocol.match(/s$/);

        this._isConnected = false;
        this._requests = {};
        this._methods = [];
        this._eventsByName = null;
    }

    /*
     * Privates
     */

    getMethods(callback) {
        this.request({
            method:'methods',
            callback:(err, methods) => {
                if (err) {
                    return callback(err);
                }

                this._methods = methods;

                for (const methodTitle in methods) {

                    debug(`register method ${methodTitle}`);

                    this[methodTitle] = (...args) => {

                        const lastArg = args[args.length-1];

                        if (typeof lastArg === 'function') {
                            this.request({
                                method:methodTitle,
                                params:args[0]||undefined,
                                callback:lastArg
                            });
                        } else if (lastArg != null && typeof lastArg === 'object' && lastArg.lazy) {
                            this.request({
                                method:methodTitle,
                                params:args[0]||undefined
                            });
                        } else {
                            return new Promise((resolve, reject) => {
                                this.request({
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

    eventExists(eventName) {

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

    emitEvent(eventName, data) {
        if (this.eventExists(eventName)) {
            this.emit(eventName, data);
        }
    }

    tlsConnect(callback) {
        return tls.connect(this._port, this.host, {
            secureProtocol: 'TLSv1_2_method',
            rejectUnauthorized: false,
        }, () => {
            this.onConnect(callback);
        });
    }

    tcpConnect(callback) {
        return net.connect({
            port:this._port,
            host:this._host
        }, () => {
            this.onConnect(callback);
        });
    }

    onConnect(callback) {
        debug('connected');
        this._isConnected = true;
        this.getMethods(callback);
    }

    onSocketTimeout() {
        debug('timeout');
        this.emitEvent('timeout');
        this.close();
    }

    onSocketClose() {
        debug('close');
        this.emitEvent('close');
        this.unpipeSocket(this._socket);
        this._isConnected = false;
    }

    onSocketEnd() {
        debug('end');
        this.emitEvent('end');
        this.unpipeSocket(this._socket);
        this._isConnected = false;
        this._socket.destroy();
    }

    onSocketDestroy() {
        debug('destroy');
        this.emitEvent('destroy');
        this.unpipeSocket(this._socket);
        this._isConnected = false;
    }

    onSocketclose() {
        this._isConnected = false;
        this._socket.destroy();
    }

    initializeSocket(callback) {

        let s;

        if (this._options.tls) {
            s = this.tlsConnect(callback);
        } else {
            s = this.tcpConnect(callback);
        }

        s.on('timeout', this.onSocketTimeout.bind(this));
        s.on('close', this.onSocketClose.bind(this));
        s.on('end', this.onSocketEnd.bind(this));
        s.on('destroy', this.onSocketDestroy.bind(this));

        s.on('error', (err) => {
            debug('error', err.message);
            callback(err);
            this.emitEvent('error', err);
            this.unpipeSocket(this._socket);
            s.destroy();
        });

        this._socket = s;
        this.pipeSocket(s);
    }

    requestPush(id, method, params, callback) {
        if (!this._isConnected) {
            callback(new Error('not connected'));
            return;
        }

        this._requests[id] = { method, params, callback };
        this.requestSend(id, method, params);
    }

    request(op) {
        if (op.callback) {
            this.requestPush(uuid(), op.method, op.params, op.callback);
        } else if (op.reject && op.resolve) {
            this.requestPush(uuid(), op.method, op.params, (err, result) => {
                if (err) {
                    return op.reject(err);
                }
                op.resolve(result);
            });
        } else {
            if (!op.params) op.params = {};
            op.params.nr = 1;
            this.requestSend(uuid(), op.method, op.params);
        }
    }

    /*
     * Public methods
     */

    pipeSocket(socket) {
        // it may be overrided
        if (!socket) {
            throw new Error('No socket passed into function pipeSocket()');
        }
    }

    unpipeSocket(socket) {
        // it may be overrided
        if (!socket) {
            throw new Error('No socket passed into function unpipeSocket()');
        }
    }

    initializeStream() {
        throw new Error('Please override methode _initialize');
    }

    requestSend() {
        throw new Error('Please override methode _requestSend');
    }

    connect(callback) {
        this.initializeStream();
        if (!callback) {
            return new Promise((resolve, reject) => {
                this.initializeSocket((err) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve();
                });
            });
        }

        this.initializeSocket(callback);

    }

    close(callback) {
        process.nextTick(() => {
            const pendingRequests = Object.keys(this._requests).length;
            if (pendingRequests>0) {
                debug(`closing client, but missed ${pendingRequests} pending requests`);
            }
            this._socket.end();
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

module.exports = BaseClient;
