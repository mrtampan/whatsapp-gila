const { default: makeWASocket } = require('@adiwajshing/baileys');
const {
  DisconnectReason,
  useSingleFileAuthState,
} = require('@adiwajshing/baileys');
const { state } = useSingleFileAuthState('./login.json');
const fs = require('fs');
const express = require('express');
const app = express();
const port = 7000;
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const multer = require('multer');
const mul = multer();
app.use(mul.array());

async function connectToWhatsApp() {
  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
  });

  sock.sendMessage;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      var _a, _b;
      const shouldReconnect =
        ((_b =
          (_a = lastDisconnect.error) === null || _a === void 0
            ? void 0
            : _a.output) === null || _b === void 0
          ? void 0
          : _b.statusCode) !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('opened connection');
      runningServer(sock);
    }
  });

  sock.ev.on('messages.upsert', (m) => {
    m.messages.forEach((message) => {
      listen_sw(sock, message).catch((e) => {
        console.error(e);
      });
      unread_msg(sock, message).catch((e) => {
        console.error(e);
      });
    });
  });
}

const runningServer = async (sock) => {
  await app.listen(port, () => {
    console.log(`cli-nodejs-api listening at http://localhost:${port}`);
  });

  // example localhost:7000/sendpesan?nomor=6283***&pesan=hehehe
  await app.get('/sendpesan', (req, res) => {
    console.log(req.body);
    console.log(req.query.pesan);
    sock.sendMessage(`${req.query.nomor}@s.whatsapp.net`, {
      text: req.query.pesan,
    });
    res.send('Horee berhasil');
  });
};
const getGroup = async (sock) => {
  if (!fs.existsSync('./group_id.txt')) {
    const group_metadata = await sock.groupCreate('Status Contact WA', []);
    fs.writeFileSync('./group_id.txt', group_metadata.id);
    return group_metadata.id;
  } else {
    return fs.readFileSync('./group_id.txt', 'utf-8');
  }
};

const isInDb = (nowa) => {
  if (!fs.existsSync('./nowas.txt')) {
    fs.writeFileSync('./nowas.txt', '');
  }

  const nowas = fs.readFileSync('./nowas.txt', 'utf-8').split('\n');
  if (!nowas.includes(nowa)) {
    nowas.push(nowa);

    fs.writeFileSync('./nowas.txt', nowas.join('\n'));
    return false;
  } else {
    return true;
  }
};

const unread_msg = async (sock, message) => {
  if (message.key.msg !== 'unprocessable update') {
    return;
  }
  const senderNumber = message.key.remoteJid;

  if (isInDb(senderNumber)) {
    return;
  }

  const groupId = await getGroup(sock);

  const text = `Data Terdeteksi
    
    Nowa: ${senderNumber}
    Username: ${message.pushName}
    
    Nomor ini gak mau read kamu :), kamu benar benar mengenaskan hahahah`;

  await sock.sendMessage(groupId, { text });
};

const listen_sw = async (sock, message) => {
  if (message.key.remoteJid !== 'status@broadcast' || message.key.fromMe) {
    return;
  }

  const senderNumber = message.key.participant;

  if (isInDb(senderNumber)) {
    return;
  }

  const groupId = await getGroup(sock);

  const text = `Sw Terdeteksi

Nowa: ${senderNumber}
Username: ${message.pushName}

Kamu belum save nomor ini :), Save dulu lah`;

  await sock.sendMessage(groupId, { text });
};

connectToWhatsApp();
