'use strict';
const F=require('./settings-format');
const Catalog=require('./glyph-catalog');
const NAME='S1SkillCrestPresetController';
function read(section) {
    if(F.unique(section.fields,1,0).value!==12081n)throw Error('unsupported-glyph-schema');
    const indexes=new Set(),pages=section.fields.filter(f=>f.number===2);
    if(pages.length>10)throw Error('invalid-glyph-pages');
    return pages.map(field=>{
        if(field.wire!==2)throw Error('invalid-glyph-page');
        const fields=F.parseFields(field.value),index=F.unique(fields,3,0).value;
        if(index>9n||indexes.has(index.toString()))throw Error('invalid-glyph-page-index');
        indexes.add(index.toString());
        const ids=new Set(),glyphs=fields.filter(f=>f.number===2).map(row=>{
            if(row.wire!==2)throw Error('invalid-glyph-entry');
            const id=F.unique(F.parseFields(row.value),4,0).value;
            if(id<1n||id>2147483647n||ids.has(id.toString()))throw Error('invalid-glyph-id');
            ids.add(id.toString());return {id:id.toString(),field:row};
        });
        if(glyphs.length>256)throw Error('too-many-glyphs');
        return {index:index.toString(),field,fields,glyphs};
    });
}
function merge(target,source,available,policy=null) {
    if(!(available instanceof Set))throw Error('known-glyphs-unavailable');
    const old=read(target),saved=read(source),byIndex=new Map(old.map(p=>[p.index,p]));
    let selected=0,preservedPages=0;const skipped=[],adapted=[],pointSkipped=[],duplicateSkipped=[],pageCosts=[];
    const replacements=new Map();
    for(const page of saved) {
        const glyphs=[],families=new Set();let cost=0;
        for(const glyph of page.glyphs){
            const chosen=policy?Catalog.choose(glyph.id,available,policy.catalog):available.has(glyph.id)?{id:glyph.id,cost:0,family:glyph.id}:null;
            const entry={page:Number(page.index)+1,id:glyph.id};
            if(!chosen){skipped.push(entry);continue;}
            const family=chosen.family||chosen.id;
            if(families.has(family)){duplicateSkipped.push(entry);continue;}
            if(policy&&cost+chosen.cost>policy.points){pointSkipped.push({...entry,to:chosen.id,cost:chosen.cost});continue;}
            let field=glyph.field;
            if(chosen.id!==glyph.id){field=F.parseFields(F.bytesField(2,Buffer.concat(F.parseFields(glyph.field.value).map(f=>f.number===4?F.intField(4,chosen.id):f.raw))))[0];adapted.push({...entry,to:chosen.id});}
            glyphs.push({id:chosen.id,field});families.add(family);cost+=chosen.cost;
        }
        pageCosts.push({page:Number(page.index)+1,used:cost,limit:policy?policy.points:null});
        // An unavailable build must not erase an existing destination page.
        if(page.glyphs.length&&!glyphs.length){pageCosts[pageCosts.length-1].preserved=true;preservedPages++;continue;}
        const existing=byIndex.get(page.index),fields=[],base=existing?existing.fields:page.fields;
        let inserted=false;
        for(const f of base){if(f.number===2){if(!inserted){fields.push(...glyphs.map(g=>g.field));inserted=true;}}else fields.push(f);}
        if(!inserted)fields.push(...glyphs.map(g=>g.field));
        replacements.set(page.index,F.bytesField(2,Buffer.concat(fields.map(f=>f.raw))));selected+=glyphs.length;
    }
    const fields=[];let next=0;
    for(const f of target.fields){if(f.number===2){const p=old[next++];fields.push({raw:replacements.get(p.index)||f.raw});replacements.delete(p.index);}else fields.push(f);}
    for(const raw of replacements.values())fields.push({raw});
    const result={raw:F.rewriteSection(target,fields),pages:saved.length-preservedPages,selected,skipped,preservedPages,adapted,pointSkipped,duplicateSkipped,pageCosts};
    // Selection/unknown root fields are retained from the destination. This stores
    // pages only; activating a page and validating points stays with the game.
    return result;
}
module.exports={NAME,read,merge};
