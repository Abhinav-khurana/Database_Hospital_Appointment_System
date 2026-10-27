export const collections = ['departments', 'doctors', 'patients', 'appointments', 'prescriptions', 'users'];
const str = { bsonType: 'string' };
const date = { bsonType: 'date' };
const bool = { bsonType: 'bool' };
const object = (required, properties) => ({ $jsonSchema: { bsonType: 'object', required, properties: { _id: str, ...properties } } });
export async function createSchema(db) {
  const validators = {
    departments: object(['_id','name','floor'], { name: str, floor: { bsonType: ['int','double'], minimum: 0 }, headDoctorId: str }),
    doctors: object(['_id','name','departmentId','specialization','active','availability'], { name: str, userId: str, departmentId: str, specialization: str, active: bool, availability: { bsonType:'array' } }),
    patients: object(['_id','userId','name','dob','contact','medicalHistory'], { userId: str, name: str, dob: date, contact: { bsonType:'object' }, medicalHistory: { bsonType:'array' } }),
    appointments: { $and: [object(['_id','patientId','doctorId','departmentId','startAt','status','activeSlot','mode'], { patientId: str, doctorId: str, departmentId: str, startAt: date, actualStartAt: date, status: { enum:['booked','completed','cancelled'] }, activeSlot: bool, mode: { enum:['in_person','teleconsultation'] }, synthetic: bool }), { $or:[{status:'cancelled',activeSlot:false},{status:{$in:['booked','completed']},activeSlot:true}] }] },
    prescriptions: object(['_id','appointmentId','notes','medicines','issuedDate'], { appointmentId: str, notes: str, medicines: { bsonType:'array' }, issuedDate: date }),
    users: object(['_id','email','role','enabled'], { email: str, role: { enum:['patient','doctor','admin'] }, enabled: bool, passwordHash: str })
  };
  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));
  for (const name of collections) {
    if (existing.has(name)) await db.command({ collMod:name, validator:validators[name], validationLevel:'strict', validationAction:'error' });
    else await db.createCollection(name, { validator:validators[name], validationLevel:'strict', validationAction:'error' });
  }
}
