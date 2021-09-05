import supertest from "supertest";
import { app } from "../src/app.js";
import ioredis from "ioredis";

const redis = new ioredis(6379, "redis");

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
        const result = res.body;
        expect(result.status).toEqual("succeeded");
      });
  });

  test("user can sign in", async () => {
    await api
      .post("/auth/signin")
      .send({ username: "mo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("succeeded");
        expect(res.headers["set-cookie"][0]).toBeTruthy();
      });
  });

  test("user can sign out", async () => {
    let cookies = await api
      .post("/auth/signin")
      .send({ username: "mo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("succeeded");
        expect(res.headers["set-cookie"][0]).toBeTruthy();
      })
      .then((res) => res.headers["set-cookie"]);

    await api
      .post("/auth/signout")
      .set("Cookie", cookies)
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("succeeded");
      });
  });

  test("user can get an activity log of auth attempts", async () => {
    await api
      .post("/auth/signin")
      .send({ username: "mo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("succeeded");
        expect(res.headers["set-cookie"][0]).toBeTruthy();
      });

    await api
      .post("/auth/signin")
      .send({ username: "mo", password: "noo" })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        console.log("HEEEERE", res.body);
        expect(result.status).toEqual("failed");
      });

    await api
      .post("/auth/signin")
      .send({ username: "mo", password: "wrongpass" })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("failed");
      });

    let cookies = await api
      .post("/auth/signin")
      .send({ username: "mo", password: "1234" })
      .expect(200)
      .expect((res) => {
        const result = res.body;
        expect(result.status).toEqual("succeeded");
        expect(res.headers["set-cookie"][0]).toBeTruthy();
      })
      .then((res) => res.headers["set-cookie"]);

    await api
      .post("/activity/get")
      .set("Cookie", cookies)
      .send({ noActivity: 10 })
      .expect(200)
      .expect((res) => {
        console.log(res.body);
        expect(
          res.body.data.filter((activitylog) => activitylog.result === "Failed")
            .length
        ).toEqual(2);
      });
  });
});
