const PROVIDERS = {
  cnpjws: {
    label: 'CNPJ.ws',
    url: cnpj => `https://publica.cnpj.ws/cnpj/${cnpj}`,
    normalize(raw) {
      const e = raw.estabelecimento || {};
      const phones = [[e.ddd1,e.telefone1],[e.ddd2,e.telefone2]].map(parts=>parts.filter(Boolean).join(' ')).filter(Boolean);
      return {
        razao: raw.razao_social, fantasia: e.nome_fantasia, cnpj: e.cnpj,
        situacao: e.situacao_cadastral, motivoSituacao: e.motivo_situacao_cadastral,
        dataSituacao: e.data_situacao_cadastral, inicio: e.data_inicio_atividade,
        tipo: e.tipo, porte: raw.porte?.descricao, natureza: raw.natureza_juridica?.descricao,
        capital: numberOrNull(raw.capital_social), municipio: e.cidade?.nome, uf: e.estado?.sigla,
        ibge: e.cidade?.ibge_id, endereco: address(e), telefones: phones,
        emails: [e.email].filter(Boolean),
        atividadePrincipal: activity(e.atividade_principal),
        atividadesSecundarias: (e.atividades_secundarias || []).map(activity).filter(Boolean),
        inscricoesEstaduais: (e.inscricoes_estaduais || []).map(i=>({numero:i.inscricao_estadual,uf:i.estado?.sigla,ativa:i.ativo===true,atualizadoEm:i.atualizado_em})),
        simples: option(raw.simples?.simples,raw.simples?.data_opcao_simples,raw.simples?.data_exclusao_simples),
        mei: option(raw.simples?.mei,raw.simples?.data_opcao_mei,raw.simples?.data_exclusao_mei),
        socios: (raw.socios || []).map(s=>({nome:s.nome,tipo:s.tipo,qualificacao:s.qualificacao_socio?.descricao,entrada:s.data_entrada,faixaEtaria:s.faixa_etaria})),
        situacaoEspecial: e.situacao_especial, dataSituacaoEspecial: e.data_situacao_especial,
        atualizadoEm: e.atualizado_em || raw.atualizado_em
      };
    }
  },
  brasilapi: {
    label: 'BrasilAPI',
    url: cnpj => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    normalize(raw) {
      return {
        razao:raw.razao_social, fantasia:raw.nome_fantasia, cnpj:raw.cnpj,
        situacao:raw.descricao_situacao_cadastral, motivoSituacao:raw.descricao_motivo_situacao_cadastral,
        dataSituacao:raw.data_situacao_cadastral, inicio:raw.data_inicio_atividade,
        tipo:raw.descricao_identificador_matriz_filial, porte:raw.porte, natureza:raw.natureza_juridica,
        capital:numberOrNull(raw.capital_social), municipio:raw.municipio, uf:raw.uf,
        ibge:raw.codigo_municipio_ibge, endereco:address(raw),
        telefones:[raw.ddd_telefone_1,raw.ddd_telefone_2].filter(Boolean), emails:[raw.email].filter(Boolean),
        atividadePrincipal:activity({id:raw.cnae_fiscal,descricao:raw.cnae_fiscal_descricao}),
        atividadesSecundarias:(raw.cnaes_secundarios||[]).map(c=>activity({id:c.codigo,descricao:c.descricao})).filter(Boolean),
        inscricoesEstaduais:[], simples:option(raw.opcao_pelo_simples,raw.data_opcao_pelo_simples,raw.data_exclusao_do_simples),
        mei:option(raw.opcao_pelo_mei,raw.data_opcao_pelo_mei,raw.data_exclusao_do_mei),
        socios:(raw.qsa||[]).map(s=>({nome:s.nome_socio,tipo:s.identificador_de_socio,qualificacao:s.qualificacao_socio,entrada:s.data_entrada_sociedade,faixaEtaria:s.faixa_etaria})),
        situacaoEspecial:raw.situacao_especial, dataSituacaoEspecial:raw.data_situacao_especial,
        atualizadoEm:null
      };
    }
  },
  receitaws: {
    label: 'ReceitaWS',
    url: cnpj => `https://www.receitaws.com.br/v1/cnpj/${cnpj}`,
    normalize(raw) {
      if(raw.status && raw.status !== 'OK') throw new Error(raw.message || 'Consulta recusada');
      return {
        razao:raw.nome, fantasia:raw.fantasia, cnpj:raw.cnpj, situacao:raw.situacao,
        motivoSituacao:raw.motivo_situacao, dataSituacao:raw.data_situacao, inicio:raw.abertura,
        tipo:raw.tipo, porte:raw.porte, natureza:raw.natureza_juridica,
        capital:numberOrNull(String(raw.capital_social||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.')),
        municipio:raw.municipio, uf:raw.uf, endereco:address(raw),
        telefones:[raw.telefone].filter(Boolean), emails:[raw.email].filter(Boolean),
        atividadePrincipal:activity(raw.atividade_principal?.[0]),
        atividadesSecundarias:(raw.atividades_secundarias||[]).map(activity).filter(Boolean),
        inscricoesEstaduais:[], simples:option(raw.simples?.optante,raw.simples?.data_opcao,raw.simples?.data_exclusao),
        mei:option(raw.simei?.optante,raw.simei?.data_opcao,raw.simei?.data_exclusao),
        socios:(raw.qsa||[]).map(s=>({nome:s.nome,tipo:s.tipo,qualificacao:s.qual,entrada:s.data_entrada,faixaEtaria:s.faixa_etaria})),
        atualizadoEm:raw.ultima_atualizacao
      };
    }
  }
};

function numberOrNull(value){const number=Number(value);return Number.isFinite(number)?number:null}
function activity(value){if(!value)return null;return {codigo:String(value.id||value.code||value.codigo||'').trim(),descricao:value.descricao||value.text||''}}
function address(value){return {logradouro:[value.descricao_tipo_de_logradouro||value.tipo_logradouro,value.logradouro].filter(Boolean).join(' '),numero:value.numero,complemento:value.complemento,bairro:value.bairro,cep:value.cep}}
function option(value,start,end){return {optante:value===true||String(value).toLowerCase()==='sim',informado:value!==undefined&&value!==null&&value!=='',inicio:start||null,fim:end||null}}
function unique(items,key){const map=new Map();for(const item of items.filter(Boolean)){const id=key(item);if(id&&!map.has(id))map.set(id,item)}return [...map.values()]}
function first(results,field){for(const result of results){const value=result.data[field];if(value!==undefined&&value!==null&&value!==''&&(!(Array.isArray(value))||value.length))return value}return null}
function merge(results,cnpj){
  const merged={cnpj};
  for(const field of ['razao','fantasia','situacao','motivoSituacao','dataSituacao','inicio','tipo','porte','natureza','capital','municipio','uf','ibge','situacaoEspecial','dataSituacaoEspecial'])merged[field]=first(results,field);
  merged.endereco=first(results,'endereco')||{};
  merged.telefones=unique(results.flatMap(r=>r.data.telefones||[]),v=>String(v).replace(/\D/g,''));
  merged.emails=unique(results.flatMap(r=>r.data.emails||[]),v=>String(v).toLowerCase());
  merged.atividadePrincipal=first(results,'atividadePrincipal');
  merged.atividadesSecundarias=unique(results.flatMap(r=>r.data.atividadesSecundarias||[]),v=>v.codigo||v.descricao).slice(0,40);
  merged.inscricoesEstaduais=unique(results.flatMap(r=>r.data.inscricoesEstaduais||[]),v=>`${v.uf||''}:${v.numero||''}`);
  merged.socios=unique(results.flatMap(r=>r.data.socios||[]),v=>`${v.nome||''}:${v.qualificacao||''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase()).slice(0,50);
  merged.simples=first(results,'simples'); merged.mei=first(results,'mei');
  merged.fontes=results.map(r=>({nome:r.label,atualizadoEm:r.data.atualizadoEm||null}));
  merged.consultadoEm=new Date().toISOString();
  return merged;
}
function validCnpj(value){
  const cnpj=String(value).replace(/\D/g,'');
  if(cnpj.length!==14||/^(\d)\1+$/.test(cnpj))return false;
  const digit=len=>{let sum=0,pos=len-7;for(let i=len;i>=1;i--){sum+=Number(cnpj[len-i])*pos--;if(pos<2)pos=9}const mod=sum%11;return mod<2?0:11-mod};
  return digit(12)===Number(cnpj[12])&&digit(13)===Number(cnpj[13]);
}
async function fetchProvider(key,cnpj,fetchFn){
  const provider=PROVIDERS[key];
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12_000);
  try{
    const response=await fetchFn(provider.url(cnpj),{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'iSev-Fiscal/1.0'}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=provider.normalize(await response.json());
    if(!data.razao)throw new Error('Resposta sem razão social');
    return {key,label:provider.label,data};
  }finally{clearTimeout(timeout)}
}

export async function lookupCnpj(value,mode='complete',fetchFn=fetch){
  const cnpj=String(value).replace(/\D/g,'');
  if(!validCnpj(cnpj))throw Object.assign(new Error('CNPJ inválido.'),{status:400,code:'INVALID_CNPJ'});
  if(mode!=='complete'&&!PROVIDERS[mode])throw Object.assign(new Error('Fonte de consulta inválida.'),{status:400,code:'INVALID_PROVIDER'});
  const keys=mode==='complete'?['cnpjws','brasilapi']:[mode];
  let settled=await Promise.allSettled(keys.map(key=>fetchProvider(key,cnpj,fetchFn)));
  let success=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
  const failures=settled.map((result,index)=>result.status==='rejected'?{fonte:PROVIDERS[keys[index]]?.label||'Fonte',erro:result.reason?.name==='AbortError'?'Tempo excedido':result.reason?.message||'Falha'}:null).filter(Boolean);
  if(!success.length&&mode==='complete'){
    try{success=[await fetchProvider('receitaws',cnpj,fetchFn)]}catch(error){failures.push({fonte:'ReceitaWS',erro:error.name==='AbortError'?'Tempo excedido':error.message})}
  }
  if(!success.length)throw Object.assign(new Error('Nenhuma fonte respondeu à consulta.'),{status:502,code:'CNPJ_PROVIDERS_UNAVAILABLE',details:failures});
  return {...merge(success,cnpj),falhas:failures};
}

export { validCnpj };
