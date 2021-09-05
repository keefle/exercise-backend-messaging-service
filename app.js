import express from "express";
import cookie from "cookie-parser";
import createActions from "./actions.js";
import store from "./store.js";

const log = {
  error: (err) => console.error(Date().toString(), ":", err),
  print: (msg) => console.log(Date().toString(), ":", msg),
};

const actions = createActions(store, log);

const app = express();
app.use(express.json());

// TODO[mohammad]: auto generate good secret on start? (this will force invalidate sessionId's for this instance) or use
// env variable with predetermined secret
app.use(cookie("secret"));

app.post("/auth/signin", (req, res) => {
  actions
    .authenticateUser(req.body)
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
  actions
    .deauthenticateUser({ ...req.body, ...req.signedCookies })
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
  actions
    .createUser(req.body)
    .then(({ msg }) => res.status(200).json({ result: "ok", message: msg }))
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

app.post("/chat/messages/send", (req, res) => {
  actions
    .sendMessage({ ...req.body, ...req.signedCookies })
    .then(({ msg }) => res.status(200).json({ result: "ok", message: msg }))
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

app.post("/chat/messages/get", (req, res) => {
  actions
    .getMessages({ ...req.body, ...req.signedCookies })
    .then(({ msg, data }) =>
      res.status(200).json({ result: "ok", message: msg, data: data })
    )
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

app.post("/users/block", (req, res) => {
  actions
    .blockUser({ ...req.body, ...req.signedCookies })
    .then(({ msg }) => res.status(200).json({ result: "ok", message: msg }))
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

app.post("/chats/get", (req, res) => {
  actions
    .getChats({ ...req.body, ...req.signedCookies })
    .then(({ msg, data }) =>
      res.status(200).json({ result: "ok", message: msg, data: data })
    )
    .catch((err) =>
      res.status(500).json({ result: "errored", message: err.message })
    );
});

export { app };
