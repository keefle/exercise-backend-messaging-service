import bcrypt from "bcryptjs";

const actions = function (store, log) {
  async function deauthenticateUser({ sessionId }) {
    log.print(`attempt to deauthenticate user via session id`);

    try {
      const username = await store.getUserBySessionId(sessionId);

      const result = await store.expireSessionId(sessionId).then(() => {
        return {
          message: `successfully signed out user with username (${username})`,
          status: "succeeded",
        };
      });

      log.print(result);
      return result;
    } catch (err) {
      const nerr = new Error(
        `internal server error when singing out user with username (${username})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    }
  }

  async function blockUser({ sessionId, toBlockUsername }) {
    // TODO[mohammad]: Should one be able to block themselves?
    log.print(`attempt to block user with username (${toBlockUsername})`);

    if (!(sessionId && toBlockUsername)) {
      const err = new Error(`user block request is missing username to block`);
      log.error(err);
      throw err;
    }

    try {
      const username = await store.getUserBySessionId(sessionId);

      const result = await store
        .blockUserByUsername(username, toBlockUsername)
        .then(() => {
          return {
            status: "succeeded",
            message: `successfully blocked user with username (${toBlockUsername})`,
          };
        });

      log.print(result);
      return result;
    } catch (err) {
      const nerr = new Error(
        `internal server error when blocking user with username (${toBlockUsername})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    }
  }

  async function authenticateUser({ username, password }) {
    log.print(`attempt to authenticate user with username (${username})`);

    // make sure the user submitted the minimum set of information required to signin their account (username and password)
    if (!(username && password)) {
      const err = new Error(
        `user signin request is missing username and/or password`
      );
      log.error(err);
      throw err;
    }

    await store.userMustExist(username);

    try {
      const { passhash } = await store.getUserProfile(username);

      if (!(await bcrypt.compare(password, passhash))) {
        const result = {
          status: "failed",
          message: `username (${username}) and/or password are incorrect`,
          data: "",
        };

        store.logSigninAttempt(username, {
          at: Date().toString(),
          result: "Failed",
        });

        log.print(result);
        return result;
      }

      const result = await store
        .setUserSessionId(username)
        .then((sessionId) => {
          store.logSigninAttempt(username, {
            at: Date().toString(),
            result: "Succeeded",
          });

          return {
            status: "succeeded",
            message: `successfully signed in with username (${username})`,
            data: sessionId,
          };
        });

      log.print(result);

      return result;
    } catch (err) {
      log.error(err);

      const nerr = new Error(
        `internal server error when singing in user with username (${username})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    }
  }

  async function getMessages({ sessionId, withUsername, noMsgs }) {
    log.print(
      `attempt to get messages from chat with user with username (${withUsername})`
    );

    if (!(sessionId && withUsername && noMsgs)) {
      throw new Error(
        `get messages request is missing username or number of messages`
      );
    }

    try {
      const username = await store.getUserBySessionId(sessionId);

      const { blocked } = await store.getUserChatInfo(username, withUsername);

      if (blocked) {
        return {
          status: "failed",
          message: `cannot get messages since it is from a blocked user with username (${username})`,
        };
      }

      const result = await store
        .getMessagesRange(username, withUsername, 0, noMsgs)
        .then((chatMsgs) => {
          return {
            status: "succeeded",
            message: `successfully got messages from chat of user with (${username}) with user with username ${withUsername}`,
            data: chatMsgs,
          };
        });

      log.print(result);
      return result;
    } catch (err) {
      const nerr = new Error(
        `internal server error when getting messages from chat between user with username (${username}) to user with username (${withUsername})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    }
  }

  async function getActivity({ sessionId, noActivity }) {
    log.print(`attempt to get sign in activity`);

    if (!(sessionId && noActivity)) {
      throw new Error(
        `get activity log request is missing number of activities`
      );
    }

    try {
      const username = await store.getUserBySessionId(sessionId);

      const result = await store
        .getActivityRange(username, 0, noActivity)
        .then((activity) => {
          return {
            status: "succeeded",
            message: `successfully got activity log of user with username (${username})`,
            data: activity,
          };
        });

      log.print(result);
      return result;
    } catch (err) {
      const nerr = new Error(
        `internal server error when getting activity log of user with username (${username})`,
        {
          cause: err,
        }
      );

      log.error(nerr);
      throw nerr;
    }
  }
  async function getChats({ sessionId, noChats }) {
    log.print(`attempt to get chats with users`);

    if (!(sessionId && noChats)) {
      throw new Error(`get chats request is missing number of chats`);
    }

    try {
      const username = await store.getUserBySessionId(sessionId);

      const result = await store
        .getChatsRange(username, 0, noChats)
        .then((chatList) => {
          const chatListpromises = chatList.map((withUsername) =>
            store.getUserChatInfo(username, withUsername)
          );

          return Promise.all(chatListpromises);
        })
        .then((chatList) =>
          chatList.filter(({ blocked }) => {
            return !blocked;
          })
        )
        .then((chats) => {
          return {
            status: "succeeded",
            message: `successfully got chat list of user with username (${username})`,
            data: chats,
          };
        });

      log.print(result);

      return result;
    } catch (err) {
      const nerr = new Error(`internal server error when getting chat list`, {
        cause: err,
      });

      log.error(nerr);
      throw nerr;
    }
  }

  async function sendMessage({ sessionId, receiverUsername, content }) {
    log.print(
      `attempt to send message to user with username (${receiverUsername})`
    );

    if (!(sessionId && receiverUsername && content)) {
      throw new Error(
        `send message request is missing receiver username or content of message`
      );
    }

    try {
      const senderUsername = await store.getUserBySessionId(sessionId);

      // check if the receiver was chatted with before, then check if they are blocked or not
      await store.createChatWithUsernameIfNotPresent(
        senderUsername,
        receiverUsername
      );

      const { blocked } = await store.getUserChatInfo(
        senderUsername,
        receiverUsername
      );

      if (blocked) {
        return {
          status: "failed",
          message: `cannot send message to blocked user with username (${receiverUsername})`,
        };
      }

      const result = await store
        .sendMessageToUser(senderUsername, receiverUsername, content)
        .then(() => {
          return {
            message: `successfully sent message from user with username (${senderUsername}) to user with username (${receiverUsername})`,
            status: "succeeded",
          };
        });

      log.print(result);
      return result;
    } catch (err) {
      const nerr = new Error(
        `internal server error when sending message from user with username (${senderUsername}) to user with username (${receiverUsername})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    }
  }

  async function createUser({ username, password, extra }) {
    log.print(`attempt to create user with username (${username})`);

    // make sure the user submitted the minimum set of information required to create an account (username and password)
    if (!(username && password)) {
      const err = new Error(
        `user signup request is missing username and/or password`
      );

      log.error(err);
      throw err;
    }

    try {
      await store.userMustNotExist(username);

      const passsalt = await bcrypt.genSalt(10);
      const passhash = await bcrypt.hash(password, passsalt);

      const result = await store
        .setUserProfile({ username, passhash, extra })
        .then(() => {
          return {
            status: "succeeded",
            message: `successfully created user with username (${username})`,
          };
        });

      log.print(result);

      return result;
    } catch (err) {
      const nerr = new Error(
        `internal server error when creating user with username (${username})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    }
  }

  return {
    authenticateUser,
    deauthenticateUser,
    createUser,
    getChats,
    getMessages,
    getActivity,
    sendMessage,
    blockUser,
  };
};

export default actions;
