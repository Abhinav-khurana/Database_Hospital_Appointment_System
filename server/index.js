import {connect} from './db.js';
import {createApp} from './app.js';
const {client,db}=await connect();
const app=createApp({db,client,secret:process.env.JWT_SECRET,demoMode:process.env.DEMO_MODE==='true'});
const port=Number(process.env.PORT||4000);
const server=app.listen(port,'127.0.0.1',()=>console.log(`Hospital Appointment System: http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await client.close();process.exit(0);}));
