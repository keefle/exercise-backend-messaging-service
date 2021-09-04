import supertest from "supertest";
import { app } from "../app";
import ioredis from "ioredis";

const redis = new ioredis();

const api = supertest(app);
describe("Testing The Auth API", () => {
  beforeAll(async () => {
    await redis.flushall();
  });

  afterAll(async () => {
    await redis.quit();
  });

  test("user can sign up", async () => {
    await api
      .post("/auth/signup")
      .send({ username: "mo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
      });
  });

  test("user can sign in", async () => {
    await api
      .post("/auth/signin")
      .send({ username: "mo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
        expect(res.headers["set-cookie"][0]).toBeTruthy();
      });
  });

  test("user can sign out", async () => {
    let cookies = [];

    await api
      .post("/auth/signin")
      .send({ username: "mo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
        expect(res.headers["set-cookie"][0]).toBeTruthy();

        // get cookies containing sessiondId
        cookies = res.headers["set-cookie"];
      });

    await api
      .post("/auth/signout")
      .set("Cookie", cookies)
      .expect(200)
      .expect((res) => {
        const msg = res.body;
        expect(msg.result).toEqual("ok");
      });
  });
});
