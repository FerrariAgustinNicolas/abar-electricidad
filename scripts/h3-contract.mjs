// H3 is additive; this list never authorizes H4 orders or H5 payments.
export const H3_OPERATIONS = [
 ['/api/v1/public/settings','get','PublicSettings'],
 ['/api/v1/public/payment-methods','get','PublicPaymentMethods'],
 ['/api/v1/public/checkout/quotes','post','QuoteResponse'],
];
export function validateH3Contract(document) {
 const errors=[];const check=(valid,message)=>{if(!valid)errors.push(message);};
 check(document.info?.version===(document.info?.['x-abar-h6-freeze']==='notifications-settings-v1'?'0.9.0':document.info?.['x-abar-h5-freeze']==='manual-confirmation-v1'?'0.8.0':document.info?.['x-abar-h4-freeze']==='orders-demo-v1'?'0.7.0':'0.6.0'),'H3 version must be 0.6.0');
 for(const [route,method,name] of H3_OPERATIONS){
  const op=document.paths?.[route]?.[method];
  check(!!op,`Missing H3 ${method} ${route}`);
  check(JSON.stringify(op?.security)==='[]',`${route}: must remain public`);
  check(op?.responses?.[method==='post'?'201':'200']?.content?.['application/json']?.schema?.$ref===`#/components/schemas/${name}`,`${route}: success DTO differs`);
  for(const status of method==='post'?['400','409','429','503']:['400','429','503'])check(op?.responses?.[status]?.content?.['application/json']?.schema?.$ref==='#/components/schemas/ApiError',`${route}: missing safe ${status}`);
 }
 const quote=document.paths?.['/api/v1/public/checkout/quotes']?.post;
 check(quote?.requestBody?.required===true&&quote.requestBody.content?.['application/json']?.schema?.$ref==='#/components/schemas/QuoteRequest','QuoteRequest body differs');
 check(JSON.stringify(quote?.['x-abar-errors']?.['409'])===JSON.stringify(['INSUFFICIENT_STOCK','PRODUCT_UNAVAILABLE','METHOD_UNAVAILABLE','DELIVERY_UNAVAILABLE']),'H3 conflict codes differ');
 for(const name of ['QuoteRequest','QuoteItemRequest','QuoteResponse','QuoteItem','PublicSettings','PublicPaymentMethods','DemoPaymentMethod']) check(document.components?.schemas?.[name]?.additionalProperties===false,`${name} must remain closed`);
 const request=document.components?.schemas?.QuoteRequest;
 check(request?.properties?.items?.maxItems===100,'Quote input must be bounded to 100');
 check(document.components?.schemas?.QuoteItemRequest?.properties?.quantity?.maximum===1000000,'Quote quantity bound differs');
 return errors;
}
