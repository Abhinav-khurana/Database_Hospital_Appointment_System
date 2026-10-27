import 'dotenv/config';
import { MongoClient } from 'mongodb';
export async function connect() {
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/?directConnection=true', { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  return { client, db: client.db(process.env.DB_NAME || 'hospital_appointments') };
}
