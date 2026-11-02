const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPix}=require('../lib/payment');
const input={paymentMethod:'CARD',customer:{name:'Teste Comprador',email:'teste@example.com',phone:'63999999999',document:'12345678909'},card:{owner:'TESTE COMPRADOR',number:'4111111111111111',expiresAt:'2030-12',cvv:'123'},address:{zipCode:'01001-000',state:'sp',city:'São Paulo',street:'Praça da Sé',neighborhood:'Sé',number:'1'}};
const options={clientIp:'192.0.2.1',env:{AMPLO_PUBLIC_KEY:'test',AMPLO_SECRET_KEY:'test'}};
test('cartão aprovado e recusado são tratados distintamente',async()=>{
  for(const status of ['COMPLETED','REJECTED','FAILED','CANCELED','DECLINED']){
    const pending=createPix(input,{...options,fetchImpl:async()=>new Response(JSON.stringify({transactionId:'test-card',transactionStatus:status}))});
    if(status==='COMPLETED'){const result=await pending;assert.equal(result.cardStatus,'approved');assert.equal(result.total,10);assert.equal(result.card,undefined)}else await assert.rejects(pending,/não aprovado/);
  }
});
test('dados inválidos de cartão, endereço e IP não chegam à operadora',async()=>{
  for(const change of [{card:{...input.card,number:'4111111111111112'}},{card:{...input.card,expiresAt:'2020-01'}},{card:{...input.card,cvv:'1'}},{address:{...input.address,street:''}},{address:{...input.address,zipCode:'123'}}]){
    let calls=0;await assert.rejects(createPix({...input,...change},{...options,fetchImpl:async()=>{calls++;throw Error()}}));assert.equal(calls,0);
  }
  await assert.rejects(createPix(input,{...options,clientIp:'invalid'}),/IP/);
});
test('falha de rede do cartão não repete cobrança nem expõe dados',async()=>{
  let calls=0;await assert.rejects(createPix(input,{...options,fetchImpl:async()=>{calls++;throw Error(input.card.number)}}),error=>!error.message.includes(input.card.number)&&/Confira o painel/.test(error.message));assert.equal(calls,1);
});
function checkoutUI(fetchImpl){
  const vm=require('node:vm'),fs=require('node:fs');const nodes=new Map();
  function node(key){if(!nodes.has(key))nodes.set(key,{value:'',textContent:'',innerHTML:'Pagar',hidden:false,disabled:false,dataset:{},handlers:{},classList:{toggle(){},contains(){return false}},addEventListener(event,fn){this.handlers[event]=fn},setAttribute(){},removeAttribute(){},focus(){},checkValidity(){return true},scrollIntoView(){}});return nodes.get(key)}
  const methods=['pix','card'].map(method=>{const n=node(method);n.dataset.method=method;return n});
  const document={querySelector:node,querySelectorAll(selector){return selector==='.kw-methods button'?methods:[]}};
  const html=fs.readFileSync(require('node:path').join(__dirname,'../dist/checkout.html'),'utf8');
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{document,fetch:fetchImpl,AbortController,setTimeout,clearTimeout,navigator:{}});
  return {node,methods};
}
test('CEP preenche endereço e permite preenchimento manual quando inexistente',async()=>{
  const ui=checkoutUI(async()=>new Response(JSON.stringify({uf:'SP',localidade:'São Paulo',logradouro:'Praça da Sé',bairro:'Sé'})));
  ui.node('#card-zipCode').value='01001000';await ui.node('#card-zipCode').handlers.input();assert.equal(ui.node('#card-city').value,'São Paulo');assert.equal(ui.node('#card-street').value,'Praça da Sé');assert.equal(ui.node('#card-zipCode').value,'01001-000');
  const failed=checkoutUI(async()=>new Response(JSON.stringify({erro:true})));failed.node('#card-zipCode').value='99999999';await failed.node('#card-zipCode').handlers.input();assert.match(failed.node('#cep-status').textContent,/manualmente/);assert.equal(failed.node('#card-city').disabled,false);
});
test('checkout envia cartão uma vez, mantém método durante envio e limpa dados sensíveis',async()=>{
  let calls=0,resolveResponse,body;const ui=checkoutUI(async(url,options)=>{calls++;body=JSON.parse(options.body);return new Promise(resolve=>resolveResponse=resolve)});
  for(const [key,value] of Object.entries({name:'Teste',email:'teste@example.com',phone:'63999999999',document:'12345678909'}))ui.node('#customer-'+key).value=value;
  for(const [key,value] of Object.entries({...input.card,...input.address,addressNumber:'1'}))ui.node('#card-'+key).value=value;
  ui.methods[1].handlers.click();const submit=()=>ui.node('#checkout-form').handlers.submit({preventDefault(){}});const pending=submit();await submit();ui.methods[0].handlers.click();assert.equal(calls,1);assert.equal(body.paymentMethod,'CARD');assert.equal(body.address.number,'1');resolveResponse(new Response(JSON.stringify({transactionId:'test',cardStatus:'pending'})));await pending;
  assert.equal(ui.node('#pay-card').hidden,true);assert.equal(ui.node('#card-number').value,'');assert.equal(ui.node('#card-cvv').value,'');assert.match(ui.node('#card-status').textContent,/análise/);await submit();assert.equal(calls,1);
});
