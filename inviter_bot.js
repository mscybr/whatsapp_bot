const fs = require("fs");
const qrimage = require("qr-image");
const express = require("express");
const app = express();
const port = 3000;
const accounts = {};
const clients = [];
const route = "/bot";
const connection_timeout = 120000;
const state_file = __dirname + "/data.json";
let logs = [];

// TODO:
let scheduled_tasks = {};
let cronjob_counter = 0;

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

app.use(express.json());

fs.readFile(state_file, function read(err, data) {
  if (err) {
    throw err;
  }

  if (data) {
    let content = [];
    try {
      content = JSON.parse(data);
    } catch (error) {}
    for (const key in content) {
      if (Object.hasOwnProperty.call(content, key)) {
        const element = content[key];
        if (element.connected_to && element.state == "ready") {
          restore(element.connected_to, key);
        }
      }
    }
  }
});

setInterval(write_state, 1000);
// TODO: UNCOMMENT
// for (let index = 0; index < 5; index++) {
//   setTimeout(() => {
//     start_client(index);
//   }, index * 5000);
// }

app.get(route + "/add_client", async (req, res) => {
  start_client(clients.length);
  res.send("added " + clients.length - 1);
});

// TODO:
app.post(route + "/intialize_task/:task_id", async (req, res) => {
  // setting up tasks asyncssly
  let key = req.params.task_id;
  if (scheduled_tasks[key] == undefined) scheduled_tasks[key] = [];
  if (req.body.message) scheduled_tasks[key].message = req.body.message;
  if (req.body.numbers) scheduled_tasks[key].numbers = req.body.numbers;
  if (req.body.client)
    scheduled_tasks[key].client = accounts[req.body.client].client;
  if (req.body.schedule) scheduled_tasks[key].schedule = req.body.schedule;
  res.send("successfully intialized");
});

// TODO: REMOVE THIS
app.get(route + "/get_tasks_logs", async (req, res) => {
  res.send("logged");
  console.log(scheduled_tasks);
});

app.get(route + "/task_status/:task_id", async (req, res) => {
  // gets task status
  let key = req.params.task_id;
  if (scheduled_tasks[key]) {
    let started = scheduled_tasks[key].schedule ? true : false;
    let completed = scheduled_tasks[key].completed_numbers
      ? scheduled_tasks[key].completed_numbers
      : 0;
    let remaining =
      Object.keys(scheduled_tasks[key].numbers).length - completed;
    res.send({
      status: "success",
      completed,
      remaining,
      started,
    });
  } else {
    res.send({
      status: "failed",
      message: "no such task",
    });
  }
});

app.get(route + "/remove_task/:task_id", async (req, res) => {
  // deletes a task if exsist
  let key = req.params.task_id;
  if (scheduled_tasks[key]) delete scheduled_tasks[key];
  res.send("successfully deleted");
});

app.get(route + "/get_clients_statuses", async (req, res) => {
  res.send(
    clients.map((el, index) => {
      return { index: index, state: el.state };
    })
  );
});

app.get(route + "/log_clients", async (req, res) => {
  console.log(clients);
  res.send("logged");
});
app.get(route + "/log_accounts", async (req, res) => {
  console.log(accounts);
  res.send("logged");
});
app.get(route + "/get_logs", async (req, res) => {
  res.send(logs);
});
app.get(route + "/clear_logs", async (req, res) => {
  logs = [];
  res.send("cleared");
});

app.get(route + "/destroy/:token", async (req, res) => {
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
app.get(route + "/get_qr/:token/:id", (req, res) => {
  let token = req.params.token;
  let id = req.params.id;
  function connected() {
    accounts[token].intializing = false;
  }
  function not_connected() {
    res.header("Content-Type: image/png");
    let img = qrimage.imageSync(accounts[token].qrr, {
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
  if (accounts[token] == null) {
    accounts[token] = { intializing: true };
    if (initialize_client(token, id)) {
      res.send("started connection");
    } else {
      res.send("couldn't assign user to client");
    }
  } else {
    if (accounts[token].destroying == null) {
      if (accounts[token].intializing) {
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

app.get(route + "/get_state/:token", (req, res) => {
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

app.get(route + "/get_status/:token", (req, res) => {
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

app.get(route + "/send_message/:token", (req, res) => {
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

function start_cron() {
  setInterval(() => {
    for (const key in scheduled_tasks) {
      if (Object.hasOwnProperty.call(scheduled_tasks, key)) {
        const element = scheduled_tasks[key];
        if (element.schedule && element.message) {
          // date
          // start time
          // end time
          let dt = new Date(element.schedule.date + " 00:00:00");
          if (Date.now() - dt > 0) {
            // date has come
            let start_time_array = element.schedule.start_time.split(":");
            let end_time_array = element.schedule.end_time.split(":");
            let start_time = new Date();
            let end_time = new Date();
            start_time.setHours(start_time_array[0], start_time_array[1], 1);
            end_time.setHours(end_time_array[0], end_time_array[1], 1);
            if (Date.now() - start_time > 0 && end_time - Date.now() > 0) {
              // the time is right
              // using the mod where cronjob_counter % ( timer / 1000 ) == 0 execute otherwise dont
              if (cronjob_counter % element.schedule.timer == 0) {
                let current_number = element.numbers.pop();
                // TODO: create a completed state and stop the scheduling for the completed task
                if (current_number != undefined) {
                  // TODO: execute sending
                  element.completed_numbers.push(current_number);
                  const chatId = current_number + "@c.us";
                  element.client.sendMessage(chatId, element.message);
                }
              }
            }
          }
        }
      }
    }
    cronjob_counter++;
  }, 1000);
}

function restore(token, id) {
  if (accounts[token] == null) {
    accounts[token] = { intializing: true };
    // starting connection
    initialize_client(token, id);
  }
}

function write_state() {
  let states = clients.map((x) => {
    return {
      state: x.state,
      connected_to: x.connected_to,
    };
  });
  fs.writeFileSync(state_file, JSON.stringify(states));
}

function start_client(index) {
  let client = new Client({
    authStrategy: new LocalAuth({ clientId: "client-" + index }),
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      ignoreHTTPSErrors: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process", // <- this one doesn't works in Windows
        "--disable-gpu",
      ],
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

function initialize_client(token, index) {
  client = null;
  // for (let index = 0; index < clients.length; index++) {
  //   const element = clients[index];
  //   if (element.connected_to == null) {
  //     client = element.client;
  //     client_index = index;
  //     element.connected_to = token;
  //     break;
  //   }
  // }
  setTimeout(() => {
    if (clients[index].state == "waiting for qr") {
      delete accounts[clients[index].connected_to];
      clients[index].connected_to = null;
      client.destroy();
      logger("disconnected", " ", index);
      clients[index].state = "waiting for qr";
    }
  }, connection_timeout);
  const element = clients[index];
  if (element.connected_to == null) {
    client = element.client;
    client_index = index;
    element.connected_to = token;
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

function logger(...args) {
  console.log(...args);
  logs.push({
    time: Date.now(),
    message: args,
  });
}
