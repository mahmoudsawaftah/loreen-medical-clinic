import "server-only";

/**
 * Messaging abstraction for CRM follow-ups and birthday reminders.
 * Providers: mock (default — records CommunicationLog rows with status SENT and
 * a provider ref, no external sends) or disabled.
 * WhatsApp/SMS adapters are documented boundaries requiring external credentials
 * (see README 'Messaging'). Provider chosen via MESSAGING_PROVIDER env + settings.
 */

export interface SendMessageInput {
  phone: string;
  message: string;
  channel: "whatsapp" | "sms" | "manual" | "mock";
}

export interface SendMessageResult {
  status: "SENT" | "FAILED" | "SKIPPED";
  providerRef?: string;
  error?: string;
}

export interface MessagingProvider {
  send(input: SendMessageInput): Promise<SendMessageResult>;
}

class MockMessagingProvider implements MessagingProvider {
  private failPhones: Set<string>;

  constructor() {
    this.failPhones = new Set((process.env.MESSAGING_MOCK_FAIL_PHONES ?? "").split(",").map((p) => p.trim()).filter(Boolean));
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    if (this.failPhones.has(input.phone)) {
      return { status: "FAILED", error: "mock failure injected" };
    }
    return {
      status: "SENT",
      providerRef: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}

class DisabledMessagingProvider implements MessagingProvider {
  async send(): Promise<SendMessageResult> {
    return { status: "SKIPPED", error: "messaging disabled" };
  }
}

let provider: MessagingProvider | null = null;

export function getMessaging(): MessagingProvider {
  if (!provider) {
    const kind = (process.env.MESSAGING_PROVIDER || "mock").toLowerCase();
    provider = kind === "disabled" ? new DisabledMessagingProvider() : new MockMessagingProvider();
  }
  return provider;
}

/** Test hook: drop the cached provider so env changes take effect. */
export function resetMessagingProvider(): void {
  provider = null;
}
