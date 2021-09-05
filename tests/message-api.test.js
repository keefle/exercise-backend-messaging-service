import supertest from "supertest";
import { app } from "../app";
import ioredis from "ioredis";

const redis = new ioredis();

const api = supertest(app);
describe("Testing The Messaging API", () => {
  beforeAll(async () => {
    await redis.flushall();
  });

  afterAll(async () => {
    await redis.quit();
  });

  test("user can send and get messages", async () => {
    let cookies = [];

    await api
      .post("/auth/signup")
      .send({ username: "jmo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
      });

    await api
      .post("/auth/signin")
      .send({ username: "jmo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
        expect(res.headers["set-cookie"][0]).toBeTruthy();
        cookies = res.header["set-cookie"];
      });

    let msgsToSend = [
      { receiverUsername: "joe", content: "Hello my old friend" },
      { receiverUsername: "joe", content: "How are you?" },
      { receiverUsername: "ali", content: "Greetings Ali" },
      {
        receiverUsername: "ali",
        content: "Did you finish comp304's homework?",
      },
    ].sort();

    for (const msg of msgsToSend) {
      await api
        .post("/chat/messages/send")
        .set("Cookie", cookies)
        .send(msg)
        .expect(200)
        .expect((res) => {
          const msg = res.body;
          expect(msg.result).toEqual("ok");
        });
    }

    const msgsToAli = await api
      .post("/chat/messages/get")
      .set("Cookie", cookies)
      .send({ withUsername: "ali", noMsgs: 10 })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
        expect(msg.data).toBeTruthy();
      })
      .then((res) => {
        const chatMsgs = res.body.data;
        return chatMsgs.map((msg) => {
          return [msg.to, "+++", msg.content].join();
        });
      });

    const msgsToJoe = await api
      .post("/chat/messages/get")
      .set("Cookie", cookies)
      .send({ withUsername: "joe", noMsgs: 10 })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
        expect(msg.data).toBeTruthy();
      })
      .then((res) => {
        const chatMsgs = res.body.data;
        return chatMsgs.map((msg) => {
          return [msg.to, "+++", msg.content].join();
        });
      });

    expect([...msgsToAli, ...msgsToJoe].sort()).toStrictEqual(
      msgsToSend
        .map((msg) => [msg.receiverUsername, "+++", msg.content].join())
        .sort()
    );
  });

  test("user can get chat list", async () => {
    let cookies = [];
    await api
      .post("/auth/signin")
      .send({ username: "jmo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
        expect(res.headers["set-cookie"][0]).toBeTruthy();
        cookies = res.header["set-cookie"];
      });

    await api
      .post("/chats/get")
      .set("Cookie", cookies)
      .send({ noChats: 10 })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
        expect(msg.data).toBeTruthy();
        expect(msg.data.map((chat) => chat.username).sort()).toStrictEqual(
          ["ali", "joe"].sort()
        );
      });
  });

  test("user can block chat with other user", async () => {
    let cookies = [];
    await api
      .post("/auth/signin")
      .send({ username: "jmo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
        expect(res.headers["set-cookie"][0]).toBeTruthy();
        cookies = res.header["set-cookie"];
      });

    await api
      .post("/users/block")
      .set("Cookie", cookies)
      .send({ toBlockUsername: "joe" })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
      });

    await api
      .post("/chats/get")
      .set("Cookie", cookies)
      .send({ noChats: 10 })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
        expect(msg.data).toBeTruthy();
        expect(msg.data.map((chat) => chat.username).sort()).toStrictEqual(
          ["ali"].sort()
        );
      });

    console.log("HERE");
    await api
      .post("/chat/messages/get")
      .set("Cookie", cookies)
      .send({ withUsername: "joe", noMsgs: 10 })
      .expect(500)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("errored");
        expect(msg.data).toBeFalsy();
      });
  });
});
