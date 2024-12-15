const {
  makeWASocket,
  downloadMediaMessage,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const Pino = require('pino');
const chalk = require('chalk');
const express = require('express');
const app = express();
const port = 7000;
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const multer = require('multer');
const mul = multer();
app.use(mul.array());

const WSF = require('wa-sticker-formatter');

// Baileys punya
const Logger = {
  level: 'error',
};
const logger = Pino({
  ...Logger,
});
const Store = (log = logger) => {
  const store = makeInMemoryStore({ logger: log });
  return store;
};
const store = Store(logger);
store?.readFromFile('./session.json');

setInterval(() => {
  store?.writeToFile('./session.json');
}, 10_000);

const color = (text, color) => {
  return !color ? chalk.green(text) : chalk.keyword(color)(text);
};

async function connectToWhatsApp(use_pairing_code = false) {
  const { state, saveCreds } = await useMultiFileAuthState('acumalaka');

  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    version: version,
    logger: logger,
    printQRInTerminal: true,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    browser: Browsers.macOS('Chrome'),
    getMessage,
  });

  store?.bind(sock.ev);

  sock.ev.process(async (ev) => {
    if (ev['creds.update']) {
      await saveCreds();
    }
    if (ev['connection.update']) {
      console.log('Connection update', ev['connection.update']);
      const update = ev['connection.update'];
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const shouldReconnect =
          lastDisconnect.error?.output?.statusCode !==
          DisconnectReason.loggedOut;
        console.log(
          'connection closed due to ',
          lastDisconnect.error,
          ', reconnecting ',
          shouldReconnect
        );
        // reconnect if not logged out
        if (shouldReconnect) {
          connectToWhatsApp();
        }
      } else if (connection === 'open') {
        console.log('opened connection');
        runningServer(sock);
      }
    }
    // sock.ev.on("messages.upsert", async (message) => {
    //   console.log(message);
    // })
    sock.ev.on('messages.upsert', (m) => {
      m.messages.forEach((message) => {
        // logger
        const path = './result/logger.txt';
        const saving = fs.readFileSync(path, 'utf-8').split('\n');
        saving.push(JSON.stringify(message));

        fs.writeFileSync(path, saving.join('\n'));

        // receive status wa
        listen_sw(sock, message).catch((e) => {
          console.error(e);
        });

        // receive unread message
        unread_msg(sock, message).catch((e) => {
          console.error(e);
        });

        reply_bot(sock, message).catch((e) => {
          console.error(e);
        });

        listen_identity_change(sock, message).catch((e) => {
          console.error(e);
        });
      });
    });
  });
  /**
   *
   * @param {import("@whiskeysockets/baileys").WAMessageKey} key
   * @returns {import("@whiskeysockets/baileys").WAMessageContent | undefined}
   */

  async function getMessage(key) {
    if (store) {
      const msg = await store.loadMessage(key.remoteJid, key.id);
      return msg?.message || undefined;
    }
    // only if store is present
    return proto.Message.fromObject({});
  }
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
    res.send('Send Successfull');
  });
};

const getGroup = async (sock) => {
  if (!fs.existsSync('./group_id.txt')) {
    const group_metadata = await sock.groupCreate('Bot Savedata', [
      sock.user.id,
    ]);
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
  if (message.msg !== 'unprocessable update') {
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

  const path = './result/unread.txt';
  const saving = fs.readFileSync(path, 'utf-8').split('\n');
  saving.push(text);

  fs.writeFileSync(path, saving.join('\n'));
};

const reply_bot = async (sock, message) => {
  const senderNumber = message.key.remoteJid;
  console.log(message);
  if (message.message.conversation == '!menu') {
    await sock.sendMessage(senderNumber, {
      text: '!sticker = membuat sticker dari gambar\n !gif = membuat gif dari video',
    });
    return;
  }

  switch (message.message.conversation) {
    case '!sticker': {
      if (
        !message.message.imageMessage ||
        message.message.imageMessage.mimetype != 'image/jpeg'
      ) {
        sock.sendMessage(senderNumber, { text: 'Tidak ada gambar :)' });
        break;
      }

      const image = await downloadMediaMessage(message, 'buffer');
      console.log(image);
      const sticker = new WSF.Sticker(image, {
        crop: false,
        pack: 'i hope you fine :)',
        author: 'Mrtampan',
      });
      await sticker.build();
      console.log(sticker);

      const bufferImage = await sticker.get();
      await sock.sendMessage(senderNumber, { sticker: bufferImage });
      break;
    }
  }
};

const listen_identity_change = async (sock, message) => {
  if (message.msg !== 'identity changed') {
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
    
    Nomor ini sudah ganti data diri :), kamu benar benar harus berhati-hati hahahah`;

  const path = './result/identity_change.txt';

  const saving = fs.readFileSync(path, 'utf-8').split('\n');
  saving.push(text);

  fs.writeFileSync(path, saving.join('\n'));
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

  const path = './result/listen_sw.txt';
  const saving = fs.readFileSync(path, 'utf-8').split('\n');
  saving.push(text);

  fs.writeFileSync(path, saving.join('\n'));
};

connectToWhatsApp();
