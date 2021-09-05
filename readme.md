# Messaging Service


Techincal Information:

1. Use bcrypt for password hash and authentication
2. Use session token stored in the client's cookie (client side) and redis (server side)
3. Use redis as the database (more on that down under the database heading)

## Endpoints

| NOTE: There is a tendency to use `POST` even when other HTTP methods are more appropriate which is admittedly a mistake, but it is inspired by graphql and how the client and server only communicate through payloaded messages in the body


| Endpoint | Example Request | Example Response |
|----------|-----------------|------------------|
| `/auth/singup` | `{username: "Mohammad",  password: "test1234"}` | `{status: "succeed", ...}`|
| `/auth/singin` | `{username: "Mohammad",  password: "test1234"}` | `{status: "succeed", ...}`, and a cookie containing a sessionId |
| `/auth/singout` | just the sessionId in the cookie | `{status: "succeed", ...}`,|
| `/chat/messages/send` | `{receiverUsername: "Joe", content: "Hello Joe"}`| `{status: "succeed", ...}`,|
| `/chat/messages/get` | `{withUsername: "Joe", noMsgs: 10}`| `{status: "succeed", data: [{from: "Mohammad", to: "Joe", content: "Hello Joe", ...}]}`
| `/users/block` | `{toBlockUsername: "Joe"}`| `{status: "succeed", ...}`
| `/chats/get` | `{noChats: 10}`| `{status: "succeed", data: ["Ali"], ...}`
| `/activity/get` | `{noAcitivty: 10}`| `{status: "succeed", data: [{at: Data..., result: "failed"}], ...}`


## Database

Redis is used here as the database (and cache for sessions).

Structure:
* `messaging-service:users:${username}:profile`:  A table containing the user's json struct (username, passhash, fullname)
* `messaging-service:users:${username}:chats-with`:  A list of usernames which are not allowed to communicate with the user
* `messaging-service:users:${username}:chats-info`:  A table of details regarding chats with other users (contains block status)
* `messaging-service:users:${username}:activity`: A list containing all of the user's signin attempts and their status
* `messaging-service:chats:${username1 + username2, where username1 < username2 }`: A list containing messages as json structs
* `messaging-service:sessions:${uuid}`: A string representing the username who signed for this session

## Project Todos

* [X] Add authentication.
* [X] Add basic logging.
* [X] Add send message to other `user` via username (creating a chat).
* [X] Add get last (n) messages from chat with other `user` via username.
* [X] Add block other `user` via username.
* [X] Setup docker-compose for this project with (api (nodejs), database (redis))
* [X] Add acitivity log tracking (store signin attempts).
* [X] Add extra try catch to make sure only what is meant to be shown in error messages is shown to the user.
* [ ] Go Over errors and store on log server (basic redis server for now, can be replaced with ELK stack in the future).

## Improvements for the future that were not done on time

* Appropriatly specify and use HTTP methods, and use query parameters to have a propper REST API
* Appropriatly use HTTP status codes (currently only 200 and 500 are used)
* Some sort of central logging service to capture errors early on
* Create a mockup for the `./store.js` to test the actions in a better way
* Refactor the API tests to make them easier to plan ahead, and test more parts of the api
* Use web sockets to handle streaming message notifications, as the current implementation would rely on polling to get
  new messages
