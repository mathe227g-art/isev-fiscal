import https from 'node:https';
import tls from 'node:tls';
import { readFile } from 'node:fs/promises';

const SOAP_ACTION = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF';
const ICP_ROOT_URL = new URL('./certs/ICP-Brasilv10.crt', import.meta.url);

const services = {
  AM: { production:'https://nfe.sefaz.am.gov.br/services2/services/NfeConsulta4', homologation:'https://homnfe.sefaz.am.gov.br/services2/services/NfeConsulta4' },
  BA: { production:'https://nfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx', homologation:'https://hnfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx' },
  GO: { production:'https://nfe.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4', homologation:'https://homolog.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4' },
  MG: { production:'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4', homologation:'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4' },
  MS: { production:'https://nfe.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4', homologation:'https://hom.nfe.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4' },
  MT: { production:'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4', homologation:'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4' },
  PE: { production:'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4', homologation:'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4' },
  PR: { production:'https://nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4', homologation:'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4' },
  RS: { production:'https://nfe.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx', homologation:'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx' },
  SP: { production:'https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx', homologation:'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx' },
  SVAN: { production:'https://www.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx', homologation:'https://hom.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx' },
  SVRS: { production:'https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx', homologation:'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx' }
};

const ufByCode = { '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF' };
const svrs = new Set(['AC','AL','AP','CE','DF','ES','PA','PB','PI','RJ','RN','RO','RR','SC','SE','TO']);

let tlsCache;
export async function tlsOptions(){
  if(tlsCache) return tlsCache;
  const pfxPath = process.env.ISEV_PFX_PATH;
  const pfxBase64 = process.env.ISEV_PFX_BASE64;
  const passphrase = process.env.ISEV_PFX_PASSWORD;
  if((!pfxPath && !pfxBase64) || !passphrase) throw Object.assign(new Error('Certificado da SEFAZ não configurado no servidor.'), { code:'CERT_NOT_CONFIGURED' });
  let pfx;
  if(pfxBase64){
    const normalized=pfxBase64.replace(/\s/g,'');
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized))throw Object.assign(new Error('Certificado Base64 inválido.'),{code:'CERT_INVALID'});
    pfx=Buffer.from(normalized,'base64');
    if(!pfx.length||pfx.length>48_000)throw Object.assign(new Error('Certificado fora do tamanho permitido.'),{code:'CERT_INVALID'});
  }else pfx=await readFile(pfxPath);
  const extraCa=[await readFile(ICP_ROOT_URL)];
  tls.createSecureContext({ pfx, passphrase });
  tlsCache = { pfx, passphrase, ca:[...tls.rootCertificates,...extraCa], minVersion:'TLSv1.2', rejectUnauthorized:true };
  return tlsCache;
}

function endpointFor(key, environment){
  const uf = ufByCode[key.slice(0,2)];
  if(!uf) throw Object.assign(new Error('Código da UF não reconhecido na chave.'), { code:'INVALID_UF' });
  const authorizer = uf === 'MA' ? 'SVAN' : svrs.has(uf) ? 'SVRS' : uf;
  const endpoint = services[authorizer]?.[environment];
  if(!endpoint) throw Object.assign(new Error(`Endpoint não configurado para ${uf}.`), { code:'ENDPOINT_NOT_CONFIGURED' });
  return { uf, authorizer, endpoint };
}

function envelope(key, environment){
  const tpAmb = environment === 'production' ? '1' : '2';
  return `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4"><consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${key}</chNFe></consSitNFe></nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

function decodeXml(value=''){return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim()}
function tag(xml,name){const match=xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,'i'));return match?decodeXml(match[1].replace(/<[^>]+>/g,'')):''}
function block(xml,name){const match=xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,'i'));return match?match[1]:''}
function blocks(xml,name){return [...xml.matchAll(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,'gi'))].map(match=>match[1])}

export function parseSefazResponse(xml){
  const fault = block(xml,'Fault');
  if(fault) throw Object.assign(new Error(tag(fault,'Reason') || tag(fault,'faultstring') || 'A SEFAZ retornou uma falha SOAP.'), { code:'SEFAZ_SOAP_FAULT' });
  const result = block(xml,'retConsSitNFe') || block(xml,'nfeResultMsg');
  if(!result) throw Object.assign(new Error('Resposta da SEFAZ em formato inesperado.'), { code:'INVALID_SEFAZ_RESPONSE' });
  const protocol = block(result,'protNFe');
  const events = blocks(result,'procEventoNFe').map(event=>({
    type:tag(event,'tpEvento'), sequence:tag(event,'nSeqEvento'), description:tag(event,'descEvento') || tag(event,'xEvento'),
    status:tag(event,'cStat'), reason:tag(event,'xMotivo'), protocol:tag(event,'nProt'), receivedAt:tag(event,'dhRegEvento') || tag(event,'dhEvento'),
    relatedKey:tag(event,'chNFeRef') || tag(event,'refNFe') || null
  }));
  return {
    status:tag(result,'cStat'), reason:tag(result,'xMotivo'), processedAt:tag(result,'dhRecbto'), key:tag(result,'chNFe'),
    protocol:protocol?{ number:tag(protocol,'nProt'), status:tag(protocol,'cStat'), reason:tag(protocol,'xMotivo'), receivedAt:tag(protocol,'dhRecbto'), digest:tag(protocol,'digVal') }:null,
    events, relatedKeys:[...new Set(events.map(event=>event.relatedKey).filter(key=>/^\d{44}$/.test(key)))]
  };
}

export function requestSoap(url,body,options,soapAction=SOAP_ACTION){
  return new Promise((resolvePromise,reject)=>{
    const target = new URL(url);
    const request = https.request(target, { ...options, method:'POST', timeout:20000, headers:{
      'Content-Type':`application/soap+xml; charset=utf-8; action="${soapAction}"`, 'Content-Length':Buffer.byteLength(body), 'User-Agent':'iSev-Fiscal/1.0'
    } }, response=>{
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>2_000_000){request.destroy(new Error('Resposta da SEFAZ excedeu o limite seguro.'));return}chunks.push(chunk)});
      response.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');if(response.statusCode<200||response.statusCode>=300)return reject(Object.assign(new Error(`SEFAZ respondeu HTTP ${response.statusCode}.`),{code:'SEFAZ_HTTP_ERROR'}));resolvePromise(text)});
    });
    request.on('timeout',()=>request.destroy(Object.assign(new Error('Tempo de resposta da SEFAZ excedido.'),{code:'SEFAZ_TIMEOUT'})));
    request.on('error',reject);request.end(body);
  });
}

export async function queryProtocol(key,environment='production'){
  if(!/^\d{44}$/.test(key)) throw Object.assign(new Error('A chave deve possuir 44 dígitos.'),{code:'INVALID_KEY'});
  if(!['production','homologation'].includes(environment)) throw Object.assign(new Error('Ambiente da SEFAZ inválido.'),{code:'INVALID_ENVIRONMENT'});
  const route=endpointFor(key,environment),options=await tlsOptions();
  const xml=await requestSoap(route.endpoint,envelope(key,environment),options);
  return {...parseSefazResponse(xml),environment,uf:route.uf,authorizer:route.authorizer,consultedAt:new Date().toISOString()};
}

export async function certificateConfigured(){try{await tlsOptions();return true}catch{return false}}
