const util = require('util');
const EventEmitter = require('events').EventEmitter;
const BinaryClient = require('./binary');
const promisify = require('util').promisify;

function DinaryClient(port, host, options) {

    const clientReader = new BinaryClient(port, host, options);
    const clientWriter = new BinaryClient(port, host, options);
    const self = this;

    clientReader.on('error', err => {
        this.emit('error', err);
    });

    clientWriter.on('error', err => {
        this.emit('error', err);
    });

    async function connect(callback) {
        let readerId;
        try {
            await clientReader.connect();
            readerId = await clientReader.reader();
        } catch(e) {
            callback && callback(e);
            return;
        }

        let affected = false;
        try {
            await clientWriter.connect();
            affected = await clientWriter.writer({ readerId });
        } catch (e) {
            callback && callback(e);
            return;
        }

        if (!affected) {
            self.emit('error', 'can not stick writer with reader');
        }

        clientWriter.registerMethods(self);

        callback && callback();

    }

    async function close(callback) {
        try {
            await clientReader.close();
            await clientWriter.close();
            callback && callback();
        } catch(e) {
            callback && callback(e);
        }
    }

    self.connect = promisify(connect);
    self.close = promisify(close);
    self.protocol = options.protocol;

    return self;

}

util.inherits(DinaryClient, EventEmitter);

module.exports = DinaryClient;
