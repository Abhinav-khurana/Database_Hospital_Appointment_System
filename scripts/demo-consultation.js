import 'dotenv/config';
import {MongoClient} from 'mongodb';
const uri=process.argv.includes('--local')?'mongodb://127.0.0.1:27019/?directConnection=true':process.env.MONGODB_URI;
if(process.env.DEMO_MODE!=='true')throw new Error('This helper requires DEMO_MODE=true.');
const client=new MongoClient(uri);await client.connect();
try{
  const db=client.db(process.env.DB_NAME||'hospital_appointments');
  if(!await db.collection('patients').findOne({_id:'P01'})||!await db.collection('doctors').findOne({_id:'D01'}))throw new Error('Seed the standard dataset first.');
  const startAt=new Date();startAt.setUTCDate(startAt.getUTCDate()-1);startAt.setUTCHours(9,30,0,0);
  const a={_id:'A_CONSULT_DEMO',patientId:'P01',doctorId:'D01',departmentId:'DEP1',startAt,status:'booked',activeSlot:true,mode:'in_person',synthetic:true};
  await db.collection('appointments').updateOne({_id:a._id},{$setOnInsert:a},{upsert:true});
  console.log('A_CONSULT_DEMO is available in doctor1@example.test schedule. Existing demo record is preserved. This helper adds at most one record.');
}finally{await client.close();}
