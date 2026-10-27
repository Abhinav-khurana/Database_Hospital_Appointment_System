import {build} from 'esbuild';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
rmSync('dist',{recursive:true,force:true});
mkdirSync('dist',{recursive:true});
await build({entryPoints:['client/src/main.jsx'],bundle:true,outdir:'dist',entryNames:'app',minify:true,format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'info'});
writeFileSync('dist/index.html','<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="theme-color" content="#174d42"><title>Hospital Appointment System</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
console.log('Production web assets written to dist/.');
