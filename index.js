const express = require("express");
const app = express();
const auth = require("./app/auth/auth");
const link = require("./app/link/link");
const middleware = require("./app/middleware/middleware");
const update = require("./app/update/update");
const handle = require("./app/update/handle");
const canvas = require("./app/canvas/canvas");
const gedcom=require("./app/gedcom/gedcom")
const cors=require("cors")
app.use(cors());
app.use(express.json());

app.use("/auth", auth);
app.use("/link", link);
app.use("/update", update);
app.use("/handle", handle);
app.use("/canvas", canvas);
app.use("/gedcom", gedcom);

app.get("/", middleware, (req, res) => {
    res.json({ is_authenticated: true, user: req.user });
});

app.listen(4000, () => {
    console.log("Server is running on port 4000");
});

