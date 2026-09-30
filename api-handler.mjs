import { timingSafeEqual } from 'node:crypto';
import { certificateConfigured, queryProtocol } from './sefaz.mjs';
import { lookupCnpj } from './cnpj.mjs';
import { queryCadastro, cadastroSupported } from './sefaz-cadastro.mjs';

const attempts=new Map();
const API_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function json(response,status,data){response.writeHead(status,API_HEADERS);response.end(JSON.stringify(data))}
function header(request,name){const value=request.headers?.[name];return Array.isArray(value)?value[0]:value||''}
function authorized(request){
  const expected=process.env.ISEV_ACCESS_KEY;
  if(!expected)return true;
  const received=String(header(request,'x-isev-key'));
  const a=Buffer.from(received),b=Buffer.from(expected);
  return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);
}
function clientId(request){return String(header(request,'x-forwarded-for')).split(',')[0].trim()||request.socket?.remoteAddress||'unknown'}
function rateLimited(request){
  const now=Date.now(),id=clientId(request),windowStart=now-60_000;
  const history=(attempts.get(id)||[]).filter(time=>time>windowStart);
  if(history.length>=20){attempts.set(id,history);return true}
  history.push(now);attempts.set(id,history);
  if(attempts.size>1000)for(const [key,times] of attempts)if(!times.some(time=>time>windowStart))attempts.delete(key);
  return false;
}
async function bodyJson(request){
  if(!String(header(request,'content-type')).toLowerCase().startsWith('application/json'))throw Object.assign(new Error('Use Content-Type application/json.'),{status:415,code:'INVALID_CONTENT_TYPE'});
  let size=0,text='';for await(const chunk of request){size+=chunk.length;if(size>20_000)throw Object.assign(new Error('Requisição muito grande.'),{status:413,code:'PAYLOAD_TOO_LARGE'});text+=chunk}
  try{return JSON.parse(text||'{}')}catch{throw Object.assign(new Error('JSON inválido.'),{status:400,code:'INVALID_JSON'})}
}
function publicError(error){
  const status=Number(error.status)||(['INVALID_KEY','INVALID_ENVIRONMENT','INVALID_UF','INVALID_CNPJ','INVALID_PROVIDER'].includes(error.code)?400:502);
  const safe=status<500||['CERT_NOT_CONFIGURED','CADASTRO_UF_UNAVAILABLE','SEFAZ_TIMEOUT','CNPJ_PROVIDERS_UNAVAILABLE'].includes(error.code);
  return {status,data:{error:safe?error.message:'Não foi possível concluir a consulta externa.',code:error.code||'EXTERNAL_SERVICE_ERROR'}};
}
export async function handleApi(request,response){
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname).replace(/\/+$/,'')||'/';
  if(!pathname.startsWith('/api/'))return false;
  if(!authorized(request)){
    json(response,401,{error:'Acesso não autorizado.',code:'UNAUTHORIZED'});return true;
  }
  if(rateLimited(request)){json(response,429,{error:'Muitas consultas em sequência. Aguarde um minuto.',code:'RATE_LIMIT'});return true}
  try{
    if(pathname==='/api/sefaz/config'&&request.method==='GET'){json(response,200,{configured:await certificateConfigured()});return true}
    if(pathname==='/api/sefaz/cadastro-config'&&request.method==='GET'){const uf=new URL(request.url,'http://localhost').searchParams.get('uf');json(response,200,{supported:cadastroSupported(uf),certificateConfigured:await certificateConfigured()});return true}
    if(pathname==='/api/sefaz/consulta-protocolo'&&request.method==='POST'){const input=await bodyJson(request);json(response,200,await queryProtocol(String(input.key||'').replace(/\D/g,''),input.environment));return true}
    if(pathname==='/api/sefaz/consulta-cadastro'&&request.method==='POST'){const input=await bodyJson(request);json(response,200,await queryCadastro(input.cnpj,input.uf,input.environment||'production'));return true}
    if(pathname.startsWith('/api/cnpj/')&&request.method==='GET'){const cnpj=pathname.slice('/api/cnpj/'.length);const mode=new URL(request.url,'http://localhost').searchParams.get('mode')||'complete';json(response,200,await lookupCnpj(cnpj,mode));return true}
    json(response,404,{error:'Endpoint não encontrado.',code:'NOT_FOUND'});return true;
  }catch(error){const result=publicError(error);if(result.status>=500)console.error(`[API] ${error.code||'ERROR'}: ${error.message}`);json(response,result.status,result.data);return true}
}
