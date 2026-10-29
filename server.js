const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const checkout=require('./api/checkout');
const {credentials}=require('./lib/payment');
const root=path.join(__dirname,'dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end()}
  if(pathname==='/api/checkout')return checkout(req,res);
  if(pathname==='/api/health'){const {pub,secret}=credentials();res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,runtime:'node',amplopayConfigured:!!(pub&&secret)}))}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  try{const stat=await fs.promises.stat(file);if(!stat.isFile())throw new Error();res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});if(req.method==='HEAD')return res.end();fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res)}catch{res.writeHead(404);res.end('Não encontrado')}
});
if(require.main===module)server.listen(Number(process.env.PORT||8765),'127.0.0.1',()=>console.log('Servidor Node em http://127.0.0.1:'+(process.env.PORT||8765)));
module.exports=server;
