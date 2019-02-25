const Client = require('../');
const async = require('async');

const clientTcp = new Client('tcp://127.0.0.1:6370');

async.waterfall([
    (next) => {
        clientTcp.connect(next);
    },
    (next) => {
        clientTcp.loadDatabase({ database:'myTestDatabase' }, next);
    },
    (db, next) => {
        clientTcp.insert({ collection:'devices', document:{ 'foo':'bar' } }, next);
    },
    (result, next) => {
        clientTcp.find({ collection:'devices' }, next);
    },
    (devices, next) => {
        console.log(devices);
        clientTcp.close(next);
    }
], (err) => {
    if (err) {
        console.log(err);
    }
});
