const {createHash}=require('node:crypto');
const PIXEL_ID='1817116509407691';
const hash=value=>createHash('sha256').update(value).digest('hex');
function purchaseEvent(payment,customer,req){
  const cookies=Object.fromEntries(String(req.headers.cookie||'').split(';').map(part=>{const at=part.indexOf('=');return at<0?[]:[part.slice(0,at).trim(),part.slice(at+1).trim()]}).filter(pair=>pair.length===2));
  const email=String(customer?.email||'').trim().toLowerCase();let phone=String(customer?.phone||'').replace(/\D/g,'');if([10,11].includes(phone.length))phone='55'+phone;
  const user_data={};if(email)user_data.em=[hash(email)];if(phone)user_data.ph=[hash(phone)];
  const ip=String(process.env.VERCEL?req.headers['x-vercel-forwarded-for']||'':req.socket?.remoteAddress||'').split(',')[0].trim().replace(/^::ffff:/,'');
  if(require('node:net').isIP(ip))user_data.client_ip_address=ip;
  if(req.headers['user-agent'])user_data.client_user_agent=String(req.headers['user-agent']).slice(0,1000);
  for(const key of ['fbp','fbc']){const value=cookies['_'+key];if(/^fb\.\d\.\d{10,16}\.[A-Za-z0-9._-]{1,500}$/.test(value||''))user_data[key]=value;}
  let source;try{const origin=new URL(req.headers.origin||'https://'+req.headers.host);if(['http:','https:'].includes(origin.protocol))source=origin.origin+'/checkout.html';}catch{}
  return {event_name:'Purchase',event_time:Math.floor(Date.now()/1000),event_id:'purchase_'+payment.transactionId,action_source:'website',...(source?{event_source_url:source}:{}),user_data,custom_data:{currency:'BRL',value:payment.total,content_ids:['300-moldes-mesa-posta'],content_type:'product',order_id:String(payment.transactionId),payment_stage:payment.pix?'pix_generated':'card_approved'}};
}
async function sendPurchase(payment,customer,req,{env=process.env,fetchImpl=fetch}={}){
  const token=(env.META_ACCESS_TOKEN||'').trim();if(!token){console.warn('[Meta]',JSON.stringify({status:'skipped',reason:'META_ACCESS_TOKEN_MISSING',eventId:'purchase_'+payment.transactionId,pixelId:PIXEL_ID}));return false;}
  const pixel=env.META_PIXEL_ID||PIXEL_ID,version=env.META_GRAPH_VERSION||'v22.0';
  const diagnostic={eventId:'purchase_'+payment.transactionId,pixelId:pixel,testMode:!!env.META_TEST_EVENT_CODE};
  if(!/^\d+$/.test(pixel)||!/^v\d+\.0$/.test(version)){console.error('[Meta]',JSON.stringify({...diagnostic,status:'skipped',reason:'INVALID_META_CONFIG'}));return false;}
  if(pixel!==PIXEL_ID)console.warn('[Meta]',JSON.stringify({...diagnostic,reason:'PIXEL_DIFFERS_FROM_BROWSER',browserPixelId:PIXEL_ID}));
  try{const response=await fetchImpl(`https://graph.facebook.com/${version}/${pixel}/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data:[purchaseEvent(payment,customer,req)],...(env.META_TEST_EVENT_CODE?{test_event_code:env.META_TEST_EVENT_CODE}:{})}),signal:AbortSignal.timeout(3500)});const result=await response.json();if(!response.ok||Number(result.events_received)<1||!result.events_received){console.error('[Meta]',JSON.stringify({...diagnostic,status:'rejected',httpStatus:response.status,errorCode:Number(result.error?.code)||null,errorSubcode:Number(result.error?.error_subcode)||null}));return false;}console.info('[Meta]',JSON.stringify({...diagnostic,status:'accepted',eventsReceived:Number(result.events_received)}));return true;}catch{console.error('[Meta]',JSON.stringify({...diagnostic,status:'unconfirmed',reason:'NETWORK_OR_RESPONSE_ERROR'}));return false;}
}
module.exports={PIXEL_ID,purchaseEvent,sendPurchase};
