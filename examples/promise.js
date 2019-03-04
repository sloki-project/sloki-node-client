const Client = require('../');

const clientTcp = new Client('tcp://127.0.0.1:6370');
const clientTls = new Client('tls://127.0.0.1:6371');

(async () => {
    try {
        await clientTcp.connect();
        await clientTcp.loadDatabase({ db:'myTestDatabase' });
        await clientTcp.insert({ col:'devices', doc:{ 'foo':'bar' } });
        const devices = await clientTcp.find({ col:'devices' });
        await clientTcp.saveDatabase();
        await clientTcp.close();

        console.log(devices);

    } catch(e) {
        console.log(e);
        clientTcp.close();
    }
})();


(async () => {
    try {
        await clientTls.connect();
        await clientTls.loadDatabase({ db:'myTestDatabase' });
        await clientTls.insert({ col:'devices', doc:{ 'foo':'bar' } });
        const devices = await clientTls.find({ col:'devices' });
        await clientTls.removeCollection({ c:'devices' });
        await clientTls.saveDatabase();
        await clientTls.close();

        console.log(devices);

    } catch(e) {
        console.log(e);
        clientTls.close();
    }
})();
