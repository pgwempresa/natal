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
