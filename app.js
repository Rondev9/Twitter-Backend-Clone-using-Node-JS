const express = require("express");
const app = express();

const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const path = require("path");

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

app.use(express.json());

//Initializing the Database and Server
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen("3690", () => {
      console.log("*** Server is running at http://localhost:3690/ ***");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//Middleware Function to authorize JWT Tokens

const authentication = (request, response, next) => {
  let jwtToken;
  const auth_header = request.headers["authorization"];
  if (auth_header !== undefined) {
    jwtToken = auth_header.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SeCrEtKeY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//Get UserId by username
const getUserId = async (username) => {
  const userIdQuery = `
    SELECT 
        user_id 
    FROM 
        user 
    WHERE 
        username = '${username}';`;
  const userId = await db.get(userIdQuery);
  return userId.user_id;
};

const convertDbObjectToTweetObject = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.date_time,
  };
};

const convertDbObjectToNamesObject = (dbObject) => {
  return {
    name: dbObject.name,
  };
};

const convertDbObjectToTweetDetails = (dbObject) => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject.likes,
    replies: dbObject.replies,
    dateTime: dbObject.date_time,
  };
};

//API 1

app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, password, name, gender } = userDetails;
  const hashedPassword = await bcrypt.hash(password, 13);
  const userExistenceQuery = `
    SELECT
      *
    FROM
        user
    WHERE
        username = '${username}';`;
  const dbUser = await db.get(userExistenceQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const registerUserQuery = `
            INSERT INTO
                user(name, username, password, gender)
            VALUES(
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}'
            );`;
      await db.run(registerUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userVerificationQuery = `
    SELECT
      *
    FROM
        user
    WHERE
        username = '${username}';`;
  const dbUser = await db.get(userVerificationQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "SeCrEtKeY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { username } = request;
  //console.log(username);
  const userId = await getUserId(username);
  const getTweetsQuery = `
    SELECT
        username, tweet, date_time
    FROM
        (follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS test
        NATURAL JOIN user
    WHERE
        follower.follower_user_id = ${userId}
    ORDER BY date_time DESC
    LIMIT 4;`;
  const tweetDetails = await db.all(getTweetsQuery);
  response.send(
    tweetDetails.map((eachTweet) => convertDbObjectToTweetObject(eachTweet))
  );
});

//API 4

app.get("/user/following/", authentication, async (request, response) => {
  const { username } = request;
  const userId = await getUserId(username);
  const userFollowingQuery = `
    SELECT
        name
    FROM
        user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE
        follower.follower_user_id = ${userId};`;
  const followingNames = await db.all(userFollowingQuery);
  response.send(
    followingNames.map((eachName) => convertDbObjectToNamesObject(eachName))
  );
});

//API 5

app.get("/user/followers/", authentication, async (request, response) => {
  const { username } = request;
  const userId = await getUserId(username);
  const userFollowersQuery = `
    SELECT
        name
    FROM
        user INNER JOIN follower ON user_id = follower_user_id
    WHERE
        follower.following_user_id = ${userId};`;
  const followerNames = await db.all(userFollowersQuery);
  response.send(
    followerNames.map((eachName) => convertDbObjectToNamesObject(eachName))
  );
});

//API 6

app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const { username } = request;
  const userId = await getUserId(username);
  const { tweetId } = request.params;
  const legitTweetQuery = `
    SELECT
        *
    FROM
        tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
    WHERE
        follower.follower_user_id = ${userId} AND tweet_id = ${tweetId};`;
  const tweetCheck = await db.get(legitTweetQuery);
  //console.log(tweet);
  if (tweetCheck !== undefined) {
    const tweetIdQuery = `
        SELECT 
            tweet,
            COUNT(like.tweet_id) AS likes,
            COUNT(reply.tweet_id) AS replies,
            date_time
        FROM
            tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
            INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        WHERE
            tweet.tweet_id = ${tweetId};`;
    const tweetDetails = await db.get(tweetIdQuery);
    response.send(convertDbObjectToTweetDetails(tweetDetails));
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const { tweetId } = request.params;
    const tweetCheckQuery = `
    SELECT
        *
    FROM
        tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
    WHERE
        follower.follower_user_id = ${userId} AND tweet_id = ${tweetId};`;
    const tweetCheck = await db.get(tweetCheckQuery);
    if (tweetCheck !== undefined) {
      const likesQuery = `
        SELECT
            user.username
        FROM
            tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
            INNER JOIN user ON like.user_id = user.user_id
        WHERE
            tweet.tweet_id = ${tweetId};`;
      const tweetLikesDetails = await db.all(likesQuery);
      const listOfUserNames = tweetLikesDetails.map(
        (eachLikeName) => eachLikeName.username
      );
      response.send({ likes: listOfUserNames });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const { tweetId } = request.params;
    const tweetCheckQuery = `
    SELECT
        *
    FROM
        tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
    WHERE
        follower.follower_user_id = ${userId} AND tweet_id = ${tweetId};`;
    const tweetCheck = await db.get(tweetCheckQuery);
    if (tweetCheck === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const repliesQuery = `
        SELECT
            user.name, reply.reply
        FROM
            tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
            INNER JOIN user ON reply.user_id = user.user_id
        WHERE
            tweet.tweet_id = ${tweetId};`;
      const tweetRepliesDetails = await db.all(repliesQuery);
      const listOfUserNames = tweetRepliesDetails.map((eachReply) => ({
        name: eachReply.name,
        reply: eachReply.reply,
      }));
      response.send({ replies: listOfUserNames });
    }
  }
);

//API 9

app.get("/user/tweets/", authentication, async (request, response) => {
  const { username } = request;
  const userId = await getUserId(username);
  const tweetQuery = `
SELECT
    tweet,COUNT(*) AS likes,
    (SELECT
        COUNT(*) AS replies
    FROM
        tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE 
        tweet.user_id = ${userId}
    GROUP BY
        tweet.tweet_id) AS replies, date_time
FROM
    tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
WHERE 
    tweet.user_id = ${userId}
GROUP BY
    tweet.tweet_id;`;
  const tweetData = await db.all(tweetQuery);
  response.send(tweetData.map((tweet) => convertDbObjectToTweetDetails(tweet)));
});

//API 10

app.post("/user/tweets/", authentication, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const userId = await getUserId(username);
  const addTweetQuery = `
    INSERT INTO
        tweet(tweet, user_id)
    VALUES(
        '${tweet}',
        ${userId}
    );`;
  db.run(addTweetQuery);
  response.send("Created a Tweet");
});

//API 11

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { username } = request;
  const userId = await getUserId(username);
  const { tweetId } = request.params;
  const tweetCheckQuery = `
    SELECT
        *
    FROM
        tweet
    WHERE
        tweet_id = ${tweetId} AND user_id = ${userId};`;
  const tweetCheck = await db.get(tweetCheckQuery);
  //console.log(tweetCheck);
  if (tweetCheck === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `
        DELETE
        FROM
            tweet
        WHERE
            tweet_id = ${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
