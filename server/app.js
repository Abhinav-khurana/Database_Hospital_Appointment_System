import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {runReport, reportNames} from '../database/05_analytics.js';
import {fail,text,id,booking,change,prescription,login,profile,availability,available,futureSlot,registration,newPassword} from './validation.js';
const uid=prefix=>prefix+'_'+randomUUID();
const publicUser=u=>({id:u._id,email:u.email,role:u.role});
export function createApp({db,client,secret,demoMode=false,rateLimits=true}) {
  if(!secret || secret.length<32) throw new Error('JWT_SECRET must be at least 32 characters. Run npm run setup.');
  const app=express();
  app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:{directives:{'style-src':["'self'","'unsafe-inline'"],'img-src':["'self'",'data:'],'script-src':["'self'"], 'upgrade-insecure-requests':null}}}));
  app.use(express.json({limit:'100kb'}));
  app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const auth=async(req,res,next)=>{
    try {
      const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if(!token) throw fail(401,'Please sign in.');
      let decoded;
      try{decoded=jwt.verify(token,secret,{algorithms:['HS256'],issuer:'hospital-appointments',audience:'hospital-web'});}catch{throw fail(401,'Your session has expired. Please sign in again.');}
      const user=await db.collection('users').findOne({_id:decoded.sub,enabled:true});
      if(!user) throw fail(401,'Account is unavailable.');
      if((decoded.ver??0)!==(user.tokenVersion??0))throw fail(401,'Your session has expired. Please sign in again.');
      req.user=user;
      if(user.role==='patient') req.patient=await db.collection('patients').findOne({userId:user._id});
      if(user.role==='doctor') req.doctor=await db.collection('doctors').findOne({userId:user._id,active:true});
      if((user.role==='patient'&&!req.patient)||(user.role==='doctor'&&!req.doctor)) throw fail(403,'Profile is unavailable.');
      next();
    }catch(e){next(e);}
  };
  const roles=(...allowed)=>(req,res,next)=>allowed.includes(req.user.role)?next():next(fail(403,'This action is not allowed for your account.'));
  const scope=req=>req.user.role==='patient'?{patientId:req.patient._id}:req.user.role==='doctor'?{doctorId:req.doctor._id}:{};
  const getAppointment=async(req)=>{
    const a=await db.collection('appointments').findOne({_id:id.parse(req.params.id),...scope(req)});
    if(!a) throw fail(404,'Appointment not found.');
    return a;
  };
  app.get('/api/health',async(req,res)=>{await db.command({ping:1});res.json({status:'ok'});});
  app.get('/api/config',(req,res)=>res.json({demoMode,timeZone:'Asia/Kolkata'}));
  const limiter=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many login attempts. Please try again later.'}});
  app.post('/api/auth/login',...(rateLimits?[limiter]:[]),async(req,res)=>{
    const input=login.parse(req.body);
    const u=await db.collection('users').findOne({email:input.email,enabled:true});
    if(!u?.passwordHash||!await bcrypt.compare(input.password,u.passwordHash)) throw fail(401,'Invalid email or password.');
    const token=jwt.sign({ver:u.tokenVersion??0},secret,{subject:u._id,expiresIn:'2h',algorithm:'HS256',issuer:'hospital-appointments',audience:'hospital-web'});
    res.json({token,user:publicUser(u)});
  });
  const issueToken=u=>jwt.sign({ver:u.tokenVersion??0},secret,{subject:u._id,expiresIn:'2h',algorithm:'HS256',issuer:'hospital-appointments',audience:'hospital-web'});
  const addPatient=async body=>{
    const input=registration.parse(body);
    const user={_id:uid('U'),email:input.email,role:'patient',enabled:true,passwordHash:await bcrypt.hash(input.password,12),tokenVersion:0};
    const patient={_id:uid('P'),userId:user._id,name:input.name,dob:new Date(input.dob+'T00:00:00Z'),contact:input.contact,medicalHistory:[]};
    const session=client.startSession();
    try{await session.withTransaction(async()=>{await db.collection('users').insertOne(user,{session});await db.collection('patients').insertOne(patient,{session});});}finally{await session.endSession();}
    return {user,patient};
  };
  app.post('/api/auth/register',...(rateLimits?[limiter]:[]),async(req,res)=>{
    const {user,patient}=await addPatient(req.body);res.status(201).json({token:issueToken(user),user:publicUser(user),profile:patient});
  });
  app.post('/api/patients',auth,roles('admin'),async(req,res)=>{
    const {user,patient}=await addPatient(req.body);res.status(201).json({user:publicUser(user),profile:patient});
  });
  app.post('/api/auth/password',auth,async(req,res)=>{
    const input=z.object({currentPassword:z.string().min(1).max(128),newPassword}).strict().parse(req.body);
    if(!await bcrypt.compare(input.currentPassword,req.user.passwordHash))throw fail(403,'Current password is incorrect.');
    if(input.currentPassword===input.newPassword)throw fail(400,'Choose a different new password.');
    const user=await db.collection('users').findOneAndUpdate({_id:req.user._id,passwordHash:req.user.passwordHash},{$set:{passwordHash:await bcrypt.hash(input.newPassword,12)},$inc:{tokenVersion:1}},{returnDocument:'after'});
    if(!user)throw fail(409,'Account changed; sign in again.');
    res.json({token:issueToken(user),message:'Password updated. Other sessions have been signed out.'});
  });
  app.get('/api/me',auth,(req,res)=>res.json({user:publicUser(req.user),profile:req.patient||req.doctor||null}));
  app.patch('/api/me',auth,roles('patient'),async(req,res)=>{
    const input=profile.parse(req.body);
    await db.collection('patients').updateOne({_id:req.patient._id},{$set:input});
    res.json(await db.collection('patients').findOne({_id:req.patient._id}));
  });
  app.get('/api/departments',auth,async(req,res)=>res.json(await db.collection('departments').find().sort({name:1}).toArray()));
  app.get('/api/doctors',auth,async(req,res)=>{
    const q=req.user.role==='admin'?{}:{active:true};
    if(req.query.departmentId) q.departmentId=id.parse(req.query.departmentId);
    res.json(await db.collection('doctors').find(q,{projection:{userId:0}}).sort({name:1}).toArray());
  });
  app.get('/api/doctors/:id/slots',auth,async(req,res)=>{
    const d=await db.collection('doctors').findOne({_id:id.parse(req.params.id),active:true});
    if(!d) throw fail(404,'Doctor not found.');
    const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
    const start=new Date(day+'T00:00:00+05:30');
    if(!Number.isFinite(+start)||new Date(+start+19800000).toISOString().slice(0,10)!==day) throw fail(400,'Invalid date.');
    const end=new Date(+start+86400000);
    const occupied=new Set((await db.collection('appointments').find({doctorId:d._id,activeSlot:true,startAt:{$gte:start,$lt:end}},{projection:{startAt:1}}).toArray()).map(a=>+a.startAt));
    const slots=[];
    for(let t=+start;t<+end;t+=1800000){const date=new Date(t);if(date>new Date()&&available(d,date)) slots.push({startAt:date,available:!occupied.has(t)});}
    res.json(slots);
  });
  app.get('/api/appointments',auth,async(req,res)=>{
    const q=scope(req);
    if(req.query.status) q.status=z.enum(['booked','completed','cancelled']).parse(req.query.status);
    if(req.query.date){const d=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);const start=new Date(d+'T00:00:00+05:30');if(!Number.isFinite(+start)||new Date(+start+19800000).toISOString().slice(0,10)!==d) throw fail(400,'Invalid date.');q.startAt={$gte:start,$lt:new Date(+start+86400000)};}
    const rows=await db.collection('appointments').aggregate([{$match:q},{$sort:{startAt:-1}},{$lookup:{from:'patients',localField:'patientId',foreignField:'_id',as:'patient'}},{$lookup:{from:'doctors',localField:'doctorId',foreignField:'_id',as:'doctor'}},{$lookup:{from:'prescriptions',localField:'_id',foreignField:'appointmentId',as:'prescription'}},{$project:{_id:1,patientId:1,doctorId:1,departmentId:1,startAt:1,status:1,mode:1,actualStartAt:1,synthetic:1,patientName:{$arrayElemAt:['$patient.name',0]},doctorName:{$arrayElemAt:['$doctor.name',0]},prescription:{$arrayElemAt:['$prescription',0]}}}]).toArray();
    res.json(rows);
  });
  app.post('/api/appointments',auth,roles('patient','admin'),async(req,res)=>{
    const input=booking.parse(req.body);
    const patientId=req.user.role==='patient'?req.patient._id:input.patientId;
    if(req.user.role==='patient' && input.patientId && input.patientId!==patientId) throw fail(403,'You can only book for yourself.');
    const patient=patientId&&await db.collection('patients').findOne({_id:patientId});
    const doctor=await db.collection('doctors').findOne({_id:input.doctorId,active:true});
    if(!patient||!doctor) throw fail(400,'Choose a valid patient and doctor.');
    if(!await db.collection('departments').findOne({_id:doctor.departmentId})) throw fail(400,'Doctor department is unavailable.');
    const a={_id:uid('A'),patientId,doctorId:doctor._id,departmentId:doctor.departmentId,startAt:futureSlot(doctor,input.startAt),status:'booked',activeSlot:true,mode:input.mode,synthetic:demoMode};
    await db.collection('appointments').insertOne(a);res.status(201).json(a);
  });
  app.patch('/api/appointments/:id',auth,roles('patient','admin'),async(req,res)=>{
    const input=change.parse(req.body);const a=await getAppointment(req);
    if(a.status!=='booked') throw fail(409,'Only booked appointments can be changed.');
    let update={status:'cancelled',activeSlot:false};
    if(input.action==='reschedule'){
      const d=await db.collection('doctors').findOne({_id:a.doctorId});
      if(!d)throw fail(400,'Doctor is unavailable.');
      update={startAt:futureSlot(d,input.startAt)};
    }
    const result=await db.collection('appointments').updateOne({_id:a._id,status:'booked'},{$set:update});
    if(!result.matchedCount) throw fail(409,'Appointment changed. Refresh and try again.');
    res.json(await db.collection('appointments').findOne({_id:a._id}));
  });
  app.delete('/api/appointments/:id',auth,roles('admin'),async(req,res)=>{
    if(!demoMode) throw fail(403,'Hard deletion is disabled outside demonstration mode.');
    const a=await getAppointment(req);
    if(a.status!=='cancelled'||!a.synthetic)throw fail(409,'Only cancelled synthetic appointments can be deleted.');
    const r=await db.collection('appointments').deleteOne({_id:a._id,status:'cancelled',synthetic:true});
    if(!r.deletedCount)throw fail(409,'Appointment changed.');
    res.json({deletedCount:r.deletedCount});
  });
  app.post('/api/prescriptions',auth,roles('doctor'),async(req,res)=>{
    const input=prescription.parse(req.body);
    const a=await db.collection('appointments').findOne({_id:input.appointmentId,doctorId:req.doctor._id});
    if(!a)throw fail(404,'Appointment not found.');
    if(a.status!=='booked')throw fail(409,'Only a booked consultation can be completed.');
    const actual=new Date(input.actualStartAt);
    if(actual<a.startAt||actual>new Date())throw fail(400,'Actual start must be between the scheduled time and now.');
    const rx={_id:uid('RX'),appointmentId:a._id,notes:input.notes,medicines:input.medicines,issuedDate:actual};
    const session=client.startSession();
    try{
      await session.withTransaction(async()=>{
        const r=await db.collection('appointments').updateOne({_id:a._id,doctorId:req.doctor._id,status:'booked'},{$set:{status:'completed',activeSlot:true,actualStartAt:actual}},{session});
        if(!r.matchedCount)throw fail(409,'Appointment has already changed.');
        await db.collection('prescriptions').insertOne(rx,{session});
      });
    }finally{await session.endSession();}
    res.status(201).json(rx);
  });
  app.get('/api/prescriptions/:id',auth,async(req,res)=>{
    const rx=await db.collection('prescriptions').findOne({_id:id.parse(req.params.id)});
    if(!rx||!await db.collection('appointments').findOne({_id:rx.appointmentId,...scope(req)}))throw fail(404,'Prescription not found.');
    res.json(rx);
  });
  app.get('/api/analytics/:report',auth,roles('admin'),async(req,res)=>{
    const name=z.enum(reportNames).parse(req.params.report);const range={};
    for(const key of ['from','to'])if(req.query[key])range[key]=z.string().datetime({offset:true}).parse(req.query[key]);
    if(range.from&&range.to&&new Date(range.from)>=new Date(range.to))throw fail(400,'Invalid reporting range.');
    res.json(await runReport(db,name,range));
  });
  app.get('/api/admin/summary',auth,roles('admin'),async(req,res)=>{
    const counts={};for(const n of ['departments','doctors','patients','appointments','prescriptions','users'])counts[n]=await db.collection(n).countDocuments();
    const statuses=await db.collection('appointments').aggregate([{$group:{_id:'$status',count:{$sum:1}}}]).toArray();
    res.json({counts,statuses,indexes:await db.collection('appointments').indexes()});
  });
  app.get('/api/patients',auth,roles('admin'),async(req,res)=>res.json(await db.collection('patients').find().sort({name:1}).toArray()));
  app.post('/api/departments',auth,roles('admin'),async(req,res)=>{
    const input=z.object({name:text,floor:z.number().int().min(0).max(100)}).strict().parse(req.body);
    const d={_id:uid('DEP'),...input};await db.collection('departments').insertOne(d);res.status(201).json(d);
  });
  app.patch('/api/departments/:id',auth,roles('admin'),async(req,res)=>{
    const input=z.object({name:text,floor:z.number().int().min(0).max(100),headDoctorId:id.optional()}).strict().parse(req.body);
    if(input.headDoctorId&&!await db.collection('doctors').findOne({_id:input.headDoctorId,departmentId:req.params.id,active:true}))throw fail(400,'Head doctor must belong to this department.');
    const r=await db.collection('departments').findOneAndUpdate({_id:id.parse(req.params.id)},{$set:input},{returnDocument:'after'});
    if(!r)throw fail(404,'Department not found.');res.json(r);
  });
  app.post('/api/doctors',auth,roles('admin'),async(req,res)=>{
    const input=z.object({name:text,departmentId:id,specialization:text,email:z.string().email().max(200).transform(s=>s.toLowerCase()),password:newPassword}).strict().parse(req.body);
    if(!await db.collection('departments').findOne({_id:input.departmentId}))throw fail(400,'Department not found.');
    const user={_id:uid('U'),email:input.email,role:'doctor',enabled:true,passwordHash:await bcrypt.hash(input.password,12)};
    const doctor={_id:uid('D'),name:input.name,departmentId:input.departmentId,specialization:input.specialization,userId:user._id,active:true,availability:[{days:[1,2,3,4,5,6,7],startUTC:'09:00',endUTC:'12:00',slotMinutes:30}]};
    const session=client.startSession();try{await session.withTransaction(async()=>{await db.collection('users').insertOne(user,{session});await db.collection('doctors').insertOne(doctor,{session});});}finally{await session.endSession();}
    res.status(201).json(doctor);
  });
  app.patch('/api/doctors/:id',auth,roles('admin','doctor'),async(req,res)=>{
    if(req.user.role==='doctor'&&req.doctor._id!==req.params.id)throw fail(403,'You can only edit your own availability.');
    const schema=req.user.role==='doctor'?z.object({availability}).strict():z.object({name:text.optional(),specialization:text.optional(),active:z.boolean().optional(),availability:availability.optional()}).strict();
    const input=schema.parse(req.body);
    const r=await db.collection('doctors').findOneAndUpdate({_id:id.parse(req.params.id)},{$set:input},{returnDocument:'after'});
    if(!r)throw fail(404,'Doctor not found.');res.json(r);
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'Endpoint not found.'}));
  const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
  if(existsSync(dist)) {app.use(express.static(dist));app.get('/{*path}',(req,res)=>res.sendFile(path.join(dist,'index.html')));}
  app.use((err,req,res,next)=>{
    if(err instanceof z.ZodError)return res.status(400).json({error:err.issues.map(i=>[i.path.join('.'),i.message].filter(Boolean).join(': ')).join('; ')});
    if(err.code===11000)return res.status(409).json({error:err.message.includes('unique_occupied_slot')?'This slot was just booked. Choose another time.':'A record with those unique details already exists.'});
    if(err.code===121)return res.status(400).json({error:'The document does not satisfy database validation.'});
    if(err.code===20)return res.status(503).json({error:'This operation requires a MongoDB replica set. Follow START_HERE.md.'});
    const status=err.status||500;if(status>=500)console.error(err.message);
    res.status(status).json({error:status>=500?'The operation could not be completed. Check the server connection.':err.message});
  });
  return app;
}
