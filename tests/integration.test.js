import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {MongoClient} from 'mongodb';
import request from 'supertest';
import {seed,makeDataset} from '../database/02_seed.js';
import {provision} from '../database/provision.js';
import {runReport,reportNames} from '../database/05_analytics.js';
import {createApp} from '../server/app.js';
import {available} from '../server/validation.js';
let rs,client,db,app;
const tokens={};
const password='Hospital123!';
const future=(days=10,minutes=0)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+days);d.setUTCHours(9,minutes,0,0);return d.toISOString();};
const auth=(method,path,role='patient1')=>request(app)[method](path).set('Authorization','Bearer '+tokens[role]);
before(async()=>{
  if(process.env.TEST_MONGODB_URI)client=new MongoClient(process.env.TEST_MONGODB_URI);
  else {rs=await MongoMemoryReplSet.create({binary:{version:'7.0.14'},instanceOpts:[{args:['--nounixsocket']}],replSet:{count:1}});client=new MongoClient(rs.getUri());}
  await client.connect();db=client.db('hospital_test_'+Date.now());
  await seed(db,{reference:true});
  app=createApp({db,client,secret:'test-only-secret-that-is-over-32-characters',demoMode:true,rateLimits:false});
}, {timeout:180000});
after(async()=>{if(db)await db.dropDatabase();if(client)await client.close();if(rs)await rs.stop();});
test('Baseline has six collections and exactly 150 documents',async()=>{
  const counts={};for(const c of await db.listCollections().toArray())counts[c.name]=await db.collection(c.name).countDocuments();
  assert.deepEqual(counts,{departments:5,doctors:10,patients:30,appointments:60,prescriptions:15,users:30});
});
test('Reference dataset and all six aggregations match report results',async()=>{
  assert.equal(makeDataset({reference:true}).appointments[30].startAt.toISOString(),'2026-10-04T09:00:00.000Z');
  for(const n of reportNames)assert.ok(Array.isArray(await runReport(db,n)));
  const daily=await runReport(db,'daily-load');assert.equal(daily.length,45);assert.ok(daily.every(r=>r.appointments===1));
  assert.deepEqual((await runReport(db,'department-patients')).map(r=>r.patientCount),[6,6,6,6,6]);
  assert.deepEqual(await runReport(db,'monthly-trend'),[{_id:'2026-10',bookings:45}]);
  assert.deepEqual((await runReport(db,'specializations')).map(r=>[r._id,r.bookings]),[['Cardiology',10],['Dermatology',10],['Orthopaedics',9],['General Medicine',8],['Paediatrics',8]]);
  assert.deepEqual(await runReport(db,'waiting-time'),[{_id:null,averageWaitMinutes:7,consultations:15}]);
  assert.equal((await runReport(db,'appointment-report')).length,60);
});
test('Seeding refuses populated databases without modifying them',async()=>{
  await assert.rejects(seed(db),/empty collections/);assert.equal(await db.collection('appointments').countDocuments(),60);
});
test('Schema rejects invalid date types and occupancy flags',async()=>{
  const a=await db.collection('appointments').findOne({_id:'A031'});
  await assert.rejects(db.collection('appointments').insertOne({...a,_id:'INVALID_DATE',startAt:'tomorrow'}),e=>e.code===121);
  await assert.rejects(db.collection('appointments').insertOne({...a,_id:'INVALID_FLAG',status:'cancelled',activeSlot:true}),e=>e.code===121);
});
test('Index enforces occupied slot uniqueness',async()=>{
  const a=await db.collection('appointments').findOne({_id:'A031'});
  await assert.rejects(db.collection('appointments').insertOne({...a,_id:'DUPLICATE'}),e=>e.code===11000);
  const indexes=await db.collection('appointments').indexes();assert.ok(indexes.some(i=>i.name==='unique_occupied_slot'&&i.unique));
  const plan=await db.collection('appointments').find({patientId:'P01'}).sort({startAt:-1}).explain('executionStats');assert.ok(plan.executionStats.nReturned===2);
});
test('Disabled seed accounts cannot log in',async()=>{assert.equal((await request(app).post('/api/auth/login').send({email:'patient1@example.test',password})).status,401);});
test('Provisioning adds 11 accounts and is repeatable',async()=>{
  await provision(db,password);await provision(db,password);assert.equal(await db.collection('users').countDocuments(),41);
  for(const role of ['patient1','patient2','doctor1','doctor2','admin']){
    const r=await request(app).post('/api/auth/login').send({email:role+'@example.test',password});assert.equal(r.status,200);tokens[role]=r.body.token;assert.ok(tokens[role]);
  }
});
test('Authentication rejects wrong passwords, invalid tokens and injected login input',async()=>{
  assert.equal((await request(app).post('/api/auth/login').send({email:'patient1@example.test',password:'wrong'})).status,401);
  assert.equal((await request(app).get('/api/me')).status,401);
  assert.equal((await request(app).get('/api/me').set('Authorization','Bearer invalid')).status,401);
  assert.equal((await request(app).post('/api/auth/login').send({email:{$ne:null},password})).status,400);
});
test('Patient listings and analytics are restricted by ownership and role',async()=>{
  const r=await auth('get','/api/appointments');assert.equal(r.status,200);assert.equal(r.body.length,2);assert.ok(r.body.every(a=>a.patientId==='P01'));
  assert.equal((await auth('get','/api/analytics/monthly-trend')).status,403);
  assert.equal((await auth('get','/api/patients','doctor1')).status,403);
  assert.equal((await auth('patch','/api/appointments/A032').send({action:'cancel'})).status,404);
});
let created;
test('Create returns doctor department and patient identity from server data',async()=>{
  const r=await auth('post','/api/appointments').send({doctorId:'D01',startAt:future(),mode:'in_person'});assert.equal(r.status,201,r.text);created=r.body;assert.equal(created.patientId,'P01');assert.equal(created.departmentId,'DEP1');
});
test('Create rejects spoofed identity, missing references, past and off-grid times',async()=>{
  const base={doctorId:'D01',startAt:future(11)};
  assert.equal((await auth('post','/api/appointments').send({...base,patientId:'P02'})).status,403);
  assert.equal((await auth('post','/api/appointments').send({...base,doctorId:'MISSING'})).status,400);
  assert.equal((await auth('post','/api/appointments').send({...base,startAt:'2000-01-01T09:00:00Z'})).status,400);
  assert.equal((await auth('post','/api/appointments').send({...base,startAt:future(11,15)})).status,400);
  assert.equal((await auth('post','/api/appointments','doctor1').send(base)).status,403);
});
test('Read slots marks occupied time and handles India date correctly',async()=>{
  const day=created.startAt.slice(0,10);const r=await auth('get','/api/doctors/D01/slots?date='+day);assert.equal(r.status,200);assert.equal(r.body.length,6);assert.equal(r.body.find(s=>s.startAt===created.startAt).available,false);
  assert.equal((await auth('get','/api/doctors/D01/slots?date=2026-02-31')).status,400);
});
test('Concurrent booking requests yield one success and one conflict',async()=>{
  const body={doctorId:'D01',startAt:future(12)};
  const r=await Promise.all([auth('post','/api/appointments').send(body),auth('post','/api/appointments','patient2').send(body)]);
  assert.deepEqual(r.map(x=>x.status).sort(),[201,409]);assert.equal(await db.collection('appointments').countDocuments({doctorId:'D01',startAt:new Date(body.startAt),activeSlot:true}),1);
});
test('Rescheduling collision keeps original appointment unchanged',async()=>{
  const r=await auth('patch','/api/appointments/'+created._id).send({action:'reschedule',startAt:future(12)});assert.equal(r.status,409);
  assert.equal((await db.collection('appointments').findOne({_id:created._id})).startAt.toISOString(),created.startAt);
});
test('Rescheduling succeeds, cancellation frees slot, controlled delete removes record',async()=>{
  assert.equal((await auth('patch','/api/appointments/'+created._id).send({action:'reschedule',startAt:future(10,30)})).status,200);
  assert.equal((await auth('patch','/api/appointments/'+created._id).send({action:'cancel'})).status,200);
  assert.equal((await auth('post','/api/appointments','patient2').send({doctorId:'D01',startAt:future(10,30)})).status,201);
  assert.equal((await auth('delete','/api/appointments/'+created._id)).status,403);
  assert.equal((await auth('delete','/api/appointments/'+created._id,'admin')).status,200);
  assert.equal(await db.collection('appointments').findOne({_id:created._id}),null);
});
test('Completed visits cannot be rescheduled or cancelled',async()=>{
  assert.equal((await auth('patch','/api/appointments/A001').send({action:'cancel'})).status,409);
});
test('Prescription lookup rejects another patient',async()=>{
  assert.equal((await auth('get','/api/prescriptions/RX01')).status,200);
  assert.equal((await auth('get','/api/prescriptions/RX01','patient2')).status,404);
});
let fixture;
test('Consultation completion is atomic and restricted to assigned doctor',async()=>{
  fixture={_id:'CONSULT_TEST',patientId:'P01',doctorId:'D01',departmentId:'DEP1',startAt:new Date(Date.now()-3600000),status:'booked',activeSlot:true,mode:'in_person',synthetic:true};await db.collection('appointments').insertOne(fixture);
  const body={appointmentId:fixture._id,notes:'Integration test consultation',actualStartAt:new Date(Date.now()-1800000).toISOString(),medicines:[{name:'Demo medicine',dosage:'Demo dose',instructions:'Synthetic record only'}]};
  assert.equal((await auth('post','/api/prescriptions','doctor2').send(body)).status,404);
  const r=await auth('post','/api/prescriptions','doctor1').send(body);assert.equal(r.status,201,r.text);
  assert.equal((await db.collection('appointments').findOne({_id:fixture._id})).status,'completed');assert.equal(await db.collection('prescriptions').countDocuments({appointmentId:fixture._id}),1);
  assert.equal((await auth('post','/api/prescriptions','doctor1').send(body)).status,409);
});
test('Failed prescription insertion rolls back appointment completion',async()=>{
  const a={...fixture,_id:'ROLLBACK_TEST',startAt:new Date(Date.now()-7200000)};await db.collection('appointments').insertOne(a);
  await db.collection('prescriptions').insertOne({_id:'ROLLBACK_RX',appointmentId:a._id,notes:'Existing fixture',medicines:[],issuedDate:new Date()});
  const r=await auth('post','/api/prescriptions','doctor1').send({appointmentId:a._id,notes:'Conflict',medicines:[],actualStartAt:new Date(Date.now()-3600000).toISOString()});assert.equal(r.status,409);
  assert.equal((await db.collection('appointments').findOne({_id:a._id})).status,'booked');
});
test('Admin can maintain departments and provision doctor accounts',async()=>{
  const d=await auth('post','/api/departments','admin').send({name:'Neurology',floor:6});assert.equal(d.status,201);
  const dr=await auth('post','/api/doctors','admin').send({name:'Dr. Test',departmentId:d.body._id,specialization:'Neurology',email:'testdoctor@example.test',password});assert.equal(dr.status,201,dr.text);
  assert.equal((await auth('patch','/api/departments/'+d.body._id,'admin').send({name:'Neurology',floor:7,headDoctorId:dr.body._id})).status,200);
  assert.equal((await auth('patch','/api/doctors/'+dr.body._id,'admin').send({active:false})).status,200);
  const q=await auth('get','/api/doctors');assert.ok(q.body.every(d=>d._id!==dr.body._id));
});
test('Patient profile edit rejects role escalation',async()=>{
  assert.equal((await auth('patch','/api/me').send({name:'Updated Patient',contact:{phone:'DEMO',city:'Delhi'},medicalHistory:['Synthetic history']})).status,200);
  assert.equal((await auth('patch','/api/me').send({role:'admin'})).status,400);
});
test('Doctor availability edits preserve bookings and enforce 30 minute slots',async()=>{
  assert.equal((await auth('patch','/api/doctors/D02','doctor1').send({availability:[]})).status,403);
  assert.equal((await auth('patch','/api/doctors/D01','doctor1').send({availability:[{days:[1],startUTC:'09:15',endUTC:'12:00',slotMinutes:30}]})).status,400);
  const r=await auth('patch','/api/doctors/D01','doctor1').send({availability:[{days:[1,2,3,4,5,6,7],startUTC:'09:00',endUTC:'11:00',slotMinutes:30}]});assert.equal(r.status,200);
  assert.equal(available(r.body,new Date('2026-10-10T11:00:00Z')),false);
});
test('Analytics range filters and unknown reports are validated',async()=>{
  assert.deepEqual((await auth('get','/api/analytics/monthly-trend?from=2000-01-01T00:00:00Z&to=2001-01-01T00:00:00Z','admin')).body,[]);
  assert.equal((await auth('get','/api/analytics/unknown','admin')).status,400);
  assert.equal((await auth('get','/api/analytics/monthly-trend?from=bad','admin')).status,400);
});
test('No password hashes are exposed by session endpoint',async()=>{
  const r=await auth('get','/api/me');assert.equal(r.status,200);assert.ok(!JSON.stringify(r.body).includes('passwordHash'));
});
let registered;
const newPatient={name:'Synthetic New Patient',email:'newpatient@example.test',password:'NewPatient123!',dob:'2002-03-13',contact:{phone:'DEMO99',city:'Delhi'}};
test('Patient signup atomically creates a profile and working login',async()=>{
 const r=await request(app).post('/api/auth/register').send(newPatient);assert.equal(r.status,201,r.text);registered=r.body;assert.equal(registered.user.role,'patient');
 const own=await request(app).get('/api/me').set('Authorization','Bearer '+registered.token);assert.equal(own.body.profile.name,newPatient.name);
 assert.ok(!JSON.stringify(r.body).includes('passwordHash'));
 const result=await request(app).post('/api/auth/login').send({email:newPatient.email,password:newPatient.password});assert.equal(result.status,200);
});
test('Duplicate signup rolls back and does not create orphan profiles',async()=>{
 const before=await db.collection('patients').countDocuments();const r=await request(app).post('/api/auth/register').send(newPatient);assert.equal(r.status,409);assert.equal(await db.collection('patients').countDocuments(),before);
});
test('Signup rejects role injection and invalid birth dates',async()=>{
 assert.equal((await request(app).post('/api/auth/register').send({...newPatient,email:'inject@example.test',role:'admin'})).status,400);
 assert.equal((await request(app).post('/api/auth/register').send({...newPatient,email:'bad@example.test',dob:'2001-02-31'})).status,400);
 assert.equal((await request(app).post('/api/auth/register').send({...newPatient,email:'future@example.test',dob:'2099-01-01'})).status,400);
});
test('Password change verifies current password and revokes earlier sessions',async()=>{
 const oldToken=registered.token;
 let r=await request(app).post('/api/auth/password').set('Authorization','Bearer '+oldToken).send({currentPassword:'wrong',newPassword:'ChangedPassword123!'});assert.equal(r.status,403);
 r=await request(app).post('/api/auth/password').set('Authorization','Bearer '+oldToken).send({currentPassword:newPatient.password,newPassword:'ChangedPassword123!'});assert.equal(r.status,200);registered.token=r.body.token;
 assert.equal((await request(app).get('/api/me').set('Authorization','Bearer '+oldToken)).status,401);
 assert.equal((await request(app).get('/api/me').set('Authorization','Bearer '+registered.token)).status,200);
 assert.equal((await request(app).post('/api/auth/login').send({email:newPatient.email,password:newPatient.password})).status,401);
 assert.equal((await request(app).post('/api/auth/login').send({email:newPatient.email,password:'ChangedPassword123!'})).status,200);
});
test('Administrator can register a patient and book on their behalf',async()=>{
 const r=await auth('post','/api/patients','admin').send({...newPatient,email:'admincreated@example.test'});assert.equal(r.status,201);assert.ok(!r.body.token);
 const a=await auth('post','/api/appointments','admin').send({patientId:r.body.profile._id,doctorId:'D02',startAt:future(15)});assert.equal(a.status,201,a.text);assert.equal(a.body.patientId,r.body.profile._id);
 assert.equal((await auth('post','/api/patients').send({...newPatient,email:'notadmin@example.test'})).status,403);
});
test('Doctor profile editing and calendar date validation work',async()=>{
 const d=await auth('patch','/api/doctors/D02','admin').send({name:'Dr. Updated',specialization:'Cardiology'});assert.equal(d.status,200);assert.equal(d.body.name,'Dr. Updated');
 assert.equal((await auth('get','/api/appointments?date=2026-02-31')).status,400);
});
