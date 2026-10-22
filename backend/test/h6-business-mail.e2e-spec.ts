import { SettingsService } from '../src/settings/settings.service';
import { SettingsController } from '../src/settings/settings.controller';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AdminUsersService } from '../src/auth/admin-users.service';
import { createCsrfNonceCipher } from '../src/auth/csrf-nonce.cipher';
import { validateAuthConfig } from '../src/auth/auth.config';
import { CheckoutController } from '../src/checkout/checkout.controller';
import { CheckoutService } from '../src/checkout/checkout.service';
import { PublicCheckoutRateLimiter } from '../src/checkout/public-checkout-rate-limiter';
import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
import { AdminOrdersController } from '../src/orders/admin-orders.controller';
import { AdminOrdersService } from '../src/orders/admin-orders.service';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationDispatcher, LocalMailpitSmtpTransport } from '../src/notifications/notification-dispatcher';
import { createOrdersJsonRouter } from '../src/orders/orders-json.middleware';
import { createH6JsonRouter } from '../src/common/h6-json.middleware';

const origin = 'http://127.0.0.1:4200';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const key = () => randomBytes(18).toString('base64url');

describe('H6 committed business events, real H1 HTTP guards and local Mailpit receipts', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let dispatcher: NotificationDispatcher;
  let presentationId: string;
  let actor: {token:string; csrf:string; id:string; userId:string};
  const suffix = randomUUID();
  const buyerEmail = `buyer-${suffix}@example.test`;
  const adminEmail = `admin-${suffix}@example.test`;
  const cipher = createCsrfNonceCipher({AUTH_CSRF_ENCRYPTION_KEY:randomBytes(32).toString('base64url')});
  const cfg = {get: (name:string, fallback?:unknown) => ({
    H4_REPLAY_KEY_BASE64:Buffer.alloc(32,29).toString('base64'), H4_DEMO_SIMULATION_ENABLED:true,
    H4_ACCESS_TTL_SECONDS:86400, H4_ADMIN_NOTIFICATION_EMAIL:adminEmail,
    H6_SMTP_HOST:'127.0.0.1', H6_SMTP_PORT:Number(process.env.H6_SMTP_PORT),
  } as Record<string,unknown>)[name] ?? fallback};
  async function session() {
    const user = await prisma.adminUser.create({data:{name:'DEMO H6 fixture admin',email:`${randomUUID()}@example.test`,passwordHash:'unused',mustChangePassword:false}});
    const token = randomBytes(32).toString('base64url'), nonce = randomBytes(32), id = digest(token);
    const enc = cipher.encrypt('session',id,1,nonce), now = new Date();
    await prisma.authSession.create({data:{id,adminUserId:user.id,nonceCiphertext:Uint8Array.from(enc.ciphertext),nonceIv:Uint8Array.from(enc.iv),nonceTag:Uint8Array.from(enc.tag),lastActivityAt:now,absoluteExpiresAt:new Date(Date.now()+3600000),idleExpiresAt:new Date(Date.now()+3600000)}});
    return {token,csrf:nonce.toString('base64url'),id,userId:user.id};
  }
  beforeAll(async () => {
    const url = process.env.H6_VERIFY_DATABASE_URL;
    if (!url || !process.env.H6_OWNER || !process.env.H6_MAILPIT_URL) throw Error('Explicit owned H6 fixture required');
    expect(new URL(url).hostname).toBe('127.0.0.1'); expect(new URL(url).pathname).toBe('/h6_verify');
    prisma = new PrismaClient({adapter:new PrismaPg({connectionString:url})});
    const admins = new AdminUsersService(prisma as never,cipher,validateAuthConfig({NODE_ENV:'test',AUTH_ALLOWED_ORIGINS:origin}),{hash:async()=> 'unused'},{hasDigest:()=>false});
    const checkout = new CheckoutService(prisma as never), orders = new OrdersService(prisma as never,checkout,cfg as never);
    const adminOrders = new AdminOrdersService(prisma as never,admins,orders,cfg as never);
    const notifications = new NotificationsService(prisma as never,admins);
    const settings = new SettingsService(prisma as never,admins,cfg as never);
    dispatcher = new NotificationDispatcher(prisma as never,cfg as never,new LocalMailpitSmtpTransport(cfg as never));
    const module = await Test.createTestingModule({controllers:[CheckoutController,OrdersController,AdminOrdersController,NotificationsController,SettingsController],providers:[
      {provide:CheckoutService,useValue:checkout},{provide:OrdersService,useValue:orders},{provide:AdminOrdersService,useValue:adminOrders},
      {provide:SettingsService,useValue:settings},{provide:AdminUsersService,useValue:admins},{provide:NotificationsService,useValue:notifications},{provide:PrismaService,useValue:prisma},{provide:ConfigService,useValue:cfg},PublicCheckoutRateLimiter,
    ]}).compile();
    app = module.createNestApplication(); app.use(createOrdersJsonRouter()); app.use(createH6JsonRouter()); await app.init();
    actor = await session();
    const category = await prisma.category.create({data:{name:'H6 DEMO',slug:`h6-${suffix}`}});
    const product = await prisma.product.create({data:{name:'DEMO cable',slug:`h6-${suffix}`,categoryId:category.id,presentations:{create:{unit:'UNIT',isDefault:true,amountMinor:1000n,balance:{create:{availableQuantity:10}}}}},include:{presentations:true}});
    presentationId = product.presentations[0].id;
  },30000);
  afterAll(async () => {await app?.close(); await prisma?.$disconnect();});
  const headers = (who = actor) => ({Cookie:`abar_admin_session=${who.token}`,Origin:origin,'X-CSRF-Token':who.csrf});
  async function businessHash() {
    const data = await prisma.$queryRaw<Array<{value:string}>>`SELECT jsonb_build_object(
      'orders',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "Order" t),
      'items',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "OrderItem" t),
      'payments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "Payment" t),
      'attempts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "PaymentAttempt" t),
      'stock',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "presentationId") FROM "StockBalance" t),
      'operations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "StockOperation" t))::text value`;
    return digest(data[0].value);
  }
  async function dispatch(expected: number) {
    const before = await businessHash(); const result = await dispatcher.run(20);
    expect(result.sent).toBe(expected); expect(result.claimed).toBe(expected);
    expect(await businessHash()).toBe(before);
    console.log('H6 SMTP business invariant',before,'sent',expected);
  }
  async function createOrder() {
    const quote = await request(app.getHttpServer()).post('/api/v1/public/checkout/quotes').send({items:[{presentationId,quantity:1}],deliveryMode:'PICKUP',paymentMethodCode:'DEMO_TRANSFER'}).expect(201);
    const body = {quoteId:quote.body.quoteId,customer:{firstName:'DEMO',lastName:'Buyer',email:buyerEmail,phone:'+541155550000'},customerNote:'PRIVATE_DO_NOT_EMAIL',acceptedTermsVersion:'demo-2026-10-20-v1'};
    const replayKey = key();
    const result = await request(app.getHttpServer()).post('/api/v1/public/orders').set('Idempotency-Key',replayKey).send(body).expect(201);
    const replay = await request(app.getHttpServer()).post('/api/v1/public/orders').set('Idempotency-Key',replayKey).send(body).expect(201);
    expect(replay.body).toEqual(result.body);
    expect(await prisma.notificationJob.count({where:{orderId:result.body.orderId}})).toBe(2);
    return result.body as {orderId:string;orderNumber:string;currentAttemptId:string;accessToken:string;total:{amountMinor:string;currency:string}};
  }
  it('enforces real H1 missing/expired/revoked/password-change sessions, Origin and CSRF on notification HTTP',async()=>{
    const route='/api/v1/admin/notifications', retry=`${route}/${randomUUID()}/retry`;
    await request(app.getHttpServer()).get(route).expect(401);
    await request(app.getHttpServer()).post(retry).set('Origin',origin).send({expectedVersion:1}).expect(401);
    for(const state of ['expired','revoked','password']){
      const who=await session();
      if(state==='expired') await prisma.authSession.update({where:{id:who.id},data:{absoluteExpiresAt:new Date(0)}});
      if(state==='revoked') await prisma.authSession.update({where:{id:who.id},data:{revokedAt:new Date()}});
      if(state==='password') await prisma.adminUser.update({where:{id:who.userId},data:{mustChangePassword:true}});
      for(const result of [await request(app.getHttpServer()).get(route).set(headers(who)),await request(app.getHttpServer()).post(retry).set(headers(who)).send({expectedVersion:1})]){
        expect(result.status).toBe(state==='password'?403:401);expect(result.headers['cache-control']).toBe('no-store');expect(JSON.stringify(result.body)).not.toContain('DEMO H6 fixture admin');
      }
    }
    await request(app.getHttpServer()).post(retry).set({...headers(),Origin:'http://untrusted.invalid'}).send({expectedVersion:1}).expect(403);
    await request(app.getHttpServer()).post(retry).set({...headers(),'X-CSRF-Token':'invalid'}).send({expectedVersion:1}).expect(403);
    const list=await request(app.getHttpServer()).get(route).set(headers()).expect(200);expect(list.headers['cache-control']).toBe('no-store');
  });
  it('delivers committed create/confirm/READY/cancel emails without replay or DELIVERED side effects',async()=>{
    const first=await createOrder(); await dispatch(2);
    const confirm={expectedVersion:1,attemptId:first.currentAttemptId,confirmedAmount:first.total}; const replayKey=key();
    const paid=await request(app.getHttpServer()).post(`/api/v1/admin/orders/${first.orderId}/payment-confirmation`).set(headers()).set('Idempotency-Key',replayKey).send(confirm).expect(200);
    expect((await request(app.getHttpServer()).post(`/api/v1/admin/orders/${first.orderId}/payment-confirmation`).set(headers()).set('Idempotency-Key',replayKey).send(confirm).expect(200)).body).toEqual(paid.body);
    await dispatch(2);
    await request(app.getHttpServer()).patch(`/api/v1/admin/orders/${first.orderId}/status`).set(headers()).set('Idempotency-Key',key()).send({expectedVersion:2,status:'READY'}).expect(200);await dispatch(1);
    const before=await businessHash();await request(app.getHttpServer()).get(`/api/v1/public/orders/${first.orderId}`).set('X-Order-Access-Token',first.accessToken).expect(200);expect(await businessHash()).toBe(before);
    await request(app.getHttpServer()).patch(`/api/v1/admin/orders/${first.orderId}/status`).set(headers()).set('Idempotency-Key',key()).send({expectedVersion:3,status:'DELIVERED'}).expect(200);await dispatch(0);
    const second=await createOrder();await dispatch(2);
    await request(app.getHttpServer()).post(`/api/v1/admin/orders/${second.orderId}/cancel`).set(headers()).set('Idempotency-Key',key()).send({expectedVersion:1,reason:'DEMO cancellation'}).expect(200);await dispatch(2);
    const messages=await (await fetch(`${process.env.H6_MAILPIT_URL}/api/v1/messages?limit=100`)).json();
    const own=messages.messages.filter((message:{To:Array<{Address:string}>})=>message.To.some(to=>[buyerEmail,adminEmail].includes(to.Address)));
    expect(own).toHaveLength(9); // Seven event categories; the separately cancelled order also has two creation messages.
    for(const message of own){
      expect(message.Subject).toContain('DEMO');
      const detail=await(await fetch(`${process.env.H6_MAILPIT_URL}/api/v1/message/${message.ID}`)).json();
      expect(detail.Text).not.toContain('PRIVATE_DO_NOT_EMAIL');expect(detail.Text).not.toContain(first.accessToken);expect(detail.Text).not.toContain('+541155550000');
    }
    const jobs=await prisma.notificationJob.findMany({where:{orderId:{in:[first.orderId,second.orderId]}}});expect(jobs).toHaveLength(9);expect(jobs.every(job=>job.state==='SENT')).toBe(true);
    expect((await prisma.stockBalance.findUniqueOrThrow({where:{presentationId}})).availableQuantity).toBe(9);
    console.log('H6 sanitized Mailpit receipts',JSON.stringify(own.map((message:{Subject:string;To:Array<{Address:string}>})=>({subject:message.Subject,to:message.To.map(to=>to.Address)}))));
  },30000);
  it('bounds real SMTP connection failures to five attempts and permits one safe admin retry',async()=>{
    const order=await createOrder();
    const badConfig={get:(name:string,fallback?:unknown)=>name==='H6_SMTP_PORT'?1:cfg.get(name,fallback)};
    const failing=new NotificationDispatcher(prisma as never,badConfig as never,new LocalMailpitSmtpTransport(badConfig as never));
    const before=await businessHash();
    for(let attempt=1;attempt<=5;attempt++){
      await prisma.notificationJob.updateMany({where:{orderId:order.orderId,state:{in:['PENDING','RETRY_WAIT']}},data:{nextAttemptAt:new Date(0)}});
      const result=await failing.run(20);expect(result.claimed).toBe(2);
      const jobs=await prisma.notificationJob.findMany({where:{orderId:order.orderId}});
      expect(jobs).toHaveLength(2);expect(jobs.every(job=>job.attemptCount===attempt&&job.lastError==='SMTP_UNAVAILABLE')).toBe(true);
      expect(jobs.every(job=>job.state===(attempt===5?'FAILED':'RETRY_WAIT'))).toBe(true);
      expect(await businessHash()).toBe(before);
    }
    expect((await failing.run(20)).claimed).toBe(0);
    const job=await prisma.notificationJob.findFirstOrThrow({where:{orderId:order.orderId}});
    const retryPath=`/api/v1/admin/notifications/${job.id}/retry`;
    await request(app.getHttpServer()).post(retryPath).set(headers()).send({expectedVersion:job.version}).expect(202);
    await request(app.getHttpServer()).post(retryPath).set(headers()).send({expectedVersion:job.version}).expect(409);
    expect(await businessHash()).toBe(before);
    expect((await dispatcher.run(20)).sent).toBe(1);
    const saved=await prisma.notificationJob.findUniqueOrThrow({where:{id:job.id}});
    expect(saved.state).toBe('SENT');expect(saved.attemptCount).toBe(1);expect(saved.totalAttemptCount).toBe(6);
    await request(app.getHttpServer()).post(retryPath).set(headers()).send({expectedVersion:saved.version}).expect(409);
    expect(await businessHash()).toBe(before);
  },30000);
  it('demonstrates possible duplicate SMTP delivery after accepted mail and lost database acknowledgement',async()=>{
    const order=await createOrder(); const before=await businessHash();
    const lostAck={
      $transaction:prisma.$transaction.bind(prisma),
      notificationJob:{updateMany:async()=>{throw Error('DEMO injected acknowledgement loss');}},
    };
    const crash=new NotificationDispatcher(lostAck as never,cfg as never,new LocalMailpitSmtpTransport(cfg as never));
    const first=await crash.run(1);expect(first.claimed).toBe(1);expect(first.sent).toBe(0);
    const abandoned=await prisma.notificationJob.findFirstOrThrow({where:{orderId:order.orderId,state:'PROCESSING'}});
    expect(abandoned.attemptCount).toBe(1);
    await prisma.notificationJob.update({where:{id:abandoned.id},data:{leaseUntil:new Date(0)}});
    expect((await dispatcher.run(1)).sent).toBe(1);
    const recovered=await prisma.notificationJob.findUniqueOrThrow({where:{id:abandoned.id}});
    expect(recovered.state).toBe('SENT');expect(recovered.totalAttemptCount).toBe(2);
    expect((await dispatcher.run(20)).sent).toBe(1);
    expect(await businessHash()).toBe(before);
    const listing=await(await fetch(`${process.env.H6_MAILPIT_URL}/api/v1/messages?limit=100`)).json();let receipts=0;
    for(const message of listing.messages){
      if(!message.To.some((to:{Address:string})=>[buyerEmail,adminEmail].includes(to.Address)))continue;
      const detail=await(await fetch(`${process.env.H6_MAILPIT_URL}/api/v1/message/${message.ID}`)).json();
      if(detail.Text.includes(order.orderNumber))receipts++;
    }
    expect(receipts).toBe(3);
    expect(await prisma.notificationJob.count({where:{orderId:order.orderId}})).toBe(2);
    console.log('H6 lost-ACK receipt proof: two business jobs, three captured messages, unchanged business hash',before);
  },30000);

  it('applies new policy to fresh quotes/retries while preserving historical confirmation and snapshots', async () => {
    const original = await prisma.checkoutPolicy.findUniqueOrThrow({where:{id:'default'}});
    const quoteBody = {items:[{presentationId,quantity:1}],deliveryMode:'COORDINATED',paymentMethodCode:'DEMO_TRANSFER'};
    const oldQuote = await request(app.getHttpServer()).post('/api/v1/public/checkout/quotes').send(quoteBody).expect(201);
    const historical = await createOrder();
    const frozen = await prisma.order.findUniqueOrThrow({where:{id:historical.orderId},include:{items:true}});
    try {
      const current = await request(app.getHttpServer()).get('/api/v1/admin/settings').set(headers()).expect(200);
      await request(app.getHttpServer()).patch('/api/v1/admin/settings').set(headers()).send({
        expectedVersion:current.body.version,feeMinor:'750',enabledDeliveryModes:['PICKUP','COORDINATED'],contact:current.body.contact,
      }).expect(200);
      const fresh = await request(app.getHttpServer()).post('/api/v1/public/checkout/quotes').send(quoteBody).expect(201);
      expect(fresh.body.deliveryFee.amountMinor).toBe('750');
      expect(fresh.body.policyVersion).toBe(current.body.version+1);
      expect((await prisma.checkoutQuote.findUniqueOrThrow({where:{id:oldQuote.body.quoteId}})).response).toEqual(oldQuote.body);
      const stale = await request(app.getHttpServer()).post('/api/v1/public/orders').set('Idempotency-Key',key()).send({
        quoteId:oldQuote.body.quoteId,customer:{firstName:'DEMO',lastName:'Buyer',email:buyerEmail,phone:'+541155550000'},
        deliveryDetails:{addressLine:'DEMO address',locality:'DEMO locality'},acceptedTermsVersion:'demo-2026-10-20-v1',
      }).expect(409);
      expect(stale.body.code).toBe('QUOTE_CHANGED');
      const pickup = await request(app.getHttpServer()).post('/api/v1/public/checkout/quotes').send({...quoteBody,deliveryMode:'PICKUP'}).expect(201);
      expect(pickup.body.deliveryFee.amountMinor).toBe('0');
      await request(app.getHttpServer()).patch('/api/v1/admin/payment-methods/DEMO_TRANSFER').set(headers()).send({
        expectedVersion:current.body.version+1,enabled:false,instructions:'DEMO disabled for new purchases.',deliveryModes:['PICKUP','COORDINATED'],
      }).expect(200);
      const beforeRetry = await businessHash();
      const retry = await request(app.getHttpServer()).post(`/api/v1/public/orders/${historical.orderId}/payment-attempts`)
        .set('X-Order-Access-Token',historical.accessToken).set('Idempotency-Key',key()).send({methodCode:'DEMO_TRANSFER'}).expect(409);
      expect(retry.body.code).toBe('METHOD_UNAVAILABLE');
      expect(await businessHash()).toBe(beforeRetry);
      const afterPolicy = await prisma.order.findUniqueOrThrow({where:{id:historical.orderId},include:{items:true}});
      expect(afterPolicy).toEqual(frozen);
      await request(app.getHttpServer()).post(`/api/v1/admin/orders/${historical.orderId}/payment-confirmation`).set(headers()).set('Idempotency-Key',key())
        .send({expectedVersion:1,attemptId:historical.currentAttemptId,confirmedAmount:historical.total}).expect(200);
      const paid = await prisma.order.findUniqueOrThrow({where:{id:historical.orderId},include:{items:true,payment:true}});
      expect(paid.totalMinor).toBe(frozen.totalMinor);expect(paid.items).toEqual(frozen.items);expect(paid.payment?.status).toBe('PAID');
      await dispatch(4);
    } finally {
      await prisma.checkoutPolicy.update({where:{id:'default'},data:{feeMinor:original.feeMinor,version:original.version,
        enabledDeliveryModes:original.enabledDeliveryModes as never,paymentMethods:original.paymentMethods as never,contact:original.contact as never}});
    }
  },30000);

});
