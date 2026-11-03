'use strict';
window.UIText=(()=>{
 const Locale=require('../lib/i18n'),nodes=[],attributes=[],dynamic=new Map();let language='pt';
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){if(node.parentElement.closest('script,style'))continue;const text=node.nodeValue.trim();if(text)nodes.push({node,text,prefix:node.nodeValue.match(/^\s*/)[0],suffix:node.nodeValue.match(/\s*$/)[0]});}
 for(const element of document.querySelectorAll('[aria-label],[alt],[placeholder],[title]'))for(const name of ['aria-label','alt','placeholder','title'])if(element.hasAttribute(name))attributes.push({element,name,text:element.getAttribute(name)});
 function translate(value){return Locale.translate(language,value);}
 function text(element,value,literal=false){const source=String(value==null?'':value);if(element.tagName!=='SELECT'&&source)dynamic.set(element,{source,literal});else dynamic.delete(element);const result=literal?source:translate(source);element.textContent=result;return result;}
 function apply(value){language=Locale.normalize(value)||'en';document.documentElement.lang={pt:'pt-BR',en:'en',es:'es-419'}[language];for(const item of nodes)if(item.node.isConnected)item.node.nodeValue=item.prefix+translate(item.text)+item.suffix;for(const item of attributes)if(item.element.isConnected)item.element.setAttribute(item.name,translate(item.text));for(const [element,item]of dynamic){if(!element.isConnected)dynamic.delete(element);else element.textContent=item.literal?item.source:translate(item.source);}document.title='Controls Profile';}
 return {apply,text,translate,t:(key,params)=>Locale.t(language,key,params),names:Locale.names,get locale(){return {pt:'pt-BR',en:'en-US',es:'es-419'}[language];}};
})();
