import { pathToFileURL } from 'node:url';
import { connect } from '../server/db.js';
import { createSchema, collections } from './01_schema.js';
import { createIndexes } from './03_indexes.js';
const pad = (n,w=2) => String(n).padStart(w,'0');
export function makeDataset({reference=false, now=new Date()}={}) {
  const names = ['Cardiology','Dermatology','Orthopaedics','Paediatrics','General Medicine'];
  const doctorNames = ['Aarav Mehta','Nisha Kapoor','Rohan Sethi','Ananya Rao','Vikram Shah','Meera Nair','Kabir Malhotra','Sana Khan','Arjun Batra','Isha Verma'];
  const patientNames = ['Aditi Sharma','Rahul Jain','Priya Singh','Karan Gupta','Neha Das','Riya Bansal','Dev Joshi','Simran Kaur','Aman Patel','Tara Sen'];
  const base = reference ? Date.UTC(2026,9,1) : Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-2);
  const departments = names.map((name,i) => ({_id:'DEP'+(i+1),name,floor:i+1,headDoctorId:'D'+pad(i*2+1)}));
  const doctors = doctorNames.map((name,i) => ({_id:'D'+pad(i+1),name:'Dr. '+name,departmentId:'DEP'+(Math.floor(i/2)+1),specialization:names[Math.floor(i/2)],active:true,availability:[{days:[1,2,3,4,5,6,7],startUTC:'09:00',endUTC:'12:00',slotMinutes:30}]}));
  const users = Array.from({length:30},(_,i)=>({_id:'U'+pad(i+1),email:'patient'+(i+1)+'@example.test',role:'patient',enabled:false}));
  const patients = users.map((u,i)=>({_id:'P'+pad(i+1),userId:u._id,name:patientNames[i%10]+(i>=10?' '+(Math.floor(i/10)+1):''),dob:new Date(Date.UTC(1990+i%15,i%12,1)),contact:{phone:'DEMO'+pad(i+1),city:'Delhi'},medicalHistory:[]}));
  const appointments = Array.from({length:60},(_,i)=>{
    const status = i<15?'completed':i<30?'cancelled':'booked';
    const startAt = new Date(base+Math.floor(i/10)*86400000+9*3600000);
    return {_id:'A'+pad(i+1,3),patientId:'P'+pad(i%30+1),doctorId:'D'+pad(i%10+1),departmentId:'DEP'+(Math.floor((i%10)/2)+1),startAt,status,activeSlot:status!=='cancelled',mode:'in_person',synthetic:true,...(status==='completed'?{actualStartAt:new Date(+startAt+(5+i%5)*60000)}:{})};
  });
  const prescriptions=appointments.slice(0,15).map((a,i)=>({_id:'RX'+pad(i+1),appointmentId:a._id,notes:'Synthetic consultation record for demonstration.',medicines:[],issuedDate:a.actualStartAt}));
  return {departments,doctors,patients,appointments,prescriptions,users};
}
export async function seed(db, options={}) {
  for (const name of collections) if (await db.collection(name).countDocuments()) throw new Error('Seed requires empty collections. Use a new DB_NAME; existing data is never erased.');
  await createSchema(db);
  await createIndexes(db);
  const data=makeDataset(options);
  for(const name of collections) await db.collection(name).insertMany(data[name]);
  return Object.fromEntries(collections.map(n=>[n,data[n].length]));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {client,db}=await connect();
  try { console.log(JSON.stringify(await seed(db,{reference:process.argv.includes('--reference')}),null,2)); }
  finally { await client.close(); }
}
