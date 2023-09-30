const qrimage = require("qr-image");
const express = require("express");
const app = express();
const port = 3000;
const accounts = {};
const clients = [];
const logs = [];

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const e = require("express");

for (let index = 0; index < 5; index++) {
  setTimeout(() => {
    start_client(index);
  }, index * 5000);
}

function start_client(index) {
  let client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      ignoreHTTPSErrors: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });
  clients[index] = {
    client: client,
    state: "waiting for qr",
    connected_to: null,
  };
  event_liseners();
  // client.initialize();

  function event_liseners() {
    client.on("disconnected", () => {
      delete accounts[clients[index].connected_to];
      clients[index].connected_to = null;
      // client.initialize();
      client.resetState();
      logger("disconnected", " ", index);
      clients[index].state = "waiting for qr";
    });
    client.on("qr", (qr) => {
      logger("qr", " ", index);
      if (clients[index].connected_to != null) {
        let connected_to = clients[index].connected_to;
        accounts[connected_to].qrr = qr;
        logger("qr", " ", connected_to);
      }
      // cb_no_auth();
    });
    client.on("ready", () => {
      logger("Client is ready!");
      clients[index].state = "ready";
      if (clients[index].connected_to != null) {
        logger("client connected", " ", clients[index].connected_to);
        accounts[clients[index].connected_to].intializing = false;
      }
      logger("client connected", " ", index);
    });

    client.on("authenticated", () => {
      logger("Client is authed!");
      // cb_auth();
    });
  }
}

function initialize_client(token) {
  client = null;
  for (let index = 0; index < clients.length; index++) {
    const element = clients[index];
    if (element.connected_to == null) {
      client = element.client;
      client_index = index;
      element.connected_to = token;
      break;
    }
  }
  if (client) {
    accounts[token].client = client;
    accounts[token].client_index = client_index;
    accounts[token].qrr = "";
    client.initialize();
    return true;
  } else {
    return false;
  }
}

app.get("/add_client", async (req, res) => {
  start_client(clients.length);
  res.send("added " + clients.length - 1);
});

app.get("/get_clients_statuses", async (req, res) => {
  res.send(
    clients.map((el, index) => {
      return { index: index, state: el.state };
    })
  );
});

app.get("/get_logs", async (req, res) => {
  res.send(logs);
});
app.get("/clear_logs", async (req, res) => {
  logs = [];
  res.send("cleared");
});

app.get("/destroy/:token", async (req, res) => {
  let index = accounts[req.params.token].client_index;
  let client = accounts[req.params.token].client;
  delete accounts[req.params.token];
  await client.logout();
  await client.resetState();
  // await client.initialize();
  logger("disconnected", " ", index);
  clients[index].state = "waiting for qr";
  res.send("destroyed");
  // accounts[req.params.token].destroying = false;
});
app.get("/get_qr/:token", (req, res) => {
  function connected() {
    accounts[req.params.token].intializing = false;
  }
  function not_connected() {
    res.header("Content-Type: image/png");
    let img = qrimage.imageSync(accounts[req.params.token].qrr, {
      type: "png",
    });
    res.send(`
    <html>
    <body>
    <img src="data:image/png;base64,${Buffer.from(img).toString("base64")}">
    <script>
    setInterval(()=>{
      location.href=location.href
    },1000)
    </script>
    </body>
    </html>
        `);
  }
  if (accounts[req.params.token] == null) {
    accounts[req.params.token] = { intializing: true };
    if (initialize_client(req.params.token)) {
      res.send("started connection");
    } else {
      res.send("couldn't assign user to client");
    }
  } else {
    if (accounts[req.params.token].destroying == null) {
      if (accounts[req.params.token].intializing) {
        not_connected();
      } else {
        connected();
        res.send("connected");
      }
    } else {
      res.send("Pending client stopping");
    }
  }
});

app.get("/get_state/:token", (req, res) => {
  if (accounts[req.params.token] != null) {
    if (accounts[req.params.token].intializing == false) {
      let index = accounts[req.params.token].client_index;
      res.send(clients[index].state);
    } else {
      res.send("pending connection");
    }
  } else {
    res.send("not started the client");
  }
});

app.get("/get_status/:token", (req, res) => {
  if (accounts[req.params.token] != null) {
    if (accounts[req.params.token].intializing == false) {
      let client = accounts[req.params.token].client;
      client
        .getState()
        .then((state) => {
          res.send(state);
        })
        .catch(() => {
          res.send("unable to fetch state");
        });
    } else {
      res.send("pending connection");
    }
  } else {
    res.send("not started the client");
  }
});

app.get("/send_message/:token", (req, res) => {
  if (req.query.number && req.query.image_url) {
    if (
      accounts[req.params.token] != null &&
      accounts[req.params.token].destroying == null &&
      accounts[req.params.token].intializing == false
    ) {
      let client = accounts[req.params.token].client;
      client
        .getState()
        .then((state) => {
          if (state == "CONNECTED") {
            const number = req.query.number;
            const text = req.query.image_url;
            const chatId = number.substring(1) + "@c.us";
            if (req.query.is_text == null) {
              // sending media
              const media = MessageMedia.fromUrl(text)
                .then((media) => {
                  client
                    .sendMessage(chatId, media)
                    .then(() => {
                      res.send("sent");
                    })
                    .catch(() => {
                      res.send("connected but couldn't send text");
                    });
                })
                .catch(() => {
                  res.send("couldn't get media");
                });
            } else {
              // sending text
              client
                .sendMessage(chatId, text)
                .then(() => {
                  res.send("sent");
                })
                .catch(() => {
                  res.send("connected but couldn't send image");
                });
            }
          } else {
            res.send("not connected");
          }
        })
        .catch(() => {
          res.send("not sent due to unknown error");
        });
    } else {
      res.send("not started the client or client is being stopped");
    }
  }
});

app
  .listen(port, () => {
    logger(`Example app listening on port ${port}`);
  })
  .setTimeout(15 * 1000);

function logger(...args) {
  console.log(...args);
  logs.push({
    time: Date.now(),
    message: args,
  });
}
