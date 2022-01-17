const express = require("express");
const bodyParser = require("body-parser");
const Fingerprint = require('express-fingerprint');
const http = require('http');
const socketIO = require('socket.io');
const app = express();
const fs = require("fs");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

app.use(Fingerprint({
  parameters: [
    // Defaults
    Fingerprint.useragent,
    Fingerprint.acceptHeaders,
    Fingerprint.geoip
  ]
}));

const server = http.createServer(app);
const io = socketIO(server);
const dbFile = "./sqlite.db";
const exists = fs.existsSync(dbFile);
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  if (!exists) {
    db.run("CREATE TABLE Users (name TEXT PRIMARY KEY, fngr TEXT UNIQUE, seen INTEGER, flags INTEGER, isMod INTEGER, isAdmin INTEGER)");
    db.run("CREATE TABLE Chats (time INTEGER PRIMARY KEY, text TEXT, name TEXT, replyTo INTEGER, replyToName TEXT, flagged TEXT)");
  }
});

const rName = /^[a-z]{4,15}$/i;
const rowsLimit = 10;
const namesLimit = 100;
const skip = 13;
const deg = 4;
const pingGap = 5 * 1000;
const onlineTime = 4 * pingGap;
const maxFlags = 2;
const socks = { };

const dir = x => x % 2 ? 1 : -1;
const encode = str => {
  for(let i = 0; i < deg; i++) 
    str = Buffer.from(JSON.stringify(str).split``.map((ch, idx) => String.fromCharCode(ch.charCodeAt() + dir(idx) * skip)).join``).toString('base64');
  return str;
};

const decode = str => {
  for(let i = 0; i < deg; i++) 
    str = JSON.parse(Buffer.from(str, 'base64').toString().split``.map((ch, idx) => String.fromCharCode(ch.charCodeAt() - dir(idx) * skip)).join``);
  return str;
};

// console.log(decode(encode('verma')));
// db.all('SELECT * FROM Users', console.log);

// let view = () => {
//   db.all('SELECT * FROM Users', console.log);
// }

app.get("/", (req, resp) => {
  resp.sendFile(`${__dirname}/views/index.html`);
});
app.get("/live", (req, resp) => {
  resp.sendFile(`${__dirname}/views/live.html`);
});
app.get("/users", (req, resp) => {
  resp.sendFile(`${__dirname}/views/users.html`);
});
app.get("/info", (req, resp) => {
  resp.sendFile(`${__dirname}/views/info.html`);
});

app.get("/getNames", (req, resp) => {
  db.all("SELECT name FROM Users", (err, names) => {
    if(err) {
      console.log(err);
    }
    resp.send({ names: names });
  });
});

app.get("/getUsers", (req, resp) => {
  db.all(`SELECT U.name, U.seen, (SELECT COUNT(*) FROM Chats C WHERE C.flagged = U.name) AS actvFlags, U.flags, U.isMod, U.isAdmin, (SELECT COUNT(*) FROM Chats C WHERE C.replyToName = U.name AND C.name != U.name) AS resp FROM Users U`, (err, users) => {
    if(err) {
      console.log('getUsers', err);
    }
    // console.log(users);
    resp.send({ users: users });
  })
});

app.post("/authUser", (req, resp) => {
  let fngr = req.fingerprint.hash;
  if(rName.test(req.body.name)) {

    if(req.body.task === "reg_user")
      db.run(`INSERT INTO Users VALUES ('${req.body.name}', '${fngr}', ${Date.now()}, 0, 0, 0)`, err => {
        if(err) {
          console.log(err, fngr);
          resp.send({ msg: 'User/Device already exists!' });
        } else {
          resp.send({ 
            SECRET: encode(req.body.name),
            redir: '/live' 
          });
        }
      });

    else if(req.body.task === "log_user")
      db.all(`SELECT * FROM Users WHERE name = '${req.body.name}' AND fngr = '${fngr}'`, (err, users) => {
        if(err || !users.length) {
          console.log(err, fngr);
          resp.send({ msg: 'User not found!' });
        } else {
          resp.send({ 
            SECRET: encode(req.body.name),
            redir: '/live' 
          });
        }
      });
  }
});

