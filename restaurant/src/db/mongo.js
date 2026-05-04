import { MongoClient } from 'mongodb';
import { log } from '../logger.js';

let client;
let db;

export async function connectMongo(uri) {
  if (!uri || !String(uri).trim()) return null;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.MONGODB_DB_NAME || 'catchtable');
  log('info', 'mongo_connected', { db: db.databaseName });
  return db;
}

export function getDb() {
  return db;
}

export async function closeMongo() {
  if (client) await client.close();
}
