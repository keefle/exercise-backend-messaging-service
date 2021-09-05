import supertest from "supertest";
import { app } from "../src/app";
import ioredis from "ioredis";

const redis = new ioredis(6379, "redis");

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
        const result = res.body;
        expect(result.status).toEqual("succeeded");
      });

    await api
      .post("/auth/signin")
      .send({ username: "jmo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("succeeded");
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
          const result = res.body;
          expect(result.status).toEqual("succeeded");
        });
    }

    const msgsToAli = await api
      .post("/chat/messages/get")
      .set("Cookie", cookies)
      .send({ withUsername: "ali", noMsgs: 10 })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("succeeded");
        expect(result.data).toBeTruthy();
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
        const result = res.body;
        expect(result.status).toEqual("succeeded");
        expect(result.data).toBeTruthy();
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
        const result = res.body;
        expect(result.status).toEqual("succeeded");
        expect(res.headers["set-cookie"][0]).toBeTruthy();
        cookies = res.header["set-cookie"];
      });

    await api
      .post("/chats/get")
      .set("Cookie", cookies)
      .send({ noChats: 10 })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("succeeded");
        expect(result.data).toBeTruthy();
        expect(result.data.map((chat) => chat.username).sort()).toStrictEqual(
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
        const result = res.body;
        expect(result.status).toEqual("succeeded");
        expect(res.headers["set-cookie"][0]).toBeTruthy();
        cookies = res.header["set-cookie"];
      });

    await api
      .post("/users/block")
      .set("Cookie", cookies)
      .send({ toBlockUsername: "joe" })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("succeeded");
      });

    await api
      .post("/chats/get")
      .set("Cookie", cookies)
      .send({ noChats: 10 })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("succeeded");
        expect(result.data).toBeTruthy();
        expect(result.data.map((chat) => chat.username).sort()).toStrictEqual(
          ["ali"].sort()
        );
      });

    console.log("HERE");
    await api
      .post("/chat/messages/get")
      .set("Cookie", cookies)
      .send({ withUsername: "joe", noMsgs: 10 })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("failed");
        expect(result.data).toBeFalsy();
      });
  });
});
