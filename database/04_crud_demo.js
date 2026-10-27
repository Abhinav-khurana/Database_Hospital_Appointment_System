import {randomUUID} from 'node:crypto';
import {connect} from '../server/db.js';
const {client,db}=await connect();
const id='DEMO_'+randomUUID();
try {
  const startAt=new Date(); startAt.setUTCDate(startAt.getUTCDate()+10); startAt.setUTCHours(9,0,0,0);
  const c=db.collection('appointments');
  console.log('CREATE',await c.insertOne({_id:id,patientId:'P01',doctorId:'D01',departmentId:'DEP1',startAt,status:'booked',activeSlot:true,mode:'in_person',synthetic:true}));
  console.log('READ',await c.findOne({_id:id}));
  console.log('UPDATE',await c.updateOne({_id:id,status:'booked'},{$set:{startAt:new Date(+startAt+1800000)}}));
  console.log('CANCEL',await c.updateOne({_id:id,status:'booked'},{$set:{status:'cancelled',activeSlot:false}}));
  console.log('DELETE',await c.deleteOne({_id:id,status:'cancelled',synthetic:true}));
} finally {await db.collection('appointments').deleteOne({_id:id,synthetic:true});await client.close();}
