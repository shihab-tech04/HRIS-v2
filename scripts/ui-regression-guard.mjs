#!/usr/bin/env node
/**
 * UX Agent v8.3: protect accepted screens when their dependencies change.
 * This is an impact/evidence gate, NOT an image-comparison engine or approval.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const args=process.argv.slice(2);
const has=x=>args.includes(x), arg=x=>args[args.indexOf(x)+1];
const git=(...x)=>execFileSync("git",x,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
const norm=x=>x.replaceAll("\\","/").replace(/^\.\//,"");
const file=x=>fs.readFileSync(x,"utf8");
const source=x=>/\.(?:ts|tsx|js|jsx|css)$/.test(x)&&!/\.(?:test|spec)\.[jt]sx?$/.test(x);
function reverseGraph(files,contents={}){
  const all=new Set(files), rev=new Map();
  for(const p of files){
    if(!source(p))continue;
    const s=contents[p]??(fs.existsSync(p)?file(p):"");
    const imports=[...s.matchAll(/\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)];
    for(const m of imports){
      if(!m[1].startsWith("."))continue;
      const root=norm(path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1])));
      const dep=[root,root+".ts",root+".tsx",root+".js",root+".jsx",root+".css",root+"/index.ts",root+"/index.tsx"].find(x=>all.has(x));
      if(!dep)continue;
      if(!rev.has(dep))rev.set(dep,new Set());
      rev.get(dep).add(p);
    }
  }
  return rev;
}
function impacted(changes,rev,contract){
  const visited=new Set(changes),queue=[...changes];
  for(let i=0;i<queue.length;i++)for(const c of rev.get(queue[i])??[])if(!visited.has(c)){visited.add(c);queue.push(c)}
  const global=changes.some(p=>(contract.globalStylePatterns??[]).some(x=>new RegExp(x).test(p)));
  return contract.protectedScreens.filter(s=>global||visited.has(s.component));
}
function selfTest(){
  const files=["Entry.tsx","Inline.tsx","Section.tsx","ui.css","Else.tsx"];
  const r=reverseGraph(files,{
    "Entry.tsx":'import "./ui.css"; import {S} from "./Section";',
    "Inline.tsx":'import {S} from "./Section";',
    "Section.tsx":"export const S=1;",
    "Else.tsx":"export const E=2;"
  });
  const c={protectedScreens:[{id:"entry",component:"Entry.tsx"},{id:"inline",component:"Inline.tsx"}],globalStylePatterns:["^base\\.css$"]};
  assert.deepEqual(impacted(["Section.tsx"],r,c).map(x=>x.id),["entry","inline"]);
  assert.deepEqual(impacted(["ui.css"],r,c).map(x=>x.id),["entry"]);
  assert.deepEqual(impacted(["Else.tsx"],r,c),[]);
  assert.equal(impacted(["base.css"],r,c).length,2);
  assert.equal(/toHaveScreenshot|toMatchSnapshot|pixelmatch/.test("await page.screenshot({})"),false);
  console.log("PASS: 5 tests: shared dependency, CSS, unrelated edit, global edit, screenshot != comparison");
}
function check(){
  const base=args.includes("--base")?arg("--base"):process.env.UI_GUARD_BASE;
  if(!base)throw Error("Missing approved target branch/base SHA");
  const policy="qa/ui-regression-contract.json";
  if(!fs.existsSync(policy))throw Error("Missing "+policy);
  const proposed=JSON.parse(file(policy));
  let locked=proposed;
  try { locked=JSON.parse(git("show",base+":"+policy)); }
  catch { console.log("Initial installation: proposed policy needs independent review."); }
  if(!Array.isArray(locked.protectedScreens)||!locked.protectedScreens.length)throw Error("No protected screens");
  const changes=git("diff","--name-only",base+"...HEAD").split("\n").filter(Boolean).map(norm);
  const files=git("ls-files").split("\n").filter(Boolean).map(norm);
  const affects=impacted(changes,reverseGraph(files),locked);
  const report={base,changedFiles:changes,impactedScreens:affects.map(s=>({id:s.id,states:s.states}))};
  fs.mkdirSync("test-results",{recursive:true});
  fs.writeFileSync("test-results/ui-impact-report.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
  if(!affects.length){console.log("PASS source-impact only; not final UI acceptance");return;}
  const errors=[];
  for(const screen of affects)for(const state of screen.states){
    const baseline=locked.approvedVisuals?.[state];
    if(!baseline||!baseline.path||!/^[a-f0-9]{64}$/i.test(baseline.sha256||"")){
      errors.push(screen.id+"/"+state+": no approved target-branch golden hash");continue;
    }
    try{
      const bytes=execFileSync("git",["show",base+":"+baseline.path],{stdio:["ignore","pipe","pipe"]});
      const digest=crypto.createHash("sha256").update(bytes).digest("hex");
      if(digest!==baseline.sha256)errors.push(state+": baseline digest mismatch");
    }catch{errors.push(state+": baseline absent from target branch")}
  }
  const visual=locked.visualCheckFiles||[];
  if(!visual.length)errors.push("No approved visual test files");
  for(const t of visual){
    if(!fs.existsSync(t))errors.push("Missing visual test: "+t);
    else if(!/toHaveScreenshot|toMatchSnapshot|pixelmatch|resemble|ssim|diffPixels/.test(file(t))) errors.push("No visual-diff assertion: "+t);
  }
  if(errors.length){console.error("BLOCKED: dependent approved UI lacks independent visual evidence:\n"+errors.map(x=>" - "+x).join("\n"));process.exitCode=2;return;}
  console.log("Baseline/test shape present, but independent matched-state review still required before frontend acceptance.");
}
try { if(has("--self-test"))selfTest(); else if(has("--check"))check(); else throw Error("Use --self-test or --check --base SHA"); }
catch(e){console.error("BLOCKED: UI regression guard: "+e.message);process.exitCode=2;}
