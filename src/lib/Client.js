const net = require('net');
const tls = require('tls');
const EventEmitter = require('events');
const debug = require('debug')('sloki-client');
const version = require('../../package.json').version;

// fastest uuid generator for sloki
const hyperid = require('hyperid');
const uuid = hyperid(true);

class BaseClient extends EventEmitter {

    constructor(port, host, options) {
        super();

        this._options = options || { protocol:'binarys' };
        this.protocol = this._options.protocol;
        this._options.tls = this._options.protocol.match(/s$/);

        if (!port) {
            switch (this._options.protocol) {
            case 'binary':
            case 'tcp':
                port = 6370;
                break;
            case 'binarys':
            case 'tls':
                port = 6371;
                break;
            case 'jsonrpc':
                port = 6372;
                break;
            case 'jsonrpcs':
                port = 6373;
                break;
            case 'dinary':
                port = 6374;
                break;
            case 'dinarys':
                port = 6375;
                break;
            }
        }

        this._port = port;
        this._host = host;

        this._isConnected = false;
        this._requests = {};
        this._methods = [];
        this._eventsByName = null;
    }

    /*
     * Privates
     */

    registerMethods(obj, methods) {
        if (!methods) {
            methods = this._methods;
        } else {
            this._methods = methods;
        }

        for (const methodTitle in methods) {

            debug(`register method ${methodTitle}`);

            obj[methodTitle] = (...args) => {

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
    }

    getMethods(callback) {
        this.request({
            method:'methods',
            callback:(err, methods) => {
                if (err) {
                    return callback(err);
                }

                this.registerMethods(this, methods);
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

    initializeSocket(callback) {

        let s;

        if (this._options.tls) {
            s = this.tlsConnect(callback);
        } else {
            s = this.tcpConnect(callback);
        }

        s.on('timeout', () => {
            debug('timeout');
            this.emitEvent('timeout');
            this.close();
        });

        s.on('close', () => {
            debug('close');
            this.emitEvent('close');
            this.unpipeSocket(s);
            this._isConnected = false;
        });

        s.on('end', () => {
            debug('end');
            this.emitEvent('end');
            this.unpipeSocket(s);
            this._isConnected = false;
            s.destroy();
        });

        s.on('destroy', () => {
            debug('destroy');
            this.emitEvent('destroy');
            this.unpipeSocket(s);
            this._isConnected = false;
        });

        s.on('error', (err) => {
            debug('error', err.message);
            callback(err);
            this.emitEvent('error', err);
            this.unpipeSocket(s);
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
            this._socket && this._socket.end();
            callback && callback();
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

    onMessage(response) {

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
            this.emitEvent('error', response.error);
            return;
        }

        if (process.env.DEBUG || process.env.NODE_ENV === 'dev') {
            if (response.error) {
                debug(response.error.message);
            }

            if (r.method != 'methods') {
                debug('response', JSON.stringify(response));
            }
        }

        if (r.method === 'versions') {
            if (typeof response.r === 'object') {
                response.r['sloki-node-client'] = version;
            }
            if (typeof response.result === 'object') {
                response.result['sloki-node-client'] = version;
            }
        }

        r.callback(response.error, response.r || response.result);
        delete this._requests[response.id];
    }

}

module.exports = BaseClient;
