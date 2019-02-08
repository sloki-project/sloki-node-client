const net = require('net');
const JSONStream = require('JSONStream');
const EventEmitter = require('events');
const log = require('evillogger')({ns:'clientTcp'});
const util = require('util');

// fastest uuid generator for sloki
const hyperid = require('hyperid');
const uuid = hyperid(true);


class ClientTCP extends EventEmitter {

    constructor(port, host, options) {
        super();

        this.port = port;
        this.host = host;
        this.options = options || {};

        this.isConnected = false;
        this.requests = {};
        this.commandsList = [];
    }

    getCommands(reject, resolve) {
        this._request(['commands', (err, commands) => {

            if (err) {
                return reject(err);
            }

            this.commandsList = commands;
            for (let command in commands) {

                console.log(commands[command]);

                this[command] = (...args) => {
                    args.unshift(command);
                    this._request(args);
                    return this;
                }

                if (this.options.usePromise) {
                    this[command] = util.promisify(this[command]);
                }
            }

            return resolve();
        }]);
    }

    connect() {

        return new Promise((resolve, reject) => {

            this.jsonstream = JSONStream.parse();

            this.jsonstream.on('data', (data) => {
                this.emit("response", data);

                let r = this.requests[data.id];

                if (!r) {
                    if (data.error) {
                        log.warn(JSON.stringify(data.error));
                    } else {
                        log.warn(JSON.stringify(data));
                    }
                    this.emit("error", data.error);
                    return;
                }

                if (r.callback) {
                    r.callback(data.error, data.result);
                    delete this.requests[data.id];
                    return;
                }

                if (data.error) {
                    r.reject(data.error);
                    delete this.requests[data.id];
                    return;
                }

                r.resolve(data.result);
                delete this.requests[data.id];

            });

            this.conn = net.connect(this.port, this.host, (err) => {
                if (err) {
                    return reject(err);
                }
                this.isConnected = true;
                this.getCommands(reject, resolve);
            });

            this.conn.on('timeout', () => {
                this.emit('timeout');
                log.info('onTimeout');
                this._close();
            });

            this.conn.on('error', (err) => {
                this.emit('error', err);
                log.error('onError', err.message);
                this.conn.destroy();
            });

            this.conn.on('close', () => {
                this.emit('close');
                log.debug('onClose');
                this.isConnected = false;
            });

            this.conn.on('end', () => {
                this.emit('end');
                log.debug('onEnd');
                this.isConnected = false;

            });

            this.conn.on('destroy', () => {
                this.emit('destroy');
                log.info('_onDestroy');
                this.isConnected = false;
            });

            this.conn.pipe(this.jsonstream);

        });
    }

    _close() {
        this.isConnected = false;
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

        //console.log(req);

        //@TODO: take a look at fastify to speed up stringify()
        this.conn.write(JSON.stringify(req));
    }

    _requestWithCallback(id, method, params, callback) {
        if (!this.isConnected) {
            callback(new Error('not connected'));
            return;
        }

        this.requests[id] = {callback};
        this._requestSend(id, method, params);
    }

    _requestWithPromise(id, method, params) {
        return new Promise((resolve, reject) => {
          if (!this.isConnected) {
              reject(new Error('not connected'));
              return;
          }
          this.requests[id] = {resolve, reject};
          this._requestSend(id, method, params);
        })
    }

    _request(args) {
        let method = args.shift();
        let callback = null;
        if (typeof args[args.length-1] === "function") {
            callback = args.pop();
            if (!args.length) {
                args = undefined;
            }
            this._requestWithCallback(uuid(), method, args, callback);
        } else {
            if (!args.length) {
                args = undefined;
            }
            return this._requestWithPromise(uuid(), method, args);
        }
    }

    close() {
        this.conn.end();
    }


}

module.exports = ClientTCP;
