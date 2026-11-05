import test from "node:test";
import assert from "node:assert/strict";
import {buildRemixRequest} from "../experiments/m3-remix-request-preview.mjs";
test("creates documented stored prompted remix payload",()=>{
 const p=buildRemixRequest({baseVoice:"Puck"});
 assert.equal(p.store,true);
 assert.equal(p.voice.type,"prompted");
 assert.equal(p.voice.prompted.base_voice,"Puck");
 assert.equal(p.voice.language_code,"kk");
 assert.equal(p.voice.gender,"male");
});
test("refuses malformed voice or display name",()=>{
 assert.throws(()=>buildRemixRequest({baseVoice:"Puck\nAuthorization: xyz"}));
 assert.throws(()=>buildRemixRequest({displayName:"x"}));
});
