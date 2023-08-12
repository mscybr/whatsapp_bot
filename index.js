// const qrcode = require("qrcode-terminal");
const qrimage = require("qr-image");
const express = require("express");
const app = express();
const port = 3000;

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const client = new Client({
  authStrategy: new LocalAuth(),
});
let qrr = "";
let refreshes = 0;
client.on("qr", (qr) => {
  //   qrcode.generate(qr, { small: true });
  qrr = qr;
  console.log("qr");
  refreshes++;
});

client.initialize();

client.on("ready", () => {
  console.log("Client is ready!");
});

app.get("/get_refreshes", (req, res) => {
  res.send(`${refreshes}`);
});
app.get("/get_qr", (req, res) => {
  res.header("Content-Type: image/png");
  let img = qrimage.imageSync(qrr, { type: "png" });
  //   res.set("Content-Type", "image/png");
  //   res.send(img);
  res.send(`
    <html>
    <body>
    <img src="data:image/png;base64,${Buffer.from(img).toString("base64")}">
    <script>
    let refreshes = ${refreshes};
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
});

//   res.send(img);
app.get("/send_message", (req, res) => {
  //   res.send(qr);
  //   console.log();
  if (req.query.number && req.query.image_url) {
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
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
