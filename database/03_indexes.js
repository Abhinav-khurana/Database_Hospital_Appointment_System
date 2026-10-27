export async function createIndexes(db) {
  await db.collection('appointments').createIndex({doctorId:1,startAt:1}, {name:'unique_occupied_slot',unique:true,partialFilterExpression:{activeSlot:true}});
  await db.collection('appointments').createIndex({patientId:1,startAt:-1}, {name:'patient_history'});
  await db.collection('users').createIndex({email:1}, {unique:true,name:'unique_email'});
  await db.collection('prescriptions').createIndex({appointmentId:1}, {unique:true,name:'one_prescription'});
  await db.collection('doctors').createIndex({departmentId:1,active:1}, {name:'department_doctors'});
  await db.collection('patients').createIndex({userId:1}, {unique:true,name:'patient_account'});
  await db.collection('doctors').createIndex({userId:1}, {unique:true,name:'doctor_account',partialFilterExpression:{userId:{$type:'string'}}});
}
