(function(){
  if(window.atelieMeta)return;
  (function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=true;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)})(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init','1817116509407691');fbq('track','PageView');
  window.atelieMeta={
    purchase(payment){if(!payment?.transactionId)return;const eventID='purchase_'+payment.transactionId;let sent=false;try{sent=sessionStorage.getItem(eventID)==='1'}catch{}if(sent)return;fbq('track','Purchase',{value:payment.total,currency:'BRL',content_ids:['300-moldes-mesa-posta'],content_type:'product',payment_stage:payment.pix?'pix_generated':'card_approved'},{eventID});try{sessionStorage.setItem(eventID,'1')}catch{}},
    viewOffer(){if(this.offerViewed)return;this.offerViewed=true;fbq('track','ViewContent',{content_ids:['300-moldes-mesa-posta'],content_type:'product',value:10,currency:'BRL'})}
  };
  if(location.pathname.endsWith('/checkout.html'))fbq('track','InitiateCheckout',{value:10,currency:'BRL',content_ids:['300-moldes-mesa-posta'],content_type:'product'});
})();