app.post("/getChats", (req, resp) => {
  // console.log(req.body);
  db.all(`SELECT * FROM Chats WHERE time < ${req.body.time} ORDER BY time DESC LIMIT ${rowsLimit}`, (err, chats) => {
    resp.send({ chats: chats });
  });
});

app.post("/flagChat", (req, resp) => {
  // console.log(req.body);
  if(req.body.name == decode(req.body.SECRET)) {
    db.all(`SELECT (SELECT COUNT(*) flagged FROM Chats WHERE flagged = '${req.body.name}') AS k from Chats WHERE flagged = '' AND time = ${req.body.time}`, (err, actvFlags) => {
      if(err) {
        console.log(err);
      } else if(actvFlags[0].k < maxFlags) {
        resp.send({ msg: !err ? 'success' : 'InternalError' });
        db.run(`UPDATE Chats SET flagged = '${req.body.name}' WHERE time = ${req.body.time}`, err => {
          if(err) {
            console.log(err);
          }
        });        
      }
    });
  } else {
    resp.send({ msg: 'Corrupted data recieved!\nTry logging in again!' });
  }
});

app.post("/getNotifs", (req, resp) => {
  let realName = decode(req.body.SECRET);
  // console.log(req.body);

  if(req.body.name == realName) {
    db.all(`SELECT C.name, C.time FROM Chats C WHERE C.replyTo in (SELECT c.time FROM Chats c WHERE c.name = '${realName}') AND C.name != '${realName}' LIMIT ${rowsLimit}`, (err, notifs) => {
      if(err) {
        console.log(err);
      }
      resp.send({ notifs: notifs });
      db.run(`UPDATE Users SET seen = ${Date.now()} WHERE name = '${realName}'`, err => {});
    })
  } else {
    resp.send({ msg: 'Corrupted data recieved!\nTry logging in again!' });
  }
});

let listener = server.listen(process.env.PORT || 8080, () => {
  console.log(`Your app is listening on port ${listener.address().port}`);
});

process.on("uncaughtException", console.log);

io.on('connection', sock => {
  db.all(`SELECT * FROM Chats ORDER BY time DESC LIMIT ${rowsLimit}`, (err, chats) => {
    if(err) {
      console.log('chats', err);
    }
    sock.emit('recent-chats', chats);
  });

  sock.on('user-in', name => {
    let sockName = decode(name);
    sock.broadcast.emit('user-in', sockName);
    socks[sock.id] = sockName;
    sock.emit('users-online', Object.values(socks));
    // console.log(socks);

    db.all(`SELECT name, time FROM Chats WHERE replyToName == '${sockName}' AND name != '${sockName}' AND time > (SELECT seen FROM Users WHERE name = '${sockName}')`, (err, notifs) => {
      if(notifs.length) sock.emit('unread-notifs');
    });
  });

  sock.on('typing', name => {
    sock.broadcast.emit('typing', decode(name));
  });

  sock.on('add-chat', chat => {
    chat.time = Date.now();
    if(decode(chat.SECRET) == chat.name && !!chat.text.trim().length) {
      db.run(`INSERT INTO Chats VALUES (${Date.now()}, '${
        chat.text.replace(/\'/g, `''`)
      }', '${chat.name}', ${chat.replyTo}, (SELECT name FROM Chats WHERE time = ${chat.replyTo}), '')`, err => {
        if(err) {
          console.log(err);
        }
        io.emit('new-chat', chat);
      });
    } else {
      sock.emit('error', 'Corrupted data recieved!\nTry logging in again!');
      console.log('error');
    }
  });

  sock.on('delete-chat', chat => {
    if(chat.name == decode(chat.SECRET)) {
      db.run(`DELETE FROM Chats WHERE time = ${chat.time}`, err => {
        if(err) {
          console.log(err);
        }
        io.emit('chat-deleted', chat.time);
      });
    } else {
      resp.send({ msg: 'Corrupted data recieved!\nTry logging in again!' });
    }
  });

  sock.on('disconnect', () => {
    sock.broadcast.emit('user-out', socks[sock.id]);
    delete socks[sock.id];
  });
});

/**
  * sock.emit - to the connection
  * sock.broadcast.emit - to every connection, EXCEPT this
  * io.emit - to every connection
  */
