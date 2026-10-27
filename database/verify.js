import {connect} from '../server/db.js';
import {collections} from './01_schema.js';
const {client,db}=await connect();
try {
  const counts={};for(const n of collections) counts[n]=await db.collection(n).countDocuments();
  const indexes=await db.collection('appointments').indexes();
  const plan=await db.collection('appointments').find({patientId:'P01'}).sort({startAt:-1}).explain('executionStats');
  console.log(JSON.stringify({database:db.databaseName,counts,total:Object.values(counts).reduce((a,b)=>a+b,0),indexes,plan},null,2));
} finally {await client.close();}
