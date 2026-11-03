/* eslint-disable */
// Balance and sanity test for the Play now game engine (lib/playNow/engine.ts), played by bots.
//
//   cd frontend && npx tsc lib/playNow/engine.ts --outDir /tmp/pn --module commonjs --target es2020 --strict \
//     && cp scripts/playNowBots.js /tmp/pn/ && node /tmp/pn/playNowBots.js
//
// Three bots (a good player, an average one, and one that only runs) play 250 games each against an equal team, and the good
// bot plays a stronger and a weaker team. Rough targets when last tuned: good bot beats an equal team about 75% of the time
// (about 15-8), the average bot about half the time, run-only is weaker than passing, and stronger teams win clearly more.
// Games always finish, and a bot game takes 90-110 real seconds.
const { FootballGame, PX_PER_YD } = require("./engine.js");
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const DIRS=[[1,0],[1,0.6],[1,-0.6],[0.6,1],[0.6,-1],[0,1],[0,-1]];
function defDist(g,x,y){let m=1e9;for(const d of g.ents) if(d.side==="def"){const q=Math.hypot(d.x-x,d.y-y); if(q<m)m=q;} return m;}
function carry(g, skill) {
  const c=g.ent(g.controlled); let best=null,bs=-1e9;
  for (const [dx,dy] of DIRS) {
    const n=Math.hypot(dx,dy), look=0.45; const px=c.x+(dx/n)*c.speed*look, py=Math.min(164,Math.max(64,c.y+(dy/n)*c.speed*look));
    // distance to defenders after their own movement toward us
    let worst=1e9; for(const d of g.ents) if(d.side==="def"){ const dxp=d.x+(px-d.x)*0.25, dyp=d.y+(py-d.y)*0.25; const q=Math.hypot(dxp-px,dyp-py); if(q<worst)worst=q; }
    const sc=Math.min(worst,40)*skill.avoid + dx/n*skill.forward*10 + (Math.random()-0.5)*skill.noise;
    if(sc>bs){bs=sc;best=[dx,dy];}
  }
  g.setMove(best[0],best[1]);
  const ahead=g.ents.some(d=>d.side==="def"&&Math.hypot(d.x-c.x,d.y-c.y)<22&&d.x>c.x-4);
  if(ahead) g.press("boost");
}
function play(seed,userR,oppR,skill){
  const rng=mulberry(seed); Math.random=mulberry(seed+7);
  const g=new FootballGame({abbr:"U",name:"U",rating:userR},{abbr:"O",name:"O",rating:oppR},rng);
  let steps=0; const snaps={};
  while(g.phase!=="final"&&steps<400000){ steps++;
    if(g.phase==="presnap"){
      if(g.down===4){ if(g.toGo<=2&&g.yardLine>45&&rng()<0.7){} else if(g.canKick){g.press("fieldGoal");g.update(1/60);continue;} else {g.press("punt");g.update(1/60);continue;} }
      g.press(rng()<skill.run?"selectRun":"selectPass"); g.press("snap"); g.update(1/60); continue; }
    if(g.phase==="live"){
      const carrying=g.ball.holder===g.controlled&&(g.caught||g.playKind==="run"||g.pastLine);
      if(g.playKind==="pass"&&!g.ball.flight&&g.ball.holder==="qb"&&!g.pastLine){
        g.setMove(0,0);
        // choose the most open receiver
        let best=null,bs=-1;
        for(const id of ["wr1","wr2","wr3"]){const r=g.ent(id); const open=defDist(g,r.x,r.y); const depth=(r.x-g.losX)/PX_PER_YD; const sc=open+ Math.min(depth,12)*0.8; if(sc>bs){bs=sc;best=[id,open];}}
        if(g.t>skill.hold && (best[1]>skill.openEnough || g.t>skill.hold+1.0)) g.press("throw"+best[0].slice(-1));
        else if(g.t>2.5) { const qb=g.ent("qb"); g.setMove(0.3,qb.y>112?-1:1); }
      } else if(carrying) carry(g,skill); else g.setMove(0,0);
      g.update(1/60); continue; }
    if(g.phase==="halftime") g.press("continue");
    g.update(1/60);
  }
  return {g,steps};
}
const skills={ "good player":{avoid:1.2,forward:2.2,noise:2,run:0.4,hold:1.2,openEnough:18}, "average player":{avoid:0.6,forward:2.6,noise:10,run:0.5,hold:0.9,openEnough:12}, "run only":{avoid:1.0,forward:2.0,noise:3,run:1.0,hold:9,openEnough:99} };
const N=250;
for(const [name,sk] of Object.entries(skills)){
  let u=0,o=0,w=0,t=0,steps=0,comp=0,att=0,sacks=0,ints=0,pyds=0,ryds=0; const dist={};
  for(let i=0;i<N;i++){const r=play(9000+i,1500,1500,sk); const g=r.g; u+=g.score.user;o+=g.score.opp; if(g.score.user>g.score.opp)w++; else if(g.score.user===g.score.opp)t++; steps+=r.steps; comp+=g.stats.passComp; att+=g.stats.passAtt; sacks+=g.stats.sacks; ints+=g.stats.ints; pyds+=g.stats.passYds; ryds+=g.stats.rushYds;}
  console.log(`${name.padEnd(15)} avg ${(u/N).toFixed(1)}-${(o/N).toFixed(1)} | wins ${(100*w/N).toFixed(0)}% ties ${(100*t/N).toFixed(0)}% | real secs ${(steps/60/N).toFixed(0)} | comp ${(100*comp/Math.max(att,1)).toFixed(0)}% | pass yds ${(pyds/N).toFixed(0)} rush yds ${(ryds/N).toFixed(0)} | sacks ${(sacks/N).toFixed(1)} INT ${(ints/N).toFixed(1)}`);
}
for (const [ur,or] of [[1700,1400],[1400,1700]]) { let u=0,o=0,w=0; for(let i=0;i<N;i++){const r=play(7000+i,ur,or,skills["good player"]); u+=r.g.score.user;o+=r.g.score.opp; if(r.g.score.user>r.g.score.opp)w++;} console.log(`good player, rating ${ur} vs ${or}: avg ${(u/N).toFixed(1)}-${(o/N).toFixed(1)}, wins ${(100*w/N).toFixed(0)}%`); }
