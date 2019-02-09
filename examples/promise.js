const Client = require('../')

const client = new Client('tcp://127.0.0.1:6370');

client.init = async () => {
    try {
        await client.connect();
        await client.loadDatabase('myTestDatabase');
        await client.insert('devices',{'foo':'bar'});
        const devices = await client.find('devices');
        console.log(devices);
    } catch(e) {
        console.log(e);
        client.close();
    }
    await client.close();
}


client.init();
