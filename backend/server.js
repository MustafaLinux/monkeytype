const express = require("express");
const { config } = require("dotenv");
const path = require("path");
const MonkeyError = require("./handlers/error");
config({ path: path.join(__dirname, ".env") });

const cors = require("cors");
const admin = require("firebase-admin");

const serviceAccount = require("./credentials/serviceAccountKey.json");
const { connectDB, mongoDB } = require("./init/mongodb");

const PORT = process.env.PORT || 5005;

// MIDDLEWARE &  SETUP
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

app.set("trust proxy", 1);

app.use((req, res, next) => {
  if (process.env.MAINTENANCE === "true") {
    res.status(503).json({ message: "Server is down for maintenance" });
  } else {
    next();
  }
});

const userRouter = require("./api/routes/user");
app.use("/user", userRouter);
const configRouter = require("./api/routes/config");
app.use("/config", configRouter);
const resultRouter = require("./api/routes/result");
app.use("/results", resultRouter);
const presetRouter = require("./api/routes/preset");
app.use("/presets", presetRouter);
const quoteRatings = require("./api/routes/quote-ratings");
app.use("/quote-ratings", quoteRatings);
const psaRouter = require("./api/routes/psa");
app.use("/psa", psaRouter);
const leaderboardsRouter = require("./api/routes/leaderboards");
app.use("/leaderboard", leaderboardsRouter);
const newQuotesRouter = require("./api/routes/new-quotes");
app.use("/new-quotes", newQuotesRouter);

app.use(function (e, req, res, next) {
  let uid = undefined;
  if (req.decodedToken) {
    uid = req.decodedToken.uid;
  }
  let monkeyError;
  if (e.errorID) {
    //its a monkey error
    monkeyError = e;
  } else {
    //its a server error
    monkeyError = new MonkeyError(e.status, e.message, e.stack, uid);
  }
  if (process.env.MODE !== "dev" && monkeyError.status > 400) {
    mongoDB().collection("errors").insertOne({
      _id: monkeyError.errorID,
      timestamp: Date.now(),
      status: monkeyError.status,
      uid: monkeyError.uid,
      message: monkeyError.message,
      stack: monkeyError.stack,
    });
  }
  return res.status(e.status || 500).json(monkeyError);
});

app.get("/test", (req, res) => {
  res.send("Hello World!");
});

app.listen(PORT, async () => {
  console.log(`listening on port ${PORT}`);
  await connectDB();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Database Connected");

  // refactor();
});

async function refactor() {
  let users = await mongoDB().collection("users").find({}).toArray();

  for (let user of users) {
    let obj = user.personalBests;

    lbPb = {
      time: {
        15: {},
        60: {},
      },
    };
    let bestForEveryLanguage = {};
    if (obj?.time?.[15]) {
      obj.time[15].forEach((pb) => {
        if (!bestForEveryLanguage[pb.language]) {
          bestForEveryLanguage[pb.language] = pb;
        } else {
          if (bestForEveryLanguage[pb.language].wpm < pb.wpm) {
            bestForEveryLanguage[pb.language] = pb;
          }
        }
      });
      Object.keys(bestForEveryLanguage).forEach((key) => {
        lbPb.time[15][key] = bestForEveryLanguage[key];
      });
      bestForEveryLanguage = {};
    }
    if (obj?.time?.[60]) {
      obj.time[60].forEach((pb) => {
        if (!bestForEveryLanguage[pb.language]) {
          bestForEveryLanguage[pb.language] = pb;
        } else {
          if (bestForEveryLanguage[pb.language].wpm < pb.wpm) {
            bestForEveryLanguage[pb.language] = pb;
          }
        }
      });
      Object.keys(bestForEveryLanguage).forEach((key) => {
        lbPb.time[60][key] = bestForEveryLanguage[key];
      });
    }

    await mongoDB()
      .collection("users")
      .updateOne({ _id: user._id }, { $set: { lbPersonalBests: lbPb } });
    console.log(`updated ${user.name}`);
  }
}
