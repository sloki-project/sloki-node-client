const Client = require('../')
const async = require('async');

const client = new Client('tcp://127.0.0.1:6370');

async.waterfall([
    (next) => {
        client.connect(next);
    },
    (next) => {
        client.loadDatabase('myTestDatabase', next);
    },
    (db, next) => {
        client.insert('devices',{'foo':'bar'}, next);
    },
    (result, next) => {
        client.find('devices', next);
    },
    (devices, next) => {
        console.log(devices);
        client.close(next);
    }
],(err) => {
    if (err) {
        console.log(err);
    }
});
