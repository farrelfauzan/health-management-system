import { SendMailRequest, SendMailResult } from './mail.types';

/**
 * Provider-neutral outbound mail contract, mirroring
 * {@link ObjectStorageService}: feature services inject this and never import
 * a transport SDK. Swapping SMTP for a vendor HTTP API is then one provider
 * binding in {@link MailModule}, not a change in every caller.
 */
export abstract class MailService {
  abstract sendMail(request: SendMailRequest): Promise<SendMailResult>;
}
