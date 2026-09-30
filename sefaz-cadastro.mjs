import { requestSoap, tlsOptions } from './sefaz.mjs';

const SOAP_ACTION='http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4/consultaCadastro';
const endpoints={
  AM:{production:'https://nfe.sefaz.am.gov.br/services2/services/CadConsultaCadastro4',homologation:'https://homnfe.sefaz.am.gov.br/services2/services/CadConsultaCadastro4'},
  BA:{production:'https://nfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx',homologation:'https://hnfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx'},
  GO:{production:'https://nfe.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4',homologation:'https://homolog.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4'},
  MG:{production:'https://nfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4',homologation:'https://hnfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4'},
  MS:{production:'https://nfe.sefaz.ms.gov.br/ws/CadConsultaCadastro4',homologation:'https://hom.nfe.sefaz.ms.gov.br/ws/CadConsultaCadastro4'},
  MT:{production:'https://nfe.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4',homologation:'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4'},
  PE:{production:'https://nfe.sefaz.pe.gov.br/nfe-service/services/CadConsultaCadastro4',homologation:'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/CadConsultaCadastro4'},
  PR:{production:'https://nfe.sefa.pr.gov.br/nfe/CadConsultaCadastro4',homologation:'https://homologacao.nfe.sefa.pr.gov.br/nfe/CadConsultaCadastro4'},
  RS:{production:'https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx',homologation:'https://cad-homologacao.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx'},
  SP:{production:'https://nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx',homologation:'https://homologacao.nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx'},
  SVRS:{production:'https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx',homologation:'https://cad-homologacao.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx'}
};
const svrs=new Set(['AC','ES','RN','PB','SC']);
const validUfs=new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']);

function escapeXml(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function decodeXml(value=''){return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim()}
function tag(xml,name){const match=xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,'i'));return match?decodeXml(match[1].replace(/<[^>]+>/g,'')):''}
function block(xml,name){const match=xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,'i'));return match?match[1]:''}
function blocks(xml,name){return [...xml.matchAll(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,'gi'))].map(match=>match[1])}
function yes(value){return value==='1'||/^s(im)?$/i.test(value)}

function routeFor(uf,environment){
  const authorizer=svrs.has(uf)?'SVRS':uf;
  const endpoint=endpoints[authorizer]?.[environment];
  if(!endpoint)throw Object.assign(new Error(`A UF ${uf} não possui uma rota oficial de Consulta Cadastro configurada no portal da NF-e.`),{status:422,code:'CADASTRO_UF_UNAVAILABLE'});
  return {authorizer,endpoint};
}
function envelope(uf,document){
  return `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4"><ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00"><infCons><xServ>CONS-CAD</xServ><UF>${escapeXml(uf)}</UF><CNPJ>${escapeXml(document)}</CNPJ></infCons></ConsCad></nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

export function parseCadastroResponse(xml){
  const fault=block(xml,'Fault');
  if(fault)throw Object.assign(new Error(tag(fault,'Reason')||tag(fault,'faultstring')||'A SEFAZ retornou uma falha SOAP.'),{code:'SEFAZ_SOAP_FAULT'});
  const result=block(xml,'retConsCad')||block(xml,'nfeResultMsg');
  if(!result)throw Object.assign(new Error('Resposta cadastral da SEFAZ em formato inesperado.'),{code:'INVALID_CADASTRO_RESPONSE'});
  const records=blocks(result,'infCad').map(record=>{
    const statusCode=tag(record,'cSit');
    return {
    ie:tag(record,'IE'),cnpj:tag(record,'CNPJ'),cpf:tag(record,'CPF'),uf:tag(record,'UF'),
    statusCode,status:tag(record,'xSit')||({'0':'Não habilitado','1':'Habilitado'}[statusCode]||'Situação não informada'),reason:tag(record,'xMotivo'),
    name:tag(record,'xNome'),fantasyName:tag(record,'xFant'),taxRegime:tag(record,'xRegApur'),
    cnae:tag(record,'CNAE'),activityStart:tag(record,'dIniAtiv'),statusDate:tag(record,'dUltSit'),
    currentIe:tag(record,'IEAtual'),singleIe:yes(tag(record,'IEUnica')),
    nfeAccredited:tag(record,'indCredNFe'),cteAccredited:tag(record,'indCredCTe'),
    address:{street:tag(record,'xLgr'),number:tag(record,'nro'),complement:tag(record,'xCpl'),district:tag(record,'xBairro'),cityCode:tag(record,'cMun'),city:tag(record,'xMun'),zip:tag(record,'CEP')}
  }});
  return {status:tag(result,'cStat'),reason:tag(result,'xMotivo'),uf:tag(result,'UF'),records};
}

export async function queryCadastro(cnpj,uf,environment='production'){
  const document=String(cnpj).replace(/\D/g,'');
  const state=String(uf||'').toUpperCase();
  if(!/^\d{14}$/.test(document))throw Object.assign(new Error('CNPJ inválido para a consulta cadastral.'),{status:400,code:'INVALID_CNPJ'});
  if(!validUfs.has(state))throw Object.assign(new Error('UF inválida para a consulta cadastral.'),{status:400,code:'INVALID_UF'});
  if(!['production','homologation'].includes(environment))throw Object.assign(new Error('Ambiente da SEFAZ inválido.'),{status:400,code:'INVALID_ENVIRONMENT'});
  const route=routeFor(state,environment),options=await tlsOptions();
  const xml=await requestSoap(route.endpoint,envelope(state,document),options,SOAP_ACTION);
  return {...parseCadastroResponse(xml),environment,requestedUf:state,authorizer:route.authorizer,consultedAt:new Date().toISOString()};
}

export function cadastroSupported(uf){const state=String(uf||'').toUpperCase();return !!endpoints[svrs.has(state)?'SVRS':state]}
