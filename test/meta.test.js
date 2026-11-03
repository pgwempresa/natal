const {test}=require('node:test');
const assert=require('node:assert/strict');
const {purchaseEvent,sendPurchase}=require('../lib/meta');
const payment={transactionId:'pix-test',total:34.7,pix:{code:'private-code'}};
const customer={email:'TESTE@EXAMPLE.COM',phone:'63999999999',document:'12345678909',card:{number:'private-card'}};
const req={headers:{origin:'https://example.com',cookie:'_fbp=fb.1.1730000000000.123; _fbc=fb.1.1730000000000.click-id','user-agent':'Test'},socket:{remoteAddress:'192.0.2.1'}};
test('Pix gerado dispara Purchase com valor real, identificador deduplicável e dados limitados',async()=>{
  const event=purchaseEvent(payment,customer,req);assert.equal(event.event_name,'Purchase');assert.equal(event.event_id,'purchase_pix-test');assert.equal(event.custom_data.value,34.7);assert.equal(event.custom_data.payment_stage,'pix_generated');assert.equal(event.user_data.em[0].length,64);assert.equal(event.user_data.fbp,'fb.1.1730000000000.123');
  const encoded=JSON.stringify(event);for(const value of ['TESTE@EXAMPLE.COM','63999999999','12345678909','private-code','private-card'])assert.ok(!encoded.includes(value));
  const sent=await sendPurchase(payment,customer,req,{env:{META_ACCESS_TOKEN:'server-token'},fetchImpl:async(url,options)=>{assert.ok(url.endsWith('/1817116509407691/events'));assert.equal(options.headers.Authorization,'Bearer server-token');assert.equal(JSON.parse(options.body).data[0].event_id,event.event_id);return new Response(JSON.stringify({events_received:1}))}});assert.equal(sent,true);
});
test('token ausente não chama Meta e falha de analytics não impede pagamento',async()=>{
  assert.equal(await sendPurchase(payment,customer,req,{env:{},fetchImpl:()=>{throw Error('não deveria chamar')}}),false);
  assert.equal(await sendPurchase(payment,customer,req,{env:{META_ACCESS_TOKEN:'test'},fetchImpl:async()=>{throw Error('offline')}}),false);
});
test('navegador deduplica Purchase pelo mesmo ID do servidor e não dispara compra ao abrir página',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),storage=new Map();let inserted;
  const context={document:{createElement(){return{}},getElementsByTagName(){return[{parentNode:{insertBefore(script){inserted=script}}}]}},location:{pathname:'/checkout.html'},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}};context.window=context;
  const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/meta-pixel.js'),'utf8');vm.runInNewContext(source,context);
  assert.equal(inserted.src,'https://connect.facebook.net/en_US/fbevents.js');
  const purchases=()=>context.fbq.queue.filter(args=>args[1]==='Purchase');assert.equal(purchases().length,0);
  context.atelieMeta.purchase(payment);context.atelieMeta.purchase(payment);vm.runInNewContext(source,context);
  assert.equal(purchases().length,1);assert.equal(purchases()[0][3].eventID,purchaseEvent(payment,customer,req).event_id);assert.equal(purchases()[0][2].value,34.7);
  context.atelieMeta.purchase({...payment,transactionId:'outro-pix'});assert.equal(purchases().length,2);
});
test('recusa da Meta é detectada sem expor token ou dados pessoais nos logs',async()=>{
  const entries=[],original=console.error;console.error=(...args)=>entries.push(args.join(' '));
  try{const result=await sendPurchase(payment,customer,req,{env:{META_ACCESS_TOKEN:'private-token'},fetchImpl:async()=>new Response(JSON.stringify({error:{code:190,error_subcode:463,message:'private-token'}}),{status:400})});assert.equal(result,false);assert.match(entries[0],/190/);assert.match(entries[0],/463/);assert.ok(!entries.join('').includes('private-token'));}finally{console.error=original;}
});
