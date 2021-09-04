import express from "express";
import ioredis from "ioredis";
import bcrypt from "bcryptjs";
import cookie from "cookie-parser";
import cors from "cors";

import { v4 as uuidv4 } from "uuid";

const redis = new ioredis();

const log = {
  error: (err) => console.error(Date().toString(), ":", err),
  print: (msg) => console.log(Date().toString(), ":", msg),
};

const app = express();
app.use(express.json());
app.use(cors());

// TODO[mohammad]: auto generate good secret on start? (this will force invalidate sessionId's for this instance) or use
// env variable with predetermined secret
app.use(cookie("secret"));

app.post("/auth/signin", (req, res) => {
  authenticateUser(req.body)
    .then(({ msg, sessionId }) =>
      res
        .status(200)
        .cookie("sessionId", sessionId, {
          httpOnly: true,
          maxAge: 24 * 60 * 60,
          signed: true,
          // TODO[mohammad]: add signed state when in production (setup NODE_ENV accordingly)
          secure: false,
        })
        .json({ result: "ok", message: msg })
    )
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

app.post("/auth/signout", (req, res) => {
  deauthenticateUser({ ...req.body, ...req.signedCookies })
    .then(({ msg }) =>
      res
        .status(200)
        .clearCookie("sessionId")
        .json({ result: "ok", message: msg })
    )
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

app.post("/auth/signup", (req, res) => {
  createUser(req.body)
    .then(({ msg }) => res.status(200).json({ result: "ok", message: msg }))
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

app.post("/chat/messages/send", (req, res) => {
  sendMessage({ ...req.body, ...req.signedCookies })
    .then(({ msg }) => res.status(200).json({ result: "ok", message: msg }))
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

app.post("/chat/messages/get", (req, res) => {
  getMessages({ ...req.body, ...req.signedCookies })
    .then(({ msg, data }) =>
      res.status(200).json({ result: "ok", message: msg, data: data })
    )
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

app.post("/users/block", (req, res) => {
  blockUser({ ...req.body, ...req.signedCookies })
    .then(({ msg }) => res.status(200).json({ result: "ok", message: msg }))
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

app.post("/chats/get", (req, res) => {
  getChats({ ...req.body, ...req.signedCookies })
    .then(({ msg, data }) =>
      res.status(200).json({ result: "ok", message: msg, data: data })
    )
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

async function deauthenticateUser({ sessionId }) {
  log.print(`attempt to deauthenticate user via session id`);
  if (!sessionId) {
    throw new Error(`sessionId provided is not signed in`);
  }

  const sessionKey = `messaging-service:sessions`;
  if (!(await redis.hexists(sessionKey, sessionId))) {
    throw new Error(`sessionId provided is not signed in`);
  }

  const username = await redis.hget(sessionKey, sessionId);

  return redis
    .hdel(sessionKey, sessionId)
    .then(() => {
      const result = {
        msg: `successfully signed out user with username (${username})`,
      };
      log.print(result);
      return result;
    })
    .catch((err) => {
      const nerr = new Error(
        `internal server error when singing out user with username (${username})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    });
}

async function blockUser({ sessionId, toBlockUsername }) {
  // TODO[mohammad]: Should one be able to block themselves?
  log.print(`attempt to deauthenticate user via session id`);
  if (!sessionId) {
    throw new Error(`sessionId provided is not signed in`);
  }

  if (!toBlockUsername) {
    const err = new Error(`user block request is missing username to block`);
    log.error(err);
    throw err;
  }

  const sessionKey = `messaging-service:sessions`;
  if (!(await redis.hexists(sessionKey, sessionId))) {
    throw new Error(`sessionId provided is not signed in`);
  }

  const username = await redis.hget(sessionKey, sessionId);

  const chatsWithKey = `messaging-service:users:${username}:chats-with`; // contains a set of other users the user chats with
  const chatsInfoKey = `messaging-service:users:${username}:chats-info`; // contains a map from other users the user chats with to their respective prefrences (block/mute/etc)

  const dbpromises = Promise.all([
    redis.lpush(chatsWithKey, toBlockUsername),
    redis.hset(
      chatsInfoKey,
      toBlockUsername,
      JSON.stringify({ username: toBlockUsername, blocked: true })
    ),
  ]);

  return dbpromises
    .then(() => {
      const result = {
        msg: `successfully blocked user with username (${toBlockUsername})`,
      };

      log.print(result.msg);
      return result;
    })
    .catch((err) => {
      const nerr = new Error(
        `internal server error when blocking user with username (${toBlockUsername})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    });
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

  const userProfileKey = `messaging-service:users:${username}`;
  if (!(await redis.hexists(userProfileKey, "profile"))) {
    const err = new Error(`user with username (${username}) does not exist`);
    log.error(err);
    throw err;
  }

  const { passhash } = JSON.parse(await redis.hget(userProfileKey, "profile"));
  if (!(await bcrypt.compare(password, passhash))) {
    const err = new Error(
      `username (${username}) and/or password are incorrect`
    );
    log.error(err);
    throw err;
  }

  const sessionKey = `messaging-service:sessions`;
  const sessionId = uuidv4();

  // TODO[mohammad]: set expiration on sessionId
  return redis
    .hset(sessionKey, sessionId, username)
    .then(() => {
      const result = {
        msg: `successfully signed in with username (${username})`,
        sessionId: sessionId,
      };

      log.print(result.msg);
      return result;
    })
    .catch((err) => {
      const nerr = new Error(
        `internal server error when singing in user with username (${username})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    });
}

async function getMessages({ sessionId, withUsername, noMsgs }) {
  log.print(
    `attempt to get messages from chat with user with username (${withUsername})`
  );

  if (!sessionId) {
    // TODO[mohammad]: make error message more clear
    throw new Error(`sessionId provided is not signed in`);
  }

  if (!(withUsername && noMsgs)) {
    throw new Error(
      `get messages request is missing username or number of messages`
    );
  }

  const sessionKey = `messaging-service:sessions`;
  if (!(await redis.hexists(sessionKey, sessionId))) {
    throw new Error(`sessionId provided is not signed in`);
  }

  const username = await redis.hget(sessionKey, sessionId);

  const chatId = [username, withUsername].sort().join("-with-");

  const chatKey = `messaging-service:chats:${chatId}`;
  const chatsInfoKey = `messaging-service:users:${username}:chats-info`;

  const existsBefore = await redis.hexists(chatsInfoKey, withUsername);

  if (!existsBefore) {
    const result = {
      msg: `cannot get messages from user with username (${withUsername}) as there is no chat with them`,
      data: [],
    };

    log.print(result);
    return result;
  }

  const { blocked } = await redis
    .hget(chatsInfoKey, withUsername)
    .then(JSON.parse);

  if (blocked) {
    const result = {
      msg: `cannot get messages from blocked user with username (${withUsername})`,
    };
    log.print(result);
    return result;
  }

  return redis
    .lrange(chatKey, 0, noMsgs)
    .then((data) => data.map((msg) => JSON.parse(msg)))
    .then((chatMsgs) => {
      const result = {
        msg: `successfully got messages from chat between user with username (${username}) and user with username (${withUsername})`,
        data: chatMsgs,
      };
      log.print(result);
      return result;
    })
    .catch((err) => {
      const nerr = new Error(
        `internal server error when getting messages from chat between user with username (${username}) to user with username (${withUsername})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    });
}

async function getChats({ sessionId, noChats }) {
  log.print(`attempt to get chats with users`);

  if (!sessionId) {
    // TODO[mohammad]: make error message more clear
    throw new Error(`sessionId provided is not signed in`);
  }

  if (!noChats) {
    throw new Error(`get chats request is missing number of chats`);
  }

  const sessionKey = `messaging-service:sessions`;
  if (!(await redis.hexists(sessionKey, sessionId))) {
    throw new Error(`sessionId provided is not signed in`);
  }

  const username = await redis.hget(sessionKey, sessionId);

  const chatsWithKey = `messaging-service:users:${username}:chats-with`; // contains a list of other users the user chats with
  const chatsInfoKey = `messaging-service:users:${username}:chats-info`; // contains a map from other users the user chats with to their respective prefrences (block/mute/etc)

  return redis
    .lrange(chatsWithKey, 0, noChats)
    .then((chats) => {
      const chatListpromises = chats.map((withUsername) =>
        redis.hget(chatsInfoKey, withUsername).then(JSON.parse)
      );

      return Promise.all(chatListpromises);
    })
    .then((chatList) =>
      chatList.filter(({ blocked }) => {
        return !blocked;
      })
    )
    .then((chats) => {
      const result = {
        msg: `successfully got chat list`,
        data: chats,
      };
      log.print(result);
      return result;
    })
    .catch((err) => {
      const nerr = new Error(`internal server error when getting chat list`, {
        cause: err,
      });

      log.error(nerr);
      throw nerr;
    });
}

async function sendMessage({ sessionId, receiverUsername, content }) {
  log.print(
    `attempt to send message to user with username (${receiverUsername})`
  );

  if (!sessionId) {
    throw new Error(`sessionId provided is not signed in`);
  }

  if (!(receiverUsername && content)) {
    throw new Error(
      `send message request is missing receiver username or content of message`
    );
  }

  const sessionKey = `messaging-service:sessions`;
  if (!(await redis.hexists(sessionKey, sessionId))) {
    throw new Error(`sessionId provided is not signed in`);
  }

  const senderUsername = await redis.hget(sessionKey, sessionId);

  const chatId = [senderUsername, receiverUsername].sort().join("-with-");

  const chatKey = `messaging-service:chats:${chatId}`;

  const chatsWithKey = `messaging-service:users:${senderUsername}:chats-with`; // contains a list of other users the user chats with
  const chatsInfoKey = `messaging-service:users:${senderUsername}:chats-info`; // contains a map from other users the user chats with to their respective prefrences (block/mute/etc)

  // check if the receiver was chatted with before, then check if they are blocked or not
  try {
    const existsBefore = await redis.hexists(chatsInfoKey, receiverUsername);
    if (!existsBefore) {
      await Promise.all([
        redis.lpush(chatsWithKey, receiverUsername),
        redis.hset(
          chatsInfoKey,
          receiverUsername,
          JSON.stringify({ username: receiverUsername, blocked: false })
        ),
      ]);
    }

    const { blocked } = await redis
      .hget(chatsInfoKey, receiverUsername)
      .then(JSON.parse);

    if (blocked) {
      const result = {
        msg: `cannot send message to blocked user with username (${receiverUsername})`,
      };
      log.print(result);
      return result;
    }
  } catch (err) {
    const nerr = new Error(
      `internal server error when sending message from user with username (${senderUsername}) to user with username (${receiverUsername})`,
      { cause: err }
    );
    log.error(nerr);
    throw nerr;
  }

  return redis
    .lpush(
      chatKey,
      JSON.stringify({
        from: senderUsername,
        to: receiverUsername,
        content: content,
        id: uuidv4(),
      })
    )
    .then(() => {
      const result = {
        msg: `successfully sent message from user with username (${senderUsername}) to user with username (${receiverUsername})`,
      };
      log.print(result);
      return result;
    })
    .catch((err) => {
      const nerr = new Error(
        `internal server error when sending message from user with username (${senderUsername}) to user with username (${receiverUsername})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    });
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

  const userProfileKey = `messaging-service:users:${username}`;
  if (await redis.hexists(userProfileKey, "profile")) {
    const err = new Error(`user with username (${username}) already exists`);
    log.error(err);
    throw err;
  }

  const passsalt = await bcrypt.genSalt(10);
  const passhash = await bcrypt.hash(password, passsalt);

  return redis
    .hset(
      userProfileKey,
      "profile",
      JSON.stringify({ username, passhash, extra })
    )
    .then(() => {
      const result = {
        msg: `successfully created user with username (${username})`,
      };
      log.print(result);
      return result;
    })
    .catch((err) => {
      const nerr = new Error(
        `internal server error when creating user with username (${username})`,
        { cause: err }
      );

      log.error(nerr);
      throw nerr;
    });
}

app.listen(3000);
