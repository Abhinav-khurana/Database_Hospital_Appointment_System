import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { connect } from '../server/db.js';
export async function provision(db, password) {
  if (!password || password.length<10) throw new Error('Demo password must contain at least 10 characters.');
  if (await db.collection('patients').countDocuments()!==30 || await db.collection('doctors').countDocuments()!==10) throw new Error('Provisioning requires the baseline seed.');
  const passwordHash=await bcrypt.hash(password,12);
  for (const u of await db.collection('users').find({role:'patient',enabled:false}).toArray()) await db.collection('users').updateOne({_id:u._id},{$set:{passwordHash,enabled:true}});
  for (let i=1;i<=10;i++) {
    const id='UD'+String(i).padStart(2,'0');
    await db.collection('users').updateOne({_id:id},{$setOnInsert:{email:'doctor'+i+'@example.test',role:'doctor',enabled:true,passwordHash}},{upsert:true});
    await db.collection('doctors').updateOne({_id:'D'+String(i).padStart(2,'0')},{$set:{userId:id}});
  }
  await db.collection('users').updateOne({_id:'ADMIN'},{$setOnInsert:{email:'admin@example.test',role:'admin',enabled:true,passwordHash}},{upsert:true});
  return {users:await db.collection('users').countDocuments(),message:'Accounts provisioned. Existing enabled account passwords are preserved.'};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if(process.env.DEMO_MODE!=='true') throw new Error('Demo provisioning requires DEMO_MODE=true.');
  const {client,db}=await connect();
  try { console.log(await provision(db,process.env.DEMO_PASSWORD || 'Hospital123!')); }
  finally { await client.close(); }
}
