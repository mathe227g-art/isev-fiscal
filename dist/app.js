const $=(s,p=document)=>p.querySelector(s), $$=(s,p=document)=>[...p.querySelectorAll(s)];
const state={processed:0,valid:0,errors:0,dupes:0,records:[],compare:{a:null,b:null}};
const titles={inicio:'Visão geral',validador:'Validador NF-e',leitor:'Leitor XML',formatador:'Formatador XML',cnpj:'Consulta CNPJ',danfe:'Visualizador DANFE',chave:'Consulta por chave',lote:'Processamento em lote',comparador:'Comparar XMLs',duplicidades:'Duplicidades',exportacao:'Exportar dados',relatorios:'Resumo temporário'};
function go(page){$$('.page').forEach(x=>x.classList.toggle('active',x.id===page));$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));$('#pageTitle').textContent=titles[page]||'iSev Fiscal';$('#sidebar').classList.remove('open');if(page==='relatorios')renderReport();scrollTo(0,0)}
$$('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));$$('[data-goto]').forEach(b=>b.onclick=()=>go(b.dataset.goto));$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');$$('[data-pick]').forEach(b=>b.onclick=()=>$('#'+b.dataset.pick).click());
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
function clean(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function readableError(value,fallback='Não foi possível concluir a consulta.'){
  if(typeof value==='string'&&value.trim())return value.trim();
  if(value instanceof Error)return readableError(value.message,fallback);
  if(value&&typeof value==='object')return readableError(value.error||value.message||value.detail||value.title,fallback);
  return fallback;
}
async function apiPayload(response){
  const text=await response.text();
  if(!text)return {};
  try{return JSON.parse(text)}catch{return {error:response.ok?'A API retornou uma resposta inválida.':`Falha HTTP ${response.status}.`}}
}
async function apiFetch(url,options={},retry=true){
  const headers=new Headers(options.headers||{}),key=sessionStorage.getItem('isevAccessKey');
  if(key)headers.set('X-iSev-Key',key);
  const response=await fetch(url,{...options,headers});
  if(response.status===401&&retry){
    const entered=window.prompt('Digite a chave de acesso do iSev Fiscal:');
    if(entered){sessionStorage.setItem('isevAccessKey',entered);return apiFetch(url,options,false)}
  }
  return response;
}
function tag(doc,name,root=doc){return root?.getElementsByTagName(name)?.[0]?.textContent?.trim()||''}
function tags(doc,name,root=doc){return [...(root?.getElementsByTagName(name)||[])]}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function digits(v){return String(v||'').replace(/\D/g,'')}
function cnpjFmt(v){const d=digits(v);return d.length===14?d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):v||'—'}
function parseXml(text,name='documento.xml'){
  if(new Blob([text]).size>10*1024*1024)throw new Error('O conteúdo XML ultrapassa 10 MB.');
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('XML com DTD ou entidades não é aceito por segurança.');
  const doc=new DOMParser().parseFromString(text,'application/xml');const pe=doc.querySelector('parsererror');if(pe)throw new Error('XML malformado: '+pe.textContent.split('\n')[0]);
  const inf=doc.getElementsByTagName('infNFe')[0];const emit=doc.getElementsByTagName('emit')[0];const dest=doc.getElementsByTagName('dest')[0];const ide=doc.getElementsByTagName('ide')[0];const total=doc.getElementsByTagName('ICMSTot')[0];
  const items=tags(doc,'det').map((d,i)=>({n:d.getAttribute('nItem')||i+1,cProd:tag(doc,'cProd',d),xProd:tag(doc,'xProd',d),ncm:tag(doc,'NCM',d),cfop:tag(doc,'CFOP',d),qCom:tag(doc,'qCom',d),uCom:tag(doc,'uCom',d),vUnCom:tag(doc,'vUnCom',d),vProd:tag(doc,'vProd',d)}));
  const key=(inf?.getAttribute('Id')||'').replace(/^NFe/,'')||tag(doc,'chNFe');
  return {name,text,doc,key,model:tag(doc,'mod',ide),number:tag(doc,'nNF',ide),series:tag(doc,'serie',ide),date:tag(doc,'dhEmi',ide)||tag(doc,'dEmi',ide),nature:tag(doc,'natOp',ide),emit:{name:tag(doc,'xNome',emit),fantasy:tag(doc,'xFant',emit),cnpj:tag(doc,'CNPJ',emit),ie:tag(doc,'IE',emit)},dest:{name:tag(doc,'xNome',dest),cnpj:tag(doc,'CNPJ',dest)||tag(doc,'CPF',dest),ie:tag(doc,'IE',dest)},total:Number(tag(doc,'vNF',total)||0),products:Number(tag(doc,'vProd',total)||0),icms:Number(tag(doc,'vICMS',total)||0),ipi:Number(tag(doc,'vIPI',total)||0),items};
}
function elementChildren(node){return [...(node?.childNodes||[])].filter(child=>child.nodeType===1)}
function localName(node){return node?.localName||node?.nodeName?.split(':').pop()||''}
function icmsTotSchemaChecks(rec,push){
  const total=rec.doc.getElementsByTagName('ICMSTot')[0];
  if(!total)return push(false,'Grupo ICMSTot não informado');
  const version=rec.doc.getElementsByTagName('infNFe')[0]?.getAttribute('versao')||'';
  const legacy=['vBC','vICMS','vBCST','vST','vProd','vFrete','vSeg','vDesc','vII','vIPI','vPIS','vCOFINS','vOutro','vNF','vTotTrib'];
  const current=['vBC','vICMS','vICMSDeson','vFCPUFDest','vICMSUFDest','vICMSUFRemet','vFCP','vBCST','vST','vFCPST','vFCPSTRet','qBCMono','vICMSMono','qBCMonoReten','vICMSMonoReten','qBCMonoRet','vICMSMonoRet','vProd','vFrete','vSeg','vDesc','vII','vIPI','vIPIDevol','vPIS','vCOFINS','vOutro','vNF','vTotTrib'];
  const order=version.startsWith('2.')?legacy:current;
  const names=elementChildren(total).map(localName);
  const required=['vBC','vICMS','vBCST','vST','vProd','vFrete','vSeg','vDesc','vII','vIPI','vPIS','vCOFINS','vOutro','vNF'];
  const missing=required.filter(name=>!names.includes(name));
  if(missing.length){
    const first=missing[0],next=names.find(name=>order.indexOf(name)>order.indexOf(first));
    push(false,`Falha de schema em ICMSTot: campo ${first} ausente${next?`; esperado antes de ${next}`:''}`);
  }else push(true,'Campos obrigatórios de ICMSTot informados');
  let previous=-1,wrong='';
  for(const name of names){const position=order.indexOf(name);if(position<0)continue;if(position<previous){wrong=name;break}previous=position}
  push(!wrong,wrong?`Falha de schema em ICMSTot: campo ${wrong} fora da sequência esperada`:'Sequência dos campos de ICMSTot compatível com o leiaute');
}
function fiscalCombinationWarnings(rec){
  const warnings=[];
  const emit=rec.doc.getElementsByTagName('emit')[0];
  const dest=rec.doc.getElementsByTagName('dest')[0];
  const ide=rec.doc.getElementsByTagName('ide')[0];
  const normalRegime=tag(rec.doc,'CRT',emit)==='3';
  const outbound=tag(rec.doc,'tpNF',ide)==='1';
  const legalEntity=!!dest?.getElementsByTagName('CNPJ')[0];
  if(!(normalRegime&&outbound&&legalEntity))return warnings;
  tags(rec.doc,'det').forEach((item,index)=>{
    const cfop=tag(rec.doc,'CFOP',item);
    const icmsCst=tag(rec.doc,'CST',item.getElementsByTagName('ICMS')[0]);
    const ipiCst=tag(rec.doc,'CST',item.getElementsByTagName('IPI')[0]);
    if(cfop==='5101'&&icmsCst==='60')warnings.push(`Item ${index+1}: CFOP 5101 para saída a pessoa jurídica, em regime normal, não é uma combinação coerente com CST 60 de ICMS.`);
    if(cfop==='5101'&&ipiCst==='02')warnings.push(`Item ${index+1}: CFOP 5101 para saída a pessoa jurídica, em regime normal, não é uma combinação coerente com CST 02 de IPI.`);
  });
  return warnings;
}
function roundMoney(value){return Math.round((Number(value)||0)*100)/100}
function productValueChecks(rec,push){
  const includedValues=[];
  let commercialErrors=0,tributableErrors=0;
  tags(rec.doc,'det').forEach((item,index)=>{
    const product=item.getElementsByTagName('prod')[0];
    if(!product)return;
    const name=tag(rec.doc,'xProd',product)||`Item ${index+1}`;
    const informed=roundMoney(tag(rec.doc,'vProd',product));
    const commercial=roundMoney(Number(tag(rec.doc,'qCom',product))*Number(tag(rec.doc,'vUnCom',product)));
    const taxable=roundMoney(Number(tag(rec.doc,'qTrib',product))*Number(tag(rec.doc,'vUnTrib',product)));
    if(Math.abs(informed-commercial)>.01){commercialErrors++;push(false,`Rejeição 629 — Item ${index+1} (${name}): vProd informado ${money(informed)}; qCom × vUnCom resulta ${money(commercial)}.`)}
    if(Math.abs(informed-taxable)>.01){tributableErrors++;push(false,`Rejeição 630 — Item ${index+1} (${name}): vProd informado ${money(informed)}; qTrib × vUnTrib resulta ${money(taxable)}.`)}
    if(tag(rec.doc,'indTot',product)!=='0')includedValues.push(informed);
  });
  if(!commercialErrors)push(true,'Valores dos produtos conferem com quantidade e valor unitário de comercialização');
  if(!tributableErrors)push(true,'Valores dos produtos conferem com quantidade e valor unitário tributável');
  const itemTotal=roundMoney(includedValues.reduce((sum,value)=>sum+value,0));
  const informedTotal=roundMoney(rec.products);
  push(Math.abs(itemTotal-informedTotal)<=.01,`Rejeição 564 — Total dos produtos: vProd informado no total ${money(informedTotal)}; soma dos itens ${money(itemTotal)}.`);
}
function validCpf(value){const d=digits(value);if(d.length!==11||/^(\d)\1+$/.test(d))return false;for(let size=9;size<=10;size++){let sum=0;for(let i=0;i<size;i++)sum+=Number(d[i])*(size+1-i);const digit=((sum*10)%11)%10;if(digit!==Number(d[size]))return false}return true}
function validCnpj(value){const d=digits(value);if(d.length!==14||/^(\d)\1+$/.test(d))return false;for(const size of [12,13]){let sum=0,weight=size===12?5:6;for(let i=0;i<size;i++){sum+=Number(d[i])*weight;weight=weight===2?9:weight-1}const rest=sum%11,digit=rest<2?0:11-rest;if(digit!==Number(d[size]))return false}return true}
function accessKeyChecks(rec,push){
  if(rec.key.length!==44)return;
  push(accessKeyDigit(rec.key.slice(0,43))===Number(rec.key[43]),'Chave de acesso com dígito verificador válido');
  const ide=rec.doc.getElementsByTagName('ide')[0];
  const date=(tag(rec.doc,'dhEmi',ide)||tag(rec.doc,'dEmi',ide));
  const aamm=/^(\d{4})-(\d{2})/.test(date)?date.slice(2,4)+date.slice(5,7):'';
  const parts=[tag(rec.doc,'cUF',ide),aamm,digits(rec.emit.cnpj),tag(rec.doc,'mod',ide).padStart(2,'0'),tag(rec.doc,'serie',ide).padStart(3,'0'),tag(rec.doc,'nNF',ide).padStart(9,'0'),tag(rec.doc,'tpEmis',ide),tag(rec.doc,'cNF',ide).padStart(8,'0')];
  if(parts.every(Boolean))push(rec.key.slice(0,43)===parts.join(''),'Chave de acesso coerente com UF, emissão, CNPJ, modelo, série, número, tipo de emissão e código numérico');
}
function itemIdentificationChecks(rec,push){
  const ide=rec.doc.getElementsByTagName('ide')[0],tpNF=tag(rec.doc,'tpNF',ide);
  tags(rec.doc,'det').forEach((item,index)=>{
    const number=item.getAttribute('nItem')||'',product=item.getElementsByTagName('prod')[0];
    const name=tag(rec.doc,'xProd',product)||`Item ${index+1}`,ncm=tag(rec.doc,'NCM',product),cfop=tag(rec.doc,'CFOP',product);
    push(number===String(index+1),`Item ${index+1} (${name}): atributo nItem deve ser ${index+1}, mas foi informado ${number||'vazio'}.`);
    push(/^\d{8}$/.test(ncm),`Item ${index+1} (${name}): NCM deve possuir 8 dígitos; informado ${ncm||'vazio'}.`);
    push(/^\d{4}$/.test(cfop),`Item ${index+1} (${name}): CFOP deve possuir 4 dígitos; informado ${cfop||'vazio'}.`);
    if(/^\d{4}$/.test(cfop)&&tpNF==='1')push(['5','6','7'].includes(cfop[0]),`Rejeição 518 — Item ${index+1} (${name}): CFOP de entrada ${cfop} utilizado em NF-e de saída.`);
    if(/^\d{4}$/.test(cfop)&&tpNF==='0')push(['1','2','3'].includes(cfop[0]),`Rejeição 519 — Item ${index+1} (${name}): CFOP de saída ${cfop} utilizado em NF-e de entrada.`);
  });
}
function taxCalculationChecks(rec,push){
  tags(rec.doc,'det').forEach((item,index)=>{
    const name=tag(rec.doc,'xProd',item)||`Item ${index+1}`;
    const groups=[
      ['ICMS',item.getElementsByTagName('ICMS')[0],'vBC','pICMS','vICMS','Rejeição 528'],
      ['IPI',item.getElementsByTagName('IPI')[0],'vBC','pIPI','vIPI','IPI'],
      ['PIS',item.getElementsByTagName('PIS')[0],'vBC','pPIS','vPIS','PIS'],
      ['COFINS',item.getElementsByTagName('COFINS')[0],'vBC','pCOFINS','vCOFINS','COFINS']
    ];
    groups.forEach(([tax,root,baseTag,rateTag,valueTag,prefix])=>{
      if(!root)return;const base=tag(rec.doc,baseTag,root),rate=tag(rec.doc,rateTag,root),value=tag(rec.doc,valueTag,root);if(base===''||rate===''||value==='')return;
      const expected=roundMoney(Number(base)*Number(rate)/100),informed=roundMoney(value);
      push(Math.abs(expected-informed)<=.01,`${prefix} — Item ${index+1} (${name}): ${tax} informado ${money(informed)}; base × alíquota resulta ${money(expected)}.`);
    });
  });
}
function sumField(rec,groupName,fieldName){return roundMoney(tags(rec.doc,'det').reduce((sum,item)=>{const root=groupName==='prod'?item.getElementsByTagName('prod')[0]:item.getElementsByTagName(groupName)[0];return sum+Number(tag(rec.doc,fieldName,root)||0)},0))}
function totalizationChecks(rec,push){
  const total=rec.doc.getElementsByTagName('ICMSTot')[0];if(!total)return;
  const rules=[
    ['531','Base de cálculo do ICMS','ICMS','vBC'],['532','ICMS','ICMS','vICMS'],['533','Base de cálculo do ICMS ST','ICMS','vBCST'],['534','ICMS ST','ICMS','vST'],
    ['535','Frete','prod','vFrete'],['536','Seguro','prod','vSeg'],['537','Desconto','prod','vDesc'],['538','IPI','IPI','vIPI'],
    ['602','PIS','PIS','vPIS'],['603','COFINS','COFINS','vCOFINS'],['604','Outras despesas','prod','vOutro']
  ];
  rules.forEach(([code,label,group,field])=>{const node=total.getElementsByTagName(field)[0];if(!node)return;const informed=roundMoney(node.textContent),calculated=sumField(rec,group,field);push(Math.abs(informed-calculated)<=.01,`Rejeição ${code} — Total de ${label}: informado ${money(informed)}; soma dos itens ${money(calculated)}.`)});
  if(!rec.doc.getElementsByTagName('ISSQNtot')[0]){
    const value=name=>Number(tag(rec.doc,name,total)||0);
    const calculated=roundMoney(value('vProd')-value('vDesc')-value('vICMSDeson')+value('vST')+value('vFCPST')+value('vFrete')+value('vSeg')+value('vOutro')+value('vII')+value('vIPI')+value('vIPIDevol'));
    push(Math.abs(value('vNF')-calculated)<=.01,`Rejeição 610 — Total da NF-e: vNF informado ${money(value('vNF'))}; cálculo dos componentes ${money(calculated)}.`);
  }
}
function documentWarnings(rec){
  const warnings=[];
  const version=rec.doc.getElementsByTagName('infNFe')[0]?.getAttribute('versao')||'';
  if(version&&version!=='4.00')warnings.push(`Leiaute ${version}: versão histórica. Para novas emissões, confira as regras vigentes da NF-e 4.00 e as Notas Técnicas atuais.`);
  if(!rec.doc.getElementsByTagName('Signature')[0])warnings.push('Assinatura digital não encontrada no XML. Um arquivo ainda não assinado pode ser útil para pré-validação, mas não está pronto para autorização.');
  if(rec.doc.getElementsByTagName('IBSCBS')[0]||rec.doc.getElementsByTagName('IBSCBSTot')[0])warnings.push('Campos IBS/CBS da Reforma Tributária detectados. Confira também o XML com os schemas e a Nota Técnica RTC vigentes, pois essas regras continuam recebendo versões.');
  return warnings;
}
function validate(rec){
  const checks=[];const push=(ok,label)=>checks.push({ok,label});
  push(!!rec.doc.documentElement,'XML com estrutura legível');
  push(!!rec.doc.getElementsByTagName('NFe')[0]||!!rec.doc.getElementsByTagName('nfeProc')[0],'Documento identificado como NF-e');
  push(rec.key.length===44,'Chave de acesso com 44 dígitos');
  push(!!rec.emit.cnpj,'CNPJ do emitente informado');
  if(rec.emit.cnpj)push(validCnpj(rec.emit.cnpj),'CNPJ do emitente com dígitos verificadores válidos');
  const destNode=rec.doc.getElementsByTagName('dest')[0];
  const destCnpj=tag(rec.doc,'CNPJ',destNode),destCpf=tag(rec.doc,'CPF',destNode);
  if(destCnpj)push(validCnpj(destCnpj),'CNPJ do destinatário com dígitos verificadores válidos');
  if(destCpf)push(validCpf(destCpf),'CPF do destinatário com dígitos verificadores válidos');
  push(!!rec.emit.name,'Razão social do emitente informada');
  const genericTextPattern=/^[\u0021-\u00FF](?:[\u0020-\u00FF]*[\u0021-\u00FF])?$/;
  const invalidNames=tags(rec.doc,'xNome').map(node=>node.textContent||'').filter(value=>value&&!genericTextPattern.test(value));
  push(invalidNames.length===0,invalidNames.length?`Campo xNome contém caractere não permitido pelo schema: ${invalidNames[0]}`:'Campos xNome usam caracteres aceitos pelo schema');
  push(tags(rec.doc,'xNome').every(node=>(node.textContent||'').trim().length>=2&&(node.textContent||'').trim().length<=60),'Campos xNome possuem de 2 a 60 caracteres');
  push(!!rec.number,'Número da nota informado');
  push(rec.items.length>0,'Nota contém ao menos um item');
  push(rec.total>0,'Valor total da nota informado');
  accessKeyChecks(rec,push);
  itemIdentificationChecks(rec,push);
  productValueChecks(rec,push);
  taxCalculationChecks(rec,push);
  totalizationChecks(rec,push);
  icmsTotSchemaChecks(rec,push);
  const prot=rec.doc.getElementsByTagName('protNFe')[0],status=tag(rec.doc,'cStat',prot),reason=tag(rec.doc,'xMotivo',prot);
  if(status)push(['100','150'].includes(status),`SEFAZ cStat ${status}${reason?` — ${reason}`:''}`);
  const warnings=[...fiscalCombinationWarnings(rec),...documentWarnings(rec)];
  return {ok:checks.every(c=>c.ok),checks,warnings};
}
function register(rec,result){state.processed++;result.ok?state.valid++:state.errors+=result.checks.filter(c=>!c.ok).length;state.records.push({time:new Date(),name:rec.name,key:rec.key,number:rec.number,emit:rec.emit.name,total:rec.total,ok:result.ok});updateStats()}
function updateStats(){const values={statProcessed:state.processed,statValid:state.valid,statErrors:state.errors,statDupes:state.dupes};Object.entries(values).forEach(([id,value])=>{const element=$('#'+id);if(element)element.textContent=value})}
async function fromFile(file){if(!file)return null;if(file.size>10*1024*1024)throw new Error('O arquivo ultrapassa 10 MB.');return parseXml(await file.text(),file.name)}
function validationHtml(rec,res){const errors=res.checks.filter(check=>!check.ok),warnings=res.warnings||[];const status=errors.length?'bad':warnings.length?'warn':'ok';const icon=status==='ok'?'✓':'!';const title=errors.length?(errors.length===1?'1 problema encontrado':`${errors.length} problemas encontrados`):warnings.length?`Sem erro local, com ${warnings.length===1?'1 alerta':`${warnings.length} alertas`}`:'Nenhum problema local conhecido encontrado';const errorList=errors.length?`<div class="error-summary"><strong>${errors.length===1?'Problema encontrado':'Problemas encontrados'}</strong><ul class="check-list">${errors.map(error=>`<li class="bad"><span>×</span>${clean(error.label)}</li>`).join('')}</ul></div>`:'';const warningList=warnings.length?`<div class="warning-summary"><strong>${warnings.length===1?'Alerta fiscal':'Alertas fiscais'}</strong><ul class="check-list">${warnings.map(warning=>`<li class="warn"><span>!</span>${clean(warning)}</li>`).join('')}</ul></div>`:'';return `<div class="validation-head"><span class="big-status ${status}">${icon}</span><div><h3>${title}</h3><p>${clean(rec.name)}</p></div></div>${errorList}${warningList}<div class="summary-grid"><div><small>Nota</small><strong>${clean(rec.number||'—')}</strong></div><div><small>Emitente</small><strong>${clean(rec.emit.name||'—')}</strong></div><div><small>Valor</small><strong>${money(rec.total)}</strong></div></div><div class="alert info"><strong>Diagnóstico local:</strong> os códigos indicam rejeições prováveis conforme regras conhecidas. A autorização, o schema XSD completo e a assinatura digital só são confirmados pelos serviços e validadores oficiais da SEFAZ.</div>`}
async function runValidation(fileOrText,name){try{const rec=typeof fileOrText==='string'?parseXml(fileOrText,name):await fromFile(fileOrText);const res=validate(rec);register(rec,res);$('#validationResult').innerHTML=validationHtml(rec,res);toast('Validação concluída')}catch(e){state.processed++;state.errors++;updateStats();$('#validationResult').innerHTML=`<div class="empty-state"><span class="error-symbol">!</span><h3>Não foi possível ler o XML</h3><p>${clean(e.message)}</p></div>`}}
$('#validatorFile').onchange=e=>runValidation(e.target.files[0]);$('#validateTextBtn').onclick=()=>runValidation($('#validatorText').value,'conteudo-colado.xml');$$('[data-input-mode]').forEach(b=>b.onclick=()=>{$$('[data-input-mode]').forEach(x=>x.classList.toggle('active',x===b));$('#validatorDrop').classList.toggle('hidden',b.dataset.inputMode!=='upload');$('#validatorPaste').classList.toggle('hidden',b.dataset.inputMode!=='paste')});
function bindDrop(id,handler){const el=$(id);['dragenter','dragover'].forEach(ev=>el.addEventListener(ev,e=>{e.preventDefault();el.classList.add('drag')}));['dragleave','drop'].forEach(ev=>el.addEventListener(ev,e=>{e.preventDefault();el.classList.remove('drag')}));el.addEventListener('drop',e=>handler(e.dataTransfer.files))}
bindDrop('#validatorDrop',fs=>fs[0]&&runValidation(fs[0]));bindDrop('#batchDrop',fs=>processBatch(fs));
function readerHtml(r){return `<div class="details-grid"><div class="detail-card"><small>Número</small><strong>${clean(r.number||'—')}</strong></div><div class="detail-card"><small>Série</small><strong>${clean(r.series||'—')}</strong></div><div class="detail-card"><small>Emissão</small><strong>${clean(r.date?new Date(r.date).toLocaleDateString('pt-BR'):'—')}</strong></div><div class="detail-card"><small>Valor da nota</small><strong>${money(r.total)}</strong></div></div><div class="data-section"><h3>Participantes</h3><div class="kv-grid"><div><small>Emitente</small><strong>${clean(r.emit.name||'—')}</strong></div><div><small>CNPJ emitente</small><strong>${clean(cnpjFmt(r.emit.cnpj))}</strong></div><div><small>Destinatário</small><strong>${clean(r.dest.name||'—')}</strong></div><div><small>Documento destinatário</small><strong>${clean(cnpjFmt(r.dest.cnpj))}</strong></div><div><small>Natureza da operação</small><strong>${clean(r.nature||'—')}</strong></div><div><small>Chave de acesso</small><strong>${clean(r.key||'—')}</strong></div></div></div><div class="data-section"><h3>Itens (${r.items.length})</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Código</th><th>Produto</th><th>NCM</th><th>CFOP</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${r.items.map(i=>`<tr><td>${i.n}</td><td>${clean(i.cProd)}</td><td>${clean(i.xProd)}</td><td>${clean(i.ncm)}</td><td>${clean(i.cfop)}</td><td>${clean(i.qCom)} ${clean(i.uCom)}</td><td>${money(i.vUnCom)}</td><td>${money(i.vProd)}</td></tr>`).join('')}</tbody></table></div></div>`}
$('#readerFile').onchange=async e=>{try{const r=await fromFile(e.target.files[0]);const v=validate(r);register(r,v);$('#readerContent').className='';$('#readerContent').innerHTML=readerHtml(r)}catch(x){toast(x.message)}};
function formatXml(xml){const d=new DOMParser().parseFromString(xml,'application/xml');if(d.querySelector('parsererror'))throw new Error('XML inválido');let s=new XMLSerializer().serializeToString(d).replace(/>\s*</g,'><').replace(/</g,'\n<');let pad=0;return s.trim().split('\n').map(n=>{if(/^<\//.test(n))pad--;const line='  '.repeat(Math.max(0,pad))+n;if(/^<[^!?/][^>]*[^/]>/i.test(n)&&!/<\/[^>]+>$/.test(n))pad++;return line}).join('\n')}
$('#beautifyBtn').onclick=()=>{try{$('#formatOutput').value=formatXml($('#formatInput').value)}catch(e){toast(e.message)}};$('#minifyBtn').onclick=()=>{try{const d=new DOMParser().parseFromString($('#formatInput').value,'application/xml');if(d.querySelector('parsererror'))throw new Error('XML inválido');$('#formatOutput').value=new XMLSerializer().serializeToString(d)}catch(e){toast(e.message)}};$('#copyFormatted').onclick=async()=>{await navigator.clipboard.writeText($('#formatOutput').value);toast('XML copiado')};$('#downloadFormatted').onclick=()=>download('xml-formatado.xml',$('#formatOutput').value,'application/xml');$('#sampleXml').onclick=()=>$('#formatInput').value='<?xml version="1.0" encoding="UTF-8"?>\n<nota>\n  <numero>123</numero>\n  <valor>150.00</valor>\n</nota>';
$('#cnpjInput').oninput=e=>{let d=digits(e.target.value).slice(0,14);e.target.value=d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2')};
$('#danfeFile').onchange=async e=>{try{const r=await fromFile(e.target.files[0]);const v=validate(r);register(r,v);$('#danfeContent').className='';$('#danfeContent').innerHTML=`<div class="danfe-sheet"><div class="danfe-title"><div><strong>${clean(r.emit.name)}</strong><p>${cnpjFmt(r.emit.cnpj)}</p></div><div><h2>DANFE</h2><small>Documento Auxiliar da NF-e</small></div><div><strong>NF-e Nº ${clean(r.number)}</strong><p>Série ${clean(r.series)}</p></div></div><div class="danfe-access-key"><small>CHAVE DE ACESSO</small><br><strong>${clean(r.key)}</strong></div>${readerHtml(r)}<div class="alert info">Visualização simplificada para conferência interna. Não substitui um DANFE oficial.</div></div>`;setTimeout(()=>window.print(),300)}catch(x){toast(x.message)}};
async function processFiles(files){const out=[];for(const f of [...files]){try{const r=await fromFile(f);out.push({r,v:validate(r),error:null})}catch(error){out.push({r:null,v:null,error})}}return out}
async function processBatch(files){if(!files.length)return;const data=await processFiles(files);data.forEach(x=>x.r&&register(x.r,x.v));const ok=data.filter(x=>x.v?.ok).length;$('#batchResult').innerHTML=`<div class="alert success">${data.length} arquivo(s) processado(s): ${ok} sem inconsistências básicas e ${data.length-ok} para revisar.</div><div class="data-section"><div class="table-wrap"><table class="data-table"><thead><tr><th>Arquivo</th><th>Nota</th><th>Emitente</th><th>Valor</th><th>Status</th></tr></thead><tbody>${data.map(x=>x.r?`<tr><td>${clean(x.r.name)}</td><td>${clean(x.r.number)}</td><td>${clean(x.r.emit.name)}</td><td>${money(x.r.total)}</td><td>${x.v.ok?'✓ Válido':'! Revisar'}</td></tr>`:`<tr><td>${clean(x.error.message)}</td><td colspan="4">Não foi possível ler</td></tr>`).join('')}</tbody></table></div></div>`}
$('#batchFiles').onchange=e=>processBatch(e.target.files);
async function setCompare(side,file){try{state.compare[side]=await fromFile(file);$('#compareName'+side.toUpperCase()).textContent=file.name;$('#compareBtn').disabled=!(state.compare.a&&state.compare.b)}catch(e){toast(e.message)}}
$('#compareA').onchange=e=>setCompare('a',e.target.files[0]);$('#compareB').onchange=e=>setCompare('b',e.target.files[0]);$('#compareBtn').onclick=()=>{const a=state.compare.a,b=state.compare.b;const rows=[['Chave',a.key,b.key],['Número',a.number,b.number],['Emitente',a.emit.name,b.emit.name],['CNPJ emitente',a.emit.cnpj,b.emit.cnpj],['Destinatário',a.dest.name,b.dest.name],['Itens',a.items.length,b.items.length],['Valor total',money(a.total),money(b.total)]];$('#compareResult').innerHTML=`<div class="data-section"><table class="data-table"><thead><tr><th>Campo</th><th>XML A</th><th>XML B</th><th>Resultado</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${clean(r[1])}</td><td>${clean(r[2])}</td><td>${String(r[1])===String(r[2])?'Igual':'Diferente'}</td></tr>`).join('')}</tbody></table></div>`};
$('#dupeFiles').onchange=async e=>{const data=await processFiles(e.target.files);const map={};data.filter(x=>x.r).forEach(x=>(map[x.r.key||'sem-chave']??=[]).push(x.r.name));const dup=Object.entries(map).filter(([,v])=>v.length>1);state.dupes=dup.length;updateStats();$('#dupeResult').innerHTML=dup.length?`<div class="alert error">${dup.length} chave(s) duplicada(s) encontrada(s).</div><div class="data-section">${dup.map(([k,v])=>`<p><strong>${clean(k)}</strong><br><small>${v.map(clean).join(' • ')}</small></p>`).join('')}</div>`:`<div class="alert success">Nenhuma duplicidade encontrada em ${data.length} arquivo(s).</div>`};
$('#exportFiles').onchange=async e=>{const data=(await processFiles(e.target.files)).filter(x=>x.r).map(x=>x.r);if(!data.length)return;const type=$('input[name=exportType]:checked').value;let rows;if(type==='notes'){rows=[['Arquivo','Chave','Numero','Serie','Emissao','CNPJ Emitente','Emitente','CNPJ Destinatario','Destinatario','Valor Total'],...data.map(r=>[r.name,r.key,r.number,r.series,r.date,r.emit.cnpj,r.emit.name,r.dest.cnpj,r.dest.name,r.total])]}else{rows=[['Arquivo','Nota','CNPJ Emitente','Emitente','Item','Codigo','Produto','NCM','CFOP','Quantidade','Unidade','Valor Unitario','Valor Total'],...data.flatMap(r=>r.items.map(i=>[r.name,r.number,r.emit.cnpj,r.emit.name,i.n,i.cProd,i.xProd,i.ncm,i.cfop,i.qCom,i.uCom,i.vUnCom,i.vProd]))]}const csv='\uFEFF'+rows.map(r=>r.map(v=>{let cell=String(v??'');if(/^[=+\-@\t\r]/.test(cell))cell="'"+cell;return '"'+cell.replace(/"/g,'""')+'"'}).join(';')).join('\r\n');download(type==='notes'?'notas-fiscais.csv':'itens-notas.csv',csv,'text/csv;charset=utf-8');$('#exportResult').innerHTML=`<div class="alert success">Arquivo exportado com ${data.length} nota(s).</div>`};
function renderReport(){const rows=state.records;$('#reportContent').innerHTML=rows.length?`<div class="details-grid"><div class="detail-card"><small>Processados</small><strong>${state.processed}</strong></div><div class="detail-card"><small>Válidos</small><strong>${state.valid}</strong></div><div class="detail-card"><small>Inconsistências</small><strong>${state.errors}</strong></div><div class="detail-card"><small>Duplicidades</small><strong>${state.dupes}</strong></div></div><div class="data-section"><table class="data-table"><thead><tr><th>Horário</th><th>Arquivo</th><th>Nota</th><th>Emitente</th><th>Valor</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.time.toLocaleTimeString('pt-BR')}</td><td>${clean(r.name)}</td><td>${clean(r.number)}</td><td>${clean(r.emit)}</td><td>${money(r.total)}</td><td>${r.ok?'Válido':'Revisar'}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-panel"><span>▥</span><h3>A sessão ainda está vazia</h3><p>Os documentos processados aparecerão neste relatório.</p></div>`}
function download(name,data,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#clearSession').onclick=()=>{Object.assign(state,{processed:0,valid:0,errors:0,dupes:0,records:[]});updateStats();toast('Sessão limpa')};

let lastCnpjResult=null;
function cnpjDate(value){if(!value)return '—';const raw=String(value),ymd=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);if(ymd)return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;const date=new Date(raw);return Number.isNaN(date.getTime())?clean(raw):date.toLocaleDateString('pt-BR')}
function cnpjOption(value){if(!value?.informado)return 'Não informado';return value.optante?`Sim${value.inicio?' · desde '+cnpjDate(value.inicio):''}`:`Não${value.fim?' · excluído em '+cnpjDate(value.fim):''}`}
function cnpjAddress(value={}){return [value.logradouro,value.numero,value.complemento,value.bairro,value.cep].filter(Boolean).join(', ')||'—'}
function cnpjActivityRows(items){return items.map(item=>`<div class="activity-row"><strong>${clean(item.codigo||'Sem código')}</strong><span>${clean(item.descricao||'Sem descrição')}</span></div>`).join('')}
function cnpjPartnerRows(items){return items.map(item=>`<div class="partner-row"><strong>${clean(item.nome||'Não informado')}</strong><span>${clean(item.qualificacao||item.tipo||'Qualificação não informada')}</span><small>${clean([item.tipo,item.entrada?'Entrada: '+cnpjDate(item.entrada):'',item.faixaEtaria].filter(Boolean).join(' · '))}</small></div>`).join('')}
function sefazCredential(value){const labels={'0':'Não credenciado','1':'Credenciado','2':'Credenciado e obrigado em todas as operações','3':'Credenciado com obrigatoriedade parcial','4':'A SEFAZ não fornece esta informação'};return labels[value]||value||'Não informado'}
function sefazCadastroHtml(data){
  const records=data.records||[];
  const cards=records.map(record=>`<article><div class="official-registration-head"><div><small>Inscrição Estadual oficial</small><strong>${clean(record.ie||'IE não informada')}</strong><span>${clean(record.uf||data.requestedUf||'—')} · ${clean(record.status||record.reason||'Situação não informada')}</span></div><span class="official-badge">SEFAZ ${clean(data.requestedUf||record.uf||'')}</span></div><div class="official-tax-type"><small>Tipo fiscal confirmado</small><strong>${record.statusCode==='1'?'Contribuinte habilitado':record.statusCode==='0'?'Contribuinte não habilitado':clean(record.status||'Situação não informada')}</strong></div><div class="kv-grid"><div><small>Razão social</small><strong>${clean(record.name||'—')}</strong></div><div><small>Regime de apuração</small><strong>${clean(record.taxRegime||'—')}</strong></div><div><small>CNAE</small><strong>${clean(record.cnae||'—')}</strong></div><div><small>Credenciamento NF-e</small><strong>${clean(sefazCredential(record.nfeAccredited))}</strong></div><div><small>Início da atividade</small><strong>${cnpjDate(record.activityStart)}</strong></div><div><small>Última situação</small><strong>${cnpjDate(record.statusDate)}</strong></div></div></article>`).join('');
  return `<div class="official-registration result"><div class="official-registration-title"><div><small>Resposta oficial · ${clean(data.environment==='production'?'Produção':'Homologação')}</small><h4>${clean(data.reason||'Consulta Cadastro processada')}</h4></div><span>cStat ${clean(data.status||'—')}</span></div>${cards||'<p>Nenhuma inscrição estadual foi retornada para este CNPJ e esta UF.</p>'}<small>Consultado em ${cnpjDate(data.consultedAt)} pelo autorizador ${clean(data.authorizer||data.requestedUf||'—')}.</small></div>`
}
async function querySefazCadastro(data){
  const result=$('#sefazCadastroResult'),button=$('#querySefazCadastro');
  button.disabled=true;button.textContent='Consultando SEFAZ…';result.innerHTML='<div class="sefaz-loading"><span></span>Autenticando com o certificado A1 e consultando o cadastro estadual.</div>';
  try{const response=await apiFetch('/api/sefaz/consulta-cadastro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cnpj:data.cnpj,uf:data.uf,environment:'production'})});const payload=await apiPayload(response);if(!response.ok)throw new Error(readableError(payload,'Consulta estadual indisponível.'));result.innerHTML=sefazCadastroHtml(payload)}catch(error){result.innerHTML=`<div class="alert error"><strong>Consulta oficial não concluída.</strong><br>${clean(readableError(error,'Consulta estadual indisponível.'))}</div>`}finally{button.disabled=false;button.textContent='Consultar IE oficial na SEFAZ'}
}
function cnpjFullCard(c){
  const ies=c.inscricoesEstaduais||[],activeIes=ies.filter(item=>item.ativa);
  const mainIe=activeIes.find(item=>item.uf===c.uf)||activeIes[0]||ies.find(item=>item.uf===c.uf)||ies[0];
  const taxpayer=activeIes.length?'Contribuinte do ICMS':ies.length?'Cadastro estadual sem IE ativa':'Não identificado';
  const ieStatus=mainIe?(mainIe.ativa?'Ativa':'Inativa ou situação indefinida'):'Não informada';
  const ieHtml=ies.length?ies.map(item=>`<span class="ie-chip ${item.ativa?'active-ie':''}">${clean(item.numero||'—')} · ${clean(item.uf||c.uf||'—')} · ${item.ativa?'Ativa':'Inativa/indefinida'}</span>`).join(''):'<span class="no-data">Nenhuma Inscrição Estadual retornada</span>';
  const active=String(c.situacao||'').toUpperCase().includes('ATIV');
  const secondaries=c.atividadesSecundarias||[],partners=c.socios||[];
  const sources=(c.fontes||[]).map(source=>`<span class="source-chip">${clean(source.nome)}${source.atualizadoEm?' · '+cnpjDate(source.atualizadoEm):''}</span>`).join('');
  const failures=(c.falhas||[]).length?`<div class="fallback-note">Fonte indisponível: ${c.falhas.map(item=>`${clean(item.fonte)} (${clean(item.erro)})`).join('; ')}.</div>`:'';
  return `<div class="company-head"><div><h3>${clean(c.razao||'Empresa')}</h3><p>${clean(c.fantasia||'Sem nome fantasia')} • ${cnpjFmt(c.cnpj)}</p><div class="company-meta"><span>${clean(c.tipo||'Matriz/filial não informado')}</span><span>${clean(c.porte||'Porte não informado')}</span></div></div><div class="company-status"><span class="active-tag ${active?'':'status-tag inactive'}">${clean(c.situacao||'Situação não informada')}</span><small>Consultado em ${cnpjDate(c.consultadoEm)}</small></div></div>
  <div class="fiscal-summary"><div class="fiscal-main"><small>Inscrição Estadual</small><strong>${clean(mainIe?.numero||'Não informada')}</strong><span>${clean(mainIe?.uf||c.uf||'UF não informada')}</span></div><div><small>Tipo fiscal</small><strong>${clean(taxpayer)}</strong><span>${activeIes.length?'Possui IE ativa retornada':'Confirme na SEFAZ da UF'}</span></div><div><small>Situação da IE</small><strong>${clean(ieStatus)}</strong><span>${mainIe?.ativa?'Cadastro estadual localizado':'Sem confirmação de IE ativa'}</span></div></div>
  ${ies.length>1?`<div class="ie-list other-ies"><small>Outras inscrições estaduais retornadas</small>${ieHtml}</div>`:''}
  <div class="company-section"><h4>Cadastro e localização</h4><div class="kv-grid"><div><small>Cidade / UF</small><strong>${clean((c.municipio||'—')+' / '+(c.uf||'—'))}</strong></div><div><small>Código IBGE</small><strong>${clean(c.ibge||'—')}</strong></div><div><small>Início da atividade</small><strong>${cnpjDate(c.inicio)}</strong></div><div><small>Natureza jurídica</small><strong>${clean(c.natureza||'—')}</strong></div><div><small>Data da situação</small><strong>${cnpjDate(c.dataSituacao)}</strong></div><div><small>Motivo da situação</small><strong>${clean(c.motivoSituacao||'—')}</strong></div><div><small>Endereço</small><strong>${clean(cnpjAddress(c.endereco))}</strong></div><div><small>Telefone(s)</small><strong>${clean((c.telefones||[]).join(' · ')||'—')}</strong></div><div><small>E-mail(s)</small><strong>${clean((c.emails||[]).join(' · ')||'—')}</strong></div></div></div>
  <div class="company-section"><h4>Enquadramento fiscal</h4><div class="kv-grid"><div><small>CNAE principal</small><strong>${clean(c.atividadePrincipal?.codigo||'—')} · ${clean(c.atividadePrincipal?.descricao||'—')}</strong></div><div><small>Simples Nacional</small><strong>${clean(cnpjOption(c.simples))}</strong></div><div><small>MEI</small><strong>${clean(cnpjOption(c.mei))}</strong></div><div><small>Capital social</small><strong>${c.capital!==null&&c.capital!==undefined?money(c.capital):'—'}</strong></div><div><small>Situação especial</small><strong>${clean(c.situacaoEspecial||'—')}</strong></div><div><small>Data da situação especial</small><strong>${cnpjDate(c.dataSituacaoEspecial)}</strong></div></div></div>
  ${secondaries.length?`<div class="company-section"><div class="company-section-head"><h4>Atividades secundárias</h4><small>${secondaries.length} CNAE(s)</small></div><div class="activity-list">${cnpjActivityRows(secondaries.slice(0,8))}</div>${secondaries.length>8?`<details><summary>Mostrar outros ${secondaries.length-8} CNAEs</summary><div class="activity-list">${cnpjActivityRows(secondaries.slice(8))}</div></details>`:''}</div>`:''}
  ${partners.length?`<div class="company-section"><div class="company-section-head"><h4>Quadro societário</h4><small>${partners.length} registro(s)</small></div><div class="partner-list">${cnpjPartnerRows(partners.slice(0,8))}</div>${partners.length>8?`<details><summary>Mostrar outros ${partners.length-8} registros</summary><div class="partner-list">${cnpjPartnerRows(partners.slice(8))}</div></details>`:''}</div>`:''}
  <div class="company-section"><h4>Fontes e atualização</h4><div class="source-list">${sources||'<span class="no-data">Fonte não informada</span>'}</div>${failures}</div>
  <div class="company-actions"><button class="primary-btn" id="querySefazCadastro">Consultar IE oficial na SEFAZ</button><button class="secondary-btn" id="copyCnpjData">Copiar resumo</button><button class="secondary-btn" id="newCnpjSearch">Nova consulta</button></div><div id="sefazCadastroResult"></div>
  <div class="cnpj-disclaimer">As APIs agregam dados públicos e podem apresentar defasagem. “Não identificado” não significa “não contribuinte”. Use “Consultar IE oficial na SEFAZ” para verificar o cadastro estadual quando a UF disponibilizar o serviço.</div>`;
}
async function runCnpjLookup(){
  const cnpj=digits($('#cnpjInput').value),mode=$('#cnpjProvider').value;
  if(!validCnpj(cnpj))return toast('Informe um CNPJ válido');
  const box=$('#cnpjResult');box.className='empty-panel compact';box.innerHTML='<span>…</span><h3>Consultando dados cadastrais e fiscais</h3><p>As fontes públicas podem levar alguns segundos.</p>';
  try{
    const response=await apiFetch(`/api/cnpj/${cnpj}?mode=${encodeURIComponent(mode)}`,{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await apiPayload(response);if(!response.ok)throw new Error(readableError(data,'Consulta indisponível.'));
    lastCnpjResult=data;box.className='company-card';box.innerHTML=cnpjFullCard(data);
    $('#querySefazCadastro').onclick=()=>querySefazCadastro(data);
    $('#copyCnpjData').onclick=async()=>{const lines=[data.razao,cnpjFmt(data.cnpj),`Situação: ${data.situacao||'—'}`,`Cidade/UF: ${data.municipio||'—'} / ${data.uf||'—'}`,`IE: ${(data.inscricoesEstaduais||[]).map(i=>i.numero+' '+(i.uf||'')).join(', ')||'não retornada'}`,`CNAE: ${data.atividadePrincipal?.codigo||'—'} · ${data.atividadePrincipal?.descricao||'—'}`];await navigator.clipboard.writeText(lines.join('\n'));toast('Resumo do CNPJ copiado')};
    $('#newCnpjSearch').onclick=()=>{$('#cnpjInput').value='';box.className='empty-panel compact';box.innerHTML='<span>⌕</span><h3>Faça uma consulta</h3><p>Os dados cadastrais aparecerão aqui.</p>';$('#cnpjInput').focus()};
  }catch(error){box.className='empty-panel compact';box.innerHTML=`<span>!</span><h3>Consulta não concluída</h3><p>${clean(readableError(error))}</p>`}
}
$('#searchCnpj').onclick=runCnpjLookup;
$('#cnpjInput').onkeydown=event=>{if(event.key==='Enter')runCnpjLookup()};



const ufCodes={'11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF'};
const emissionTypes={'1':'Normal','2':'Contingência FS-IA','3':'SCAN','4':'DPEC','5':'Contingência FS-DA','6':'SVC-AN','7':'SVC-RS','9':'Contingência offline'};
function accessKeyDigit(key43){let sum=0,weight=2;for(let i=key43.length-1;i>=0;i--){sum+=Number(key43[i])*weight;weight=weight===9?2:weight+1}const value=11-(sum%11);return value===10||value===11?0:value}
function formatAccessKey(value){return digits(value).slice(0,44).replace(/(.{4})/g,'$1 ').trim()}
function keyIssue(label,detail){return `<li><span>×</span><div><strong>${clean(label)}</strong><small>${clean(detail)}</small></div></li>`}
function sefazResultHtml(data){
  const cancelEvent=(data.events||[]).find(event=>/cancel/i.test(event.description||''));
  const code=cancelEvent?.status||data.protocol?.status||data.status;
  const authorized=['100','150'].includes(data.protocol?.status||data.status),denied=(data.protocol?.status||data.status)==='110',cancelled=!!cancelEvent||['101','151'].includes(data.status);
  const tone=cancelled||denied?'bad':authorized?'ok':'pending';
  const statusTitles={'217':'NF-e não localizada','526':'Chave muito antiga para esta consulta'};
  const title=cancelled?'NF-e cancelada':denied?'Uso denegado':authorized?'NF-e autorizada':statusTitles[data.status]||'Resposta recebida da SEFAZ';
  const protocol=data.protocol?`<div class="sefaz-detail-grid"><div><small>Protocolo</small><strong>${clean(data.protocol.number||'—')}</strong></div><div><small>Data de autorização</small><strong>${clean(data.protocol.receivedAt||'—')}</strong></div><div><small>Status do protocolo</small><strong>${clean((data.protocol.status||'—')+' · '+(data.protocol.reason||'Sem descrição'))}</strong></div></div>`:'';
  const events=(data.events||[]).length?`<div class="sefaz-events"><h4>Eventos (${data.events.length})</h4>${data.events.map(event=>`<article><strong>${clean(event.description||'Evento '+(event.type||''))}</strong><span>${clean((event.status||'—')+' · '+(event.reason||'Sem descrição'))}</span><small>${clean([event.protocol,event.receivedAt].filter(Boolean).join(' · ')||'Sem protocolo informado')}</small>${event.relatedKey?`<code>${clean(event.relatedKey)}</code>`:''}</article>`).join('')}</div>`:'';
  const related=(data.relatedKeys||[]).length?`<div class="linked-keys"><h4>Chaves vinculadas retornadas</h4>${data.relatedKeys.map(key=>`<code>${clean(formatAccessKey(key))}</code>`).join('')}</div>`:'';
  return `<div class="sefaz-status result ${tone}"><span class="status-dot ${tone}"></span><div><small>Situação oficial na SEFAZ · ${clean(data.environment==='production'?'Produção':'Homologação')} · ${clean(data.uf||'')}</small><strong>${clean(title)}</strong><p>cStat ${clean(code||data.status||'—')} · ${clean(cancelEvent?.reason||data.protocol?.reason||data.reason||'Sem descrição')}</p><em>Consultado em ${clean(new Date(data.consultedAt).toLocaleString('pt-BR'))} pelo autorizador ${clean(data.authorizer||data.uf||'—')}.</em></div></div>${protocol}${events}${related}`;
}
async function queryOfficialSefaz(key){
  const button=$('#querySefaz'),target=$('#sefazOfficialResult'),environment=$('#sefazEnvironment').value;
  button.disabled=true;button.textContent='Consultando…';target.innerHTML='<div class="sefaz-loading"><span></span>Conectando com certificado digital e aguardando a SEFAZ.</div>';
  try{const response=await apiFetch('/api/sefaz/consulta-protocolo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,environment})});const data=await apiPayload(response);if(!response.ok)throw new Error(readableError(data,'Consulta não concluída.'));target.innerHTML=sefazResultHtml(data)}
  catch(error){target.innerHTML=`<div class="alert error"><strong>Consulta oficial não concluída.</strong><br>${clean(readableError(error))}</div>`}
  finally{button.disabled=false;button.textContent='Consultar SEFAZ'}
}
function analyzeAccessKey(){
  const key=digits($('#accessKeyInput').value),box=$('#keyResult');
  if(key.length!==44){const missing=Math.max(0,44-key.length);box.className='empty-panel compact';box.innerHTML=`<span>!</span><h3>${key.length?'Chave incompleta':'Informe uma chave'}</h3><p>${key.length?`Foram informados ${key.length} dígitos. Faltam ${missing} para completar a chave.`:'Cole ou digite os 44 dígitos da chave de acesso.'}</p>`;return}
  const uf=key.slice(0,2),year='20'+key.slice(2,4),month=key.slice(4,6),cnpj=key.slice(6,20),model=key.slice(20,22),seriesRaw=key.slice(22,25),numberRaw=key.slice(25,34),emission=key[34],numericCode=key.slice(35,43),received=Number(key[43]),expected=accessKeyDigit(key.slice(0,43));
  const issues=[];
  if(!ufCodes[uf])issues.push(['Código da UF inválido',`O início ${uf} não corresponde a uma UF brasileira.`]);
  if(Number(month)<1||Number(month)>12)issues.push(['Mês de emissão inválido',`A chave informa o mês ${month}.`]);
  if(!validCnpj(cnpj))issues.push(['CNPJ do emitente inválido',`${cnpjFmt(cnpj)} não passa na conferência dos dígitos verificadores.`]);
  if(model!=='55')issues.push(['Modelo diferente de NF-e',`A chave informa o modelo ${model}. Esta ferramenta e o link oficial são destinados à NF-e modelo 55.`]);
  if(!emissionTypes[emission])issues.push(['Tipo de emissão desconhecido',`O código de emissão ${emission} não é reconhecido pela NF-e.`]);
  if(expected!==received)issues.push(['Dígito verificador inválido',`O último dígito é ${received}, mas o cálculo da chave resulta em ${expected}.`]);
  if(issues.length){box.className='company-card key-invalid';box.innerHTML=`<div class="validation-head"><span class="big-status bad">!</span><div><h3>Chave com ${issues.length===1?'1 inconsistência':issues.length+' inconsistências'}</h3><p>Não use esta chave para confirmar a situação fiscal antes de corrigir os pontos abaixo.</p></div></div><ul class="key-issues">${issues.map(i=>keyIssue(i[0],i[1])).join('')}</ul><div class="key-code"><small>Chave informada</small><strong>${clean(formatAccessKey(key))}</strong></div>`;return}
  const series=String(Number(seriesRaw)),number=String(Number(numberRaw));
  box.className='company-card';box.innerHTML=`<div class="validation-head"><span class="big-status ok">✓</span><div><h3>Chave estruturalmente válida</h3><p>Formato, UF, período, CNPJ e dígito verificador conferem.</p></div></div><div class="key-code"><small>Chave decodificada</small><strong>${clean(formatAccessKey(key))}</strong><button class="text-btn" id="copyAccessKey">Copiar sem espaços</button></div><div class="key-grid"><div><small>UF do emitente</small><strong>${clean(ufCodes[uf])} · código ${uf}</strong></div><div><small>Período de emissão</small><strong>${month}/${year}</strong></div><div><small>CNPJ do emitente</small><strong>${cnpjFmt(cnpj)}</strong></div><div><small>Modelo</small><strong>55 · NF-e</strong></div><div><small>Série</small><strong>${clean(series)}</strong></div><div><small>Número da nota</small><strong>${clean(number)}</strong></div><div><small>Tipo de emissão</small><strong>${clean(emissionTypes[emission])}</strong></div><div><small>Código numérico / DV</small><strong>${clean(numericCode)} / ${received}</strong></div></div><div id="sefazOfficialResult"><div class="sefaz-status"><span class="status-dot pending"></span><div><small>Situação na SEFAZ</small><strong>Ainda não consultada</strong><p>A validade matemática da chave não comprova autorização, cancelamento ou denegação.</p></div></div></div><div class="official-query"><div><strong>Consulta direta com certificado A1</strong><p>O servidor enviará somente a chave e o ambiente ao Web Service oficial do autorizador da UF.</p></div><div class="official-actions"><button class="primary-btn" id="querySefaz">Consultar SEFAZ</button><a class="secondary-btn" href="https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&amp;tipoConteudo=7PhJ%2BgAVw2g%3D" target="_blank" rel="noopener noreferrer">Abrir portal</a></div></div><div class="alert info">A consulta é somente de leitura. Ela não autoriza, cancela ou altera a NF-e.</div>`;
  $('#copyAccessKey').onclick=async()=>{await navigator.clipboard.writeText(key);toast('Chave copiada sem espaços')};
  $('#querySefaz').onclick=()=>queryOfficialSefaz(key);
}
$('#accessKeyInput').oninput=e=>{e.target.value=formatAccessKey(e.target.value);$('#keyCount').textContent=`${digits(e.target.value).length}/44 dígitos`};
$('#accessKeyInput').onkeydown=e=>{if(e.key==='Enter')analyzeAccessKey()};
$('#analyzeKey').onclick=analyzeAccessKey;
