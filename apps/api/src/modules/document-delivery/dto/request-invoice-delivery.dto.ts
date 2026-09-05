import { requestInvoiceDeliverySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RequestInvoiceDeliveryDto extends createZodDto(requestInvoiceDeliverySchema) {}
