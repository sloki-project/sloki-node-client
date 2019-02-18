const implementedTransports = ['tcp', 'tls'];
const defaultOptions = {
    engine:'binary'
};

function Client(url, options) {
    const e = url.match(/^([^:]+)/);
    if (!e) {
        throw new Error('URL must start with ' + implementedTransports.join(',')+'');
    }

    options = Object.assign(defaultOptions, options||{});

    let transportLayer;

    if (e) {
        transportLayer = e[1].toLowerCase();
        if (implementedTransports.indexOf(transportLayer)<0) {
            throw new Error('URL does not contain any implemented protocol (' + implementedTransports.join(',')+')');
        }
    }

    if (transportLayer === 'tls') {
        throw new Error(`Protocol ${transportLayer} not yet implemented`);
    }

    if (transportLayer === 'tcp' || transportLayer === 'tls') {
        url = url.replace(/(tcp|tls):\/\//, '').split(':');
        const host = url[0];
        const port = parseInt(url[1]);
        let MyClient;

        switch (transportLayer) {
        case 'tcp':
            switch (options.engine) {
            case 'jsonrpc':
                MyClient = require('./src/tcp/jsonrpc');
                break;
            case 'binary':
                MyClient = require('./src/tcp/binary');
                break;
            default:
                throw new Error('Unknow application layer '+options.engine);
            }
            break;
        case 'tls':
            throw new Error('Transport layer TLS not yet implemented');
        }

        return new MyClient(port, host, options);

    }
}

module.exports = Client;
