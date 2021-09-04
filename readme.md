# Messaging Service


Techincal Information:

1. Use bcrypt for password hash and authentication
2. Use session token stored in the client's cookie (client side) and redis (server side)
3. Use redis as the database (more on that down under the database heading)


## Database

Redis is used here as the database (and cache for sessions).

Structure:
* `messaging-service:users:${username}:profile`:  A table containing the user's json struct (username, passhash, fullname)
* `messaging-service:users:${username}:blocked`:  A set of usernames which are not allowed to communicate with the user
* `messaging-service:users:${username}:activity`: A list containing all of the user's signin attempts and their status
* `messaging-service:chats:${username1 + username2, where username1 < username2 }`: A list containing messages as json structs
* `messaging-service:sessions:${uuid}`: A string representing the username who signed for this session

## Project Todos

* [X] Add authentication.
* [X] Add basic logging.
* [X] Add send message to other `user` via username (creating a chat).
* [X] Add get last (n) messages from chat with other `user` via username.
* [ ] Add block other `user` via username.
* [ ] Go Over errors and store on log server (basic redis server for now, can be replaced with ELK stack in the future).
* [ ] Add acitivity log tracking (store signin attempts).
* [ ] Add extra try catch to make sure only what is meant to be shown in error messages is shown to the user.
* [ ] Setup docker-compose for this project with (1x api (nodejs), 1x database (redis), 1x logserver (redis)).
