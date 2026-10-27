import { pathToFileURL } from 'node:url';
import { connect } from '../server/db.js';
export const reportNames=['daily-load','department-patients','monthly-trend','specializations','waiting-time','appointment-report'];
export function pipeline(name, {from,to}={}) {
  const match={status:{$ne:'cancelled'}};
  const range={}; if(from) range.$gte=new Date(from); if(to) range.$lt=new Date(to);
  if(Object.keys(range).length) match.startAt=range;
  const first={$match:match};
  const pipelines={
    'daily-load':[first,{$group:{_id:{doctor:'$doctorId',day:{$dateToString:{format:'%Y-%m-%d',date:'$startAt',timezone:'Asia/Kolkata'}}},appointments:{$sum:1}}},{$sort:{'_id.day':1,'_id.doctor':1}}],
    'department-patients':[first,{$group:{_id:'$departmentId',patients:{$addToSet:'$patientId'}}},{$project:{patientCount:{$size:'$patients'}}},{$sort:{_id:1}}],
    'monthly-trend':[first,{$group:{_id:{$dateToString:{format:'%Y-%m',date:'$startAt',timezone:'Asia/Kolkata'}},bookings:{$sum:1}}},{$sort:{_id:1}}],
    specializations:[first,{$lookup:{from:'doctors',localField:'doctorId',foreignField:'_id',as:'doctor'}},{$unwind:'$doctor'},{$group:{_id:'$doctor.specialization',bookings:{$sum:1}}},{$sort:{bookings:-1,_id:1}}],
    'waiting-time':[{$match:{...match,status:'completed',actualStartAt:{$type:'date'}}},{$project:{waitMinutes:{$divide:[{$subtract:['$actualStartAt','$startAt']},60000]}}},{$match:{waitMinutes:{$gte:0}}},{$group:{_id:null,averageWaitMinutes:{$avg:'$waitMinutes'},consultations:{$sum:1}}}],
    'appointment-report':[{$match:Object.keys(range).length?{startAt:range}:{}},{$lookup:{from:'patients',localField:'patientId',foreignField:'_id',as:'patient'}},{$unwind:'$patient'},{$lookup:{from:'doctors',localField:'doctorId',foreignField:'_id',as:'doctor'}},{$unwind:'$doctor'},{$project:{_id:1,startAt:1,status:1,patientName:'$patient.name',doctorName:'$doctor.name'}},{$sort:{startAt:1,_id:1}}]
  };
  if(!pipelines[name]) throw new Error('Unknown report');
  return pipelines[name];
}
export const runReport=(db,name,range={})=>db.collection('appointments').aggregate(pipeline(name,range)).toArray();
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const {client,db}=await connect();
  try { for(const name of reportNames) console.log(JSON.stringify({report:name,rows:await runReport(db,name)},null,2)); }
  finally {await client.close();}
}
