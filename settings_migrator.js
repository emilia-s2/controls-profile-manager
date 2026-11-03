'use strict';
const Locale=require('./lib/i18n');
module.exports=function migrate(from,to,settings){if(to!==1||from!=null&&![0,1].includes(from))throw Error('Unsupported Controls Profile settings version');const data=settings&&typeof settings==='object'&&!Array.isArray(settings)?Object.assign({},settings):{};data.language=Locale.preference(data.language);return data;};
