import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationDispatcher, LocalMailpitSmtpTransport, NOTIFICATION_CLOCK, NOTIFICATION_SMTP_TRANSPORT } from './notification-dispatcher';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDispatcher,
    LocalMailpitSmtpTransport,
    { provide: NOTIFICATION_CLOCK, useValue: () => new Date() },
    { provide: NOTIFICATION_SMTP_TRANSPORT, useExisting: LocalMailpitSmtpTransport },
  ],
  exports: [NotificationDispatcher],
})
export class NotificationsModule {}
