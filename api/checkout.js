const {PaymentError,createPix}=require('../lib/payment');
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
module.exports=async function checkout(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{message:'Método não permitido.'})}
  try{
    let body=req.body;
    if(body===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20000)throw new PaymentError('Pedido muito grande.',413);chunks.push(chunk)}body=Buffer.concat(chunks).toString('utf8')}
    if(typeof body==='string'){if(Buffer.byteLength(body)>20000)throw new PaymentError('Pedido muito grande.',413);try{body=JSON.parse(body)}catch{throw new PaymentError('JSON inválido.')}}
    if(Buffer.byteLength(JSON.stringify(body)||'')>20000)throw new PaymentError('Pedido muito grande.',413);
    send(res,200,await createPix(body));
  }catch(error){send(res,error instanceof PaymentError?error.status:500,{message:error instanceof PaymentError?error.message:'Não foi possível iniciar o pagamento.'})}
};
