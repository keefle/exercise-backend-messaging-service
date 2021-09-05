import ioredis from "ioredis";

import { v4 as uuidv4 } from "uuid";

// const redis = new ioredis(6379, "redis");
const redis = new ioredis();

function getUserKey(username) {
  return `messaging-service:users:${username}`;
}

function getUserChatsWithKey(username) {
  return `messaging-service:users:${username}:chats-with`; // contains a list of other users the user chats with
}

function getUserChatsInfoKey(username) {
  return `messaging-service:users:${username}:chats-info`; // contains a map from other users the user chats with to their respective prefrences (block/mute/etc)
}

function getUserChatKey(username, withUsername) {
  const chatId = [username, withUsername].sort().join("-with-");
  return `messaging-service:chats:${chatId}`;
}

function getUserActivityKey(username) {
  return `messaging-service:users:${username}:activity`;
}

async function logSigninAttempt(username, info) {
  try {
    await redis.lpush(getUserActivityKey(username), JSON.stringify(info));
  } catch (err) {
    throw new Error(
      `internal server error when logging new sign in attempt for user with username (${username})`
    );
  }
}

async function getActivityRange(username, start, stop) {
  try {
    const activityList = await redis.lrange(
      getUserActivityKey(username),
      start,
      stop
    );
    return activityList.map(JSON.parse);
  } catch (err) {
    throw new Error(
      `internal server error when getting signin attempts for user with username (${username})`
    );
  }
}

async function getMessagesRange(username, withUsername, start, stop) {
  try {
    const msgList = await redis.lrange(
      getUserChatKey(username, withUsername),
      start,
      stop
    );

    return msgList.map(JSON.parse);
  } catch (err) {
    throw new Error(
      `internal server error when getting msg list for user with username (${username}) with user with username (${username})`,
      { cause: err }
    );
  }
}
async function getChatsRange(username, start, stop) {
  try {
    const chatList = await redis.lrange(
      getUserChatsWithKey(username),
      start,
      stop
    );

    return chatList;
  } catch (err) {
    throw new Error(
      `internal server error when getting chat list for user with username (${username})`,
      { cause: err }
    );
  }
}

async function blockUserByUsername(username, toBeBlockedUsername) {
  try {
    // await createChatWithUsernameIfNotPresent(username, toBeBlockedUsername);
    await redis.hset(
      getUserChatsInfoKey(username),
      toBeBlockedUsername,
      JSON.stringify({ username: toBeBlockedUsername, blocked: true })
    );

    return;
  } catch (err) {
    throw new Error(
      `internal server error when trying to block user with username (${toBeBlockedUsername})`,
      { cause: err }
    );
  }
}

async function sendMessageToUser(fromUsername, toUsername, content) {
  try {
    await redis.lpush(
      getUserChatKey(fromUsername, toUsername),
      JSON.stringify({
        from: fromUsername,
        to: toUsername,
        content: content,
        id: uuidv4(),
      })
    );

    return;
  } catch (err) {
    throw new Error(
      `internal server error when sending message form user with username (${fromUsername}) to user with username (${toUsername})`,
      { cause: err }
    );
  }
}

async function getUserChatInfo(username, withUsername) {
  try {
    const chatInfo = await redis
      .hget(getUserChatsInfoKey(username), withUsername)
      .then(JSON.parse);

    return chatInfo;
  } catch (err) {
    throw new Error(
      `internal server error when getting chat info for user with username (${username}) with user with username (${withUsername})`,
      { cause: err }
    );
  }
}

async function createChatWithUsernameIfNotPresent(username, withUsername) {
  const chatsWithKey = getUserChatsWithKey(username);
  const chatsInfoKey = getUserChatsInfoKey(username);

  try {
    const existsBefore = await redis.hexists(chatsInfoKey, withUsername);

    if (!existsBefore) {
      await Promise.all([
        redis.lpush(chatsWithKey, withUsername),
        redis.hset(
          chatsInfoKey,
          withUsername,
          JSON.stringify({ username: withUsername, blocked: false })
        ),
      ]);
    }
  } catch (err) {
    throw new Error(
      `internal server error when creating chat for user with username (${username}) with user with username (${withUsername})`,
      { cause: err }
    );
  }
}

async function userMustNotExist(username) {
  try {
    await userMustExist(username);
  } catch (err) {
    return;
  }

  throw new Error(`user with username (${username}) already exists`);
}

async function userMustExist(username) {
  try {
    const userProfileKey = getUserKey(username);
    if (await redis.hexists(userProfileKey, "profile")) {
      return;
    }
  } catch (err) {
    throw new Error(`internal server error when checking if user exists`, {
      cause: err,
    });
  }

  throw new Error(`user with username (${username}) does not exist`);
}

async function getUserProfile(username) {
  try {
    await userMustExist(username);
    const userProfile = await redis
      .hget(getUserKey(username), "profile")
      .then(JSON.parse);
    return userProfile;
  } catch (err) {
    throw new Error(`internal server error when getting user profile`, {
      cause: err,
    });
  }
}

async function setUserProfile({ username, passhash, extra }) {
  try {
    await redis.hset(
      getUserKey(username),
      "profile",
      JSON.stringify({ username, passhash, extra })
    );
  } catch (err) {
    throw new Error(`internal server error when setting user profile`, {
      cause: err,
    });
  }
}

async function getUserBySessionId(sessionId) {
  try {
    const sessionKey = `messaging-service:sessions:${sessionId}`;
    const username = await redis.get(sessionKey);

    return username;
  } catch (err) {
    throw new Error(`sessionId provided has expired or is not valid`, {
      cause: err,
    });
  }
}

async function setUserSessionId(username) {
  // sessiondId expire after 24 hours
  try {
    const sessionId = uuidv4();
    const sessionKey = `messaging-service:sessions:${sessionId}`;
    await redis.set(sessionKey, username, "EX", 60 * 60 * 24);

    return sessionId;
  } catch {
    throw new Error(`internal server error when creating user sessionId`);
  }
}

async function expireSessionId(sessionId) {
  const sessionKey = `messaging-service:sessions:${sessionId}`;
  return redis.del(sessionKey).catch((err) => {
    throw new Error(`internal server error when expireing sessiondId`, {
      cause: err,
    });
  });
}

export default {
  setUserProfile,
  setUserSessionId,
  logSigninAttempt,

  expireSessionId,

  createChatWithUsernameIfNotPresent,
  blockUserByUsername,
  sendMessageToUser,

  getChatsRange,
  getMessagesRange,
  getUserBySessionId,
  getUserChatInfo,
  getUserChatKey,
  getUserChatsInfoKey,
  getUserChatsWithKey,
  getUserKey,
  getUserProfile,
  getActivityRange,

  userMustExist,
  userMustNotExist,
};
