import { DigUp } from '../electron/digup.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base='D:/Caches/LazyFile/search-verification';const root=path.join(base,'files');await fs.mkdir(root,{recursive:true});
const docs={
 'journey.txt':'We rented a quiet cabin beside an alpine lake in Switzerland. Snowy mountains reflected in the water at sunset. We hiked through pine forests on our summer holiday.',
 'campaign.txt':'Quarterly marketing budget. Autumn product launch. We allocated 24000 dollars to newsletters, paid advertising and a launch event. Campaign conversion targets and spending.',
 'invoice-2026-1042.txt':'Invoice 2026-1042 for office furniture. Four desks and ergonomic chairs. Total 1500 dollars. Payment due November 15.',
 'recipe.txt':'Sourdough bread recipe. Mix flour, water, salt and starter. Ferment overnight and bake in a hot Dutch oven.',
 'garden.txt':'Vegetable garden planting plan. Carrots, tomatoes and basil need different amounts of sunlight and water.',
 'health.txt':'Annual dental appointment reminder. Brush your teeth twice daily and schedule a cleaning.',
 'server.txt':'Database server backup and recovery procedure. PostgreSQL replication and nightly snapshots. Restore the production database after an outage.',
 'music.txt':'Piano practice schedule. Major and minor scales, arpeggios and classical concert repertoire.',
 'lease.txt':'Apartment lease agreement. Monthly rent and security deposit. Pets permitted with permission of landlord.',
 'football.txt':'Football team training schedule. Passing drills, goalkeeper practice and weekend league matches.',
 'physics.txt':'An introduction to quantum physics and the wave function. Electron orbital states and probability distributions.',
 'art.txt':'Oil painting techniques. Mixing pigments, applying underpainting and creating textures with a palette knife.',
 'wedding.txt':'Wedding reception guest list, floral decorations and catering menu for the celebration.',
 'bike.txt':'Bicycle maintenance. Clean the chain and adjust the brakes. Replace punctured tires with an inner tube.',
 'school.txt':'Elementary school mathematics homework: multiplication tables, division and fractions.',
 'novel.txt':'A detective investigates a mysterious disappearance in a foggy harbor town. The witness remembers a red umbrella.'
};
for(const[name,text]of Object.entries(docs))await fs.writeFile(path.join(root,name),text);
const engine=new DigUp({directory:path.join(base,'index'),executable:'D:/Apps/LazyFileRuntime/DigUp/helper/digup.exe',models:'D:/Caches/LazyFile/Models'});
try{
 engine.on('state',s=>{if(['summary','error','waiting'].includes(s.progress?.event))console.log(JSON.stringify(s.progress));});
 await engine.index([root]);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Index timeout')),180000);const finish=s=>{if(!s.indexing){clearTimeout(timer);engine.off('state',finish);resolve();}};engine.on('state',finish);});
 console.log('STATUS',JSON.stringify(await engine.status()));await engine.ask('prewarm');
 for(let i=0;i<60;i++){const s=await engine.ask('status');if(s.encoder==='ready')break;await new Promise(r=>setTimeout(r,1000));}
 const exact=await engine.search('2026-1042',false);assert.ok(exact.hits.some(h=>h.path.endsWith('invoice-2026-1042.txt')));
 const semantic=await engine.search('湖边木屋的夏日度假',true);console.log('SEMANTIC',JSON.stringify(semantic));assert.equal(semantic.meaning,true);assert.ok(semantic.hits.some(h=>h.path.endsWith('journey.txt')));
 console.log('Local exact + cross-language semantic search verified.');
}finally{engine.close();}
