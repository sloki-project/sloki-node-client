const version = require('./package.json').version;

const implementedTransports = ['tcp','tls'];
const defaultOptions = {
    applicationLayer:'jayson'
}

function decorate(myClient) {
    myClient.getClientVersion = () => {
        return version;
    }
    return myClient;
}

function Client(url, options) {
    let client;
    let e = url.match(/^([^:]+)/);
    if (!e) {
        throw new Error('URL must start with ' + implementedProtocols.join(',')+'');
        process.exit(-1);
        return;
    }

    options = Object.assign(defaultOptions, options||{});

    let transportLayer;

    if (e) {
        transportLayer = e[1].toLowerCase();
        if (implementedTransports.indexOf(transportLayer)<0) {
            throw new Error('URL does not contain any implemented protocol (' + implementedTransports.join(',')+')');
            return null;
        }
    }

    if (transportLayer === "tls") {
        throw new Error('Protocol '+proto+' not yet implemented');
        process.exit(-1);
    }

    if (transportLayer === "tcp" || transportLayer === "tls") {
        url = url.replace(/(tcp|tls):\/\//,'').split(':');
        let host = url[0];
        let port = parseInt(url[1]);
        let myClient;

        switch (transportLayer) {
            case "tcp":
                switch (options.applicationLayer) {
                    case "jayson":
                        MyClient = require('./src/tcpJayson');
                        return decorate(new MyClient(port, host, options));
                        break;
                    default:
                        throw new Error('Unknow application layer '+options.applicationLayer);
                }
            case "tls":
                throw new Error('Transport layer TLS not yet implemented');
        }
    }
}

module.exports = Client;
