// const qrcode = require("qrcode-terminal");
const qrimage = require("qr-image");
const express = require("express");
const app = express();
const port = 3000;
const accounts = {};

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const e = require("express");

function initialize_client(token, cb_ready, cb_auth, cb_no_auth) {
  // before firing this function check to see if the account obj prop exsists or not
  // let path = "./webjs_auth/sesssion-" + token;
  let client = new Client({
    restartOnAuthFail: true,
    authStrategy: new LocalAuth({ clientId: token }),
    puppeteer: {
      args: [
        "--no-sandbox",
        // "--disable-setuid-sandbox",
        // "--disable-dev-shm-usage",
        // "--disable-accelerated-2d-canvas",
        // "--no-first-run",
        // "--no-zygote",
        // "--disable-gpu",
      ],
    },
  });
  accounts[token].client = client;
  accounts[token].qrr = "";
  accounts[token].refreshes = 0;
  client.on("qr", (qr) => {
    accounts[token].qrr = qr;
    accounts[token].refreshes++;
    console.log("qr");
    cb_no_auth();
  });

  client.initialize();

  client.on("ready", () => {
    console.log("Client is ready!");
    cb_ready();
  });

  client.on("authenticated", () => {
    console.log("Client is authed!");
    cb_auth();
  });
}

app.get("/get_refreshes/:token", (req, res) => {
  res.send(`${accounts[req.params.token].refreshes}`);
});
app.get("/get_qr/:token", (req, res) => {
  function connected() {
    res.send(`
    <html>
    <body>
    <p>already connected</p>
    </body>
    </html>
`);
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
  let refreshes = ${accounts[req.params.token].refreshes};
  setInterval(()=>{
      fetch("/get_refreshes").then((r)=>{
          r.text().then((txt)=>{
              if (txt.trim() != refreshes){
                  location.href=location.href
              }
          })
      })
  },1000)
  </script>
  </body>
  </html>
`);
  }
  if (accounts[req.params.token] == null) {
    accounts[req.params.token] = {};
    initialize_client(req.params.token, connected, connected, not_connected);
  } else {
    accounts[req.params.token].client.getState().then((state) => {
      if (state == "CONNECTED") {
        connected();
      } else {
        not_connected();
      }
    });
  }
});

app.get("/send_message/:token", (req, res) => {
  if (req.query.number && req.query.image_url) {
    if (accounts[req.params.token] != null) {
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
              const media = MessageMedia.fromUrl(text).then((media) => {
                client
                  .sendMessage(chatId, media)
                  .then(() => {
                    res.send("sent");
                  })
                  .catch(() => {
                    res.send("not sent");
                  });
              });
            } else {
              // sending text
              client
                .sendMessage(chatId, text)
                .then(() => {
                  res.send("sent");
                })
                .catch(() => {
                  res.send("not sent");
                });
            }
          } else {
            res.send("not connected");
          }
        })
        .catch(() => {
          res.send("not sent");
        });
    } else {
      res.send("not started the client");
    }
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
