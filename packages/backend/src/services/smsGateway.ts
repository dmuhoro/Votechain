/**
 * Dialer (SMS/USSD) outbound gateway seam (ADR-009 §5).
 *
 * Physical SMS delivery requires a carrier subscription + credits (Twilio,
 * Africa's Talking). We do NOT claim delivery we cannot provide: the default
 * gateway is the in-memory `SimulatedSmsGateway`, which captures replies and
 * drives unit tests + the live drill. Real adapters are explicit stubs that
 * throw until configured — a deploy with SMS_GATEWAY=twilio but no credentials
 * fails loudly, never silently pretends to send.
 */

export interface OutboundSms {
  to: string;
  body: string;
}

export interface SmsGateway {
  readonly name: string;
  send(msg: OutboundSms): Promise<void>;
}

export function isConfiguredGateway(name: string): boolean {
  const env = process.env.SMS_GATEWAY?.toLowerCase().trim();
  return env === name.toLowerCase();
}

export class SimulatedSmsGateway implements SmsGateway {
  readonly name = "simulated";
  readonly sent: OutboundSms[] = [];

  async send(msg: OutboundSms): Promise<void> {
    this.sent.push(msg);
  }
}

export class TwilioSmsGateway implements SmsGateway {
  readonly name = "twilio";
  constructor() {
    if (!isConfiguredGateway("twilio") || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error(
        "TwilioSmsGateway requires SMS_GATEWAY=twilio + TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN."
      );
    }
  }
  async send(_msg: OutboundSms): Promise<void> {
    throw new Error("Twilio adapter not wired — carrier credits/subscription required (ADR-009 §4).");
  }
}

export class AfricasTalkingGateway implements SmsGateway {
  readonly name = "africastalking";
  constructor() {
    if (!isConfiguredGateway("africastalking") || !process.env.AT_API_KEY || !process.env.AT_USERNAME) {
      throw new Error(
        "AfricasTalkingGateway requires SMS_GATEWAY=africastalking + AT_API_KEY/AT_USERNAME."
      );
    }
  }
  async send(_msg: OutboundSms): Promise<void> {
    throw new Error("Africa's Talking adapter not wired — carrier credits/subscription required.");
  }
}

export function getSmsGateway(): SmsGateway {
  const gateway = process.env.SMS_GATEWAY?.toLowerCase().trim();
  switch (gateway) {
    case "twilio":
      return new TwilioSmsGateway();
    case "africastalking":
      return new AfricasTalkingGateway();
    case "simulated":
    case undefined:
      return new SimulatedSmsGateway();
    default:
      throw new Error(`Unknown SMS_GATEWAY "${gateway}".`);
  }
}