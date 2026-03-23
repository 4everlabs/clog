const chatAdapter = {
  createHandler: (name = "clog-telegram") => ({
    id: name,
    send: async (payload) => {
      return {
        ok: true,
        payload,
      };
    },
  }),
};

export default chatAdapter;
