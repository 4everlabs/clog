import type { ConversationThread, SurfaceChannelKind } from "@clog/types";

export interface OutboundChatAdapter {
  readonly channel: SurfaceChannelKind;
  notify(thread: ConversationThread, message: string): Promise<void>;
}

export class NullChatAdapter implements OutboundChatAdapter {
  constructor(public readonly channel: SurfaceChannelKind) {}

  async notify(_thread: ConversationThread, _message: string): Promise<void> {
    return;
  }
}
