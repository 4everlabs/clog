class Chat {
  constructor(options = {}) {
    this.options = options;
    this.completions = {
      create: async (payload) => {
        const messages = payload?.messages ?? [];
        const userMessage = messages[messages.length - 1]?.content ?? "no content";
        return {
          choices: [
            {
              message: {
                content: `Stubbed Vercel AI response for "${userMessage}".`,
              },
            },
          ],
        };
      },
    };
  }
}

export { Chat };
