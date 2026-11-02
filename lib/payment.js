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
  return {identifier,amount,client:{name,email,phone,document},products,metadata:{provider:'Ateliê da Vitória',orderId:identifier,selectedBumps:ids.join(',')}};
}
async function createPix(data,{env=process.env,fetchImpl=fetch,clientIp}={}){
  const isCard=data?.paymentMethod==='CARD';
  const order=buildOrder(isCard?{...data,paymentMethod:'PIX'}:data),{pub,secret}=credentials(env);
  if(isCard){
    const c=data.card||{},number=String(c.number||'').replace(/[ -]/g,''),owner=String(c.owner||'').trim(),expiresAt=String(c.expiresAt||''),cvv=String(c.cvv||'');
    if(!/^\d{13,19}$/.test(number)||!owner||!/^\d{4}-(0[1-9]|1[0-2])$/.test(expiresAt)||expiresAt<new Date().toISOString().slice(0,7)||!/^\d{3,4}$/.test(cvv))throw new PaymentError('Confira número, titular, validade e CVV do cartão.');
    const a=data.address||{};order.client.address={country:'BR'};
    for(const k of ['zipCode','state','city','street','neighborhood','number']){const value=String(a[k]||'').trim();if(!value)throw new PaymentError('Preencha o endereço completo de cobrança.');order.client.address[k]=value;}
    order.client.address.zipCode=order.client.address.zipCode.replace(/\D/g,'');order.client.address.state=order.client.address.state.toUpperCase();
    if(!/^\d{8}$/.test(order.client.address.zipCode)||! /^[A-Z]{2}$/.test(order.client.address.state))throw new PaymentError('Confira CEP e estado.');
    if(require('node:net').isIP(clientIp||'')!==4)throw new PaymentError('Não foi possível identificar o IP de pagamento.',400);
    order.clientIp=clientIp;order.card={number,owner,expiresAt,cvv};order.installments=1;
  }
  if(!pub||!secret)throw new PaymentError('Configure as credenciais AmploPay no servidor.',503);
  const base=(env.AMPLO_API_BASE||env.AMPLOPAY_API_BASE||'https://app.amplopay.com/api/v1').replace(/\/$/,'');
  let response;
  try{response=await fetchImpl(base+(isCard?'/gateway/card/receive':'/gateway/pix/receive'),{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'MesaAtelier/1.0','x-public-key':pub,'x-secret-key':secret},body:JSON.stringify(order),signal:AbortSignal.timeout(20000)})}
  catch{throw new PaymentError('Não foi possível confirmar a resposta da operadora. Confira o painel antes de gerar outra cobrança.',502)}
  let result;try{result=await response.json()}catch{throw new PaymentError(`A operadora retornou uma resposta inválida (HTTP ${response.status}). Confira o painel antes de repetir.`,502)}
  if(!response.ok){console.error('[AmploPay]',response.status,typeof result?.errorCode==='string'?result.errorCode.replace(/[^A-Z0-9_]/g,'').slice(0,80):'GATEWAY_ERROR');throw new PaymentError(`Pagamento não criado pela operadora (HTTP ${response.status}). Confira as credenciais e permissões da conta.`,502)}
  if(isCard){if(!result?.transactionId||['FAILED','REJECTED','CANCELED'].includes(result.transactionStatus||result.status))throw new PaymentError('Cartão não aprovado. Confira os dados ou use Pix.',502);return {transactionId:result.transactionId,total:order.amount,cardStatus:result.transactionStatus==='COMPLETED'?'approved':'pending'};}
  if(!result?.transactionId||typeof result.pix?.code!=='string'||!result.pix.code||['FAILED','REJECTED','CANCELED'].includes(result.status))throw new PaymentError('A operadora não retornou um Pix válido. Confira o painel antes de repetir.',502);
  return {transactionId:result.transactionId,total:order.amount,pix:{code:result.pix.code,image:typeof result.pix.image==='string'&&result.pix.image.startsWith('https://')?result.pix.image:undefined,expiresAt:result.pix.expiresAt}};
}
module.exports={PaymentError,credentials,buildOrder,createPix};
