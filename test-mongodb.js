const {MongoClient} = require('mongodb');

async function testMongoDB() {
    try {
        console.log('Attempting to connect to MongoDB...');
        const client = new MongoClient('mongodb://localhost:27017');
        await client.connect();

        console.log('Connected to MongoDB successfully!');

        const db = client.db('test');
        const collection = db.collection('test');

        console.log('Inserting a test document...');
        const result = await collection.insertOne({test: true, date: new Date()});
        console.log('Document inserted:', result.insertedId);

        console.log('Querying the document...');
        const doc = await collection.findOne({test: true});
        console.log('Found document:', doc);

        console.log('Cleaning up...');
        await collection.deleteOne({test: true});

        await client.close();
        console.log('MongoDB test completed successfully!');
    } catch (error) {
        console.error('MongoDB test failed:', error);
    }
}

testMongoDB();