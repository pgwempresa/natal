'use strict';
const {randomUUID}=require('node:crypto');
class PaymentError extends Error {constructor(message,status=400){super(message);this.status=status}}
const catalog={christmas:['Moldes natalinos',990],guide:['Guia de produção',690],materials:['Lista de materiais',790]};
function credentials(env=process.env){return {pub:(env.AMPLO_PUBLIC_KEY||env.AMPLOPAY_PUBLIC_KEY||'').trim(),secret:(env.AMPLO_SECRET_KEY||env.AMPLOPAY_SECRET_KEY||'').trim()}}
function buildOrder(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw new PaymentError('Dados do pedido inválidos.');
  if(data.paymentMethod&&data.paymentMethod!=='PIX')throw new PaymentError('Selecione Pix para continuar.');
  const c=data.customer||{},name=String(c.name||'').trim(),email=String(c.email||'').trim(),document=String(c.document||'').replace(/\D/g,'');
  let phone=String(c.phone||'').replace(/\D/g,'');
  if(phone.startsWith('55')&&[12,13].includes(phone.length))phone=phone.slice(2);
  if(name.length<2||name.length>160||!/^\S+@\S+\.\S+$/.test(email)||!/^\d{10,11}$/.test(phone))throw new PaymentError('Preencha nome, e-mail e telefone válidos.');
  if(!/^\d{11}$|^\d{14}$/.test(document))throw new PaymentError('Informe CPF ou CNPJ válido.');
  const ids=[...new Set(Array.isArray(data.bumpIds)?data.bumpIds:[])].filter(id=>Object.hasOwn(catalog,id));
  const products=[{id:'300-moldes-mesa-posta',name:'300 Moldes de Mesa Posta',quantity:1,price:10,physical:false},...ids.map(id=>({id,name:catalog[id][0],quantity:1,price:catalog[id][1]/100,physical:false}))];
  const amount=(1000+ids.reduce((sum,id)=>sum+catalog[id][1],0))/100,identifier='mesa_'+randomUUID().replaceAll('-','');
  return {identifier,amount,client:{name,email,phone,document},products,metadata:{provider:'Casa do Artesanato',orderId:identifier,selectedBumps:ids.join(',')}};
}
async function createPix(data,{env=process.env,fetchImpl=fetch}={}){
  const order=buildOrder(data),{pub,secret}=credentials(env);
  if(!pub||!secret)throw new PaymentError('Configure as credenciais AmploPay no servidor.',503);
  const base=(env.AMPLO_API_BASE||env.AMPLOPAY_API_BASE||'https://app.amplopay.com/api/v1').replace(/\/$/,'');
  let response;
  try{response=await fetchImpl(base+'/gateway/pix/receive',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'MesaAtelier/1.0','x-public-key':pub,'x-secret-key':secret},body:JSON.stringify(order),signal:AbortSignal.timeout(20000)})}
  catch{throw new PaymentError('Não foi possível confirmar a resposta da operadora. Confira o painel antes de gerar outra cobrança.',502)}
  let result;try{result=await response.json()}catch{throw new PaymentError(`A operadora retornou uma resposta inválida (HTTP ${response.status}). Confira o painel antes de repetir.`,502)}
  if(!response.ok){console.error('[AmploPay]',response.status,typeof result?.errorCode==='string'?result.errorCode.replace(/[^A-Z0-9_]/g,'').slice(0,80):'GATEWAY_ERROR');throw new PaymentError(`Pagamento não criado pela operadora (HTTP ${response.status}). Confira as credenciais e permissões da conta.`,502)}
  if(!result?.transactionId||typeof result.pix?.code!=='string'||!result.pix.code||['FAILED','REJECTED','CANCELED'].includes(result.status))throw new PaymentError('A operadora não retornou um Pix válido. Confira o painel antes de repetir.',502);
  return {transactionId:result.transactionId,total:order.amount,pix:{code:result.pix.code,image:typeof result.pix.image==='string'&&result.pix.image.startsWith('https://')?result.pix.image:undefined,expiresAt:result.pix.expiresAt}};
}
module.exports={PaymentError,credentials,buildOrder,createPix};
