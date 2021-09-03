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
  await redis.hdel(sessionKey, sessionId);

  return { msg: `successfully signed out user with username (${username})` };
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
