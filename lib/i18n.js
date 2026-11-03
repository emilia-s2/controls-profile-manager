'use strict';
const rows=require('./locales.json'),languages=['pt','en','es'],names={pt:'Português',en:'English',es:'Español (Latinoamérica)'};
const dictionary=new Map(rows.map(row=>[row[0],row]));
function normalize(value){if(typeof value!=='string')return null;const code=value.trim().toLowerCase().split(/[-_]/)[0];return languages.includes(code)?code:null;}
function preference(value){return normalize(value)||'auto';}
function resolve(mod){const chosen=preference(mod&&mod.settings&&mod.settings.language);if(chosen!=='auto')return chosen;
 try{const app=require('electron').app;if(app&&app.isReady()){const locale=app.getLocale();if(locale)return normalize(locale)||'en';}}catch(_){}
 try{const locale=Intl.DateTimeFormat().resolvedOptions().locale;if(locale)return normalize(locale)||'en';}catch(_){}
 return normalize(mod&&mod.game&&mod.game.language)||'en';
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const nested=new Set(['mode','epSummary','glyphSummary','settingsStatus','glyphsStatus','availability','pageState','costSummary']);
function t(language,key,params={}){const row=dictionary.get(key),template=row?row[languages.indexOf(normalize(language)||'en')]:String(key||'');return template.replace(/\{(\w+)\}/g,(token,key)=>Object.prototype.hasOwnProperty.call(params,key)?(key==='costSummary'?String(params[key]).split(' · ').map(s=>translate(language,s)).join(' · '):nested.has(key)?translate(language,String(params[key])):String(params[key])):token);}
const patterns=rows.filter(r=>/\{\w+\}/.test(r[0])).map(row=>{let previous=0,source='',keys=[];row[0].replace(/\{(\w+)\}/g,(token,key,offset)=>{source+=escape(row[0].slice(previous,offset));keys.push(key);source+=/^(?:count|page|talents|cost|total|remaining|levels|skills|omitted|preserved|adapted|unlisted|received|unlocked|used|points|duplicates|readers|glyphCount|glyphOmitted|glyphPages|glyphPreserved)$/.test(key)?'(\\d+)':'([\\s\\S]*?)';previous=offset+token.length;});return {key:row[0],keys,regex:new RegExp('^'+source+escape(row[0].slice(previous))+'$')};});
function translate(language,value){const text=String(value==null?'':value);if(dictionary.has(text))return t(language,text);for(const p of patterns){const match=p.regex.exec(text);if(match){const params={};p.keys.forEach((key,index)=>params[key]=match[index+1]);return t(language,p.key,params);}}return text;}
module.exports={normalize,preference,resolve,t,translate,names,rows};
