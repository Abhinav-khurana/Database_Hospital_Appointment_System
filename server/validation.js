import {z} from 'zod';
export const fail=(status,message)=>Object.assign(new Error(message),{status});
export const text=z.string().trim().min(1).max(160);
export const id=text.max(80);
export const dateTime=z.string().datetime({offset:true});
export const booking=z.object({doctorId:id,startAt:dateTime,mode:z.enum(['in_person','teleconsultation']).default('in_person'),patientId:id.optional()}).strict();
export const change=z.union([z.object({action:z.literal('reschedule'),startAt:dateTime}).strict(),z.object({action:z.literal('cancel')}).strict()]);
export const medicine=z.object({name:text,dosage:text.max(100),instructions:z.string().trim().max(300).default('')}).strict();
export const prescription=z.object({appointmentId:id,notes:z.string().trim().min(1).max(3000),medicines:z.array(medicine).max(30).default([]),actualStartAt:dateTime}).strict();
export const login=z.object({email:z.string().email().max(200).transform(s=>s.toLowerCase()),password:z.string().min(1).max(128)}).strict();
export const contact=z.object({phone:z.string().trim().max(30),city:text}).strict();
export const profile=z.object({name:text,contact,medicalHistory:z.array(z.string().trim().min(1).max(300)).max(30).optional()}).strict();
export const availability=z.array(z.object({days:z.array(z.number().int().min(1).max(7)).min(1).max(7),startUTC:z.string().regex(/^([01]\d|2[0-3]):[03]0$/),endUTC:z.string().regex(/^([01]\d|2[0-3]):[03]0$/),slotMinutes:z.literal(30)}).strict().refine(w=>w.endUTC>w.startUTC,'End time must follow start time')).min(1).max(7);
export function available(doctor,start) {
  if(start.getUTCSeconds() || start.getUTCMilliseconds()) return false;
  const m=start.getUTCHours()*60+start.getUTCMinutes();
  const day=start.getUTCDay()||7;
  return doctor.availability.some(w=>{
    const [h,a]=w.startUTC.split(':').map(Number),[j,b]=w.endUTC.split(':').map(Number);
    return w.days.includes(day)&&m>=h*60+a&&m+30<=j*60+b&&(m-(h*60+a))%30===0;
  });
}
export function futureSlot(doctor,value) {
  const start=new Date(value);
  if(!Number.isFinite(+start)||start<=new Date()) throw fail(400,'Choose a future appointment time.');
  if(!doctor.active||!available(doctor,start)) throw fail(400,'This time is outside the doctor’s available slots.');
  return start;
}

export const newPassword=z.string().min(10).max(72).refine(v=>Buffer.byteLength(v,'utf8')<=72,'Password must be at most 72 UTF-8 bytes.');
export const registration=z.object({name:text,email:z.string().trim().email().max(200).transform(s=>s.toLowerCase()),password:newPassword,dob:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v&&d<=new Date()&&d.getUTCFullYear()>=1900;},'Enter a valid birth date between 1900 and today.'),contact}).strict();
