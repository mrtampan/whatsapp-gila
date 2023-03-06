const { default: makeWASocket, downloadMediaMessage } = require('@adiwajshing/baileys');
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

const WSF = require("wa-sticker-formatter");

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
      })

      listen_identity_change(sock, message).catch((e) => {
        console.error(e);
      })


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
    const group_metadata = await sock.groupCreate('Bot Savedata', []);
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

  await sock.sendMessage(groupId, { text });
};

const reply_bot = async (sock, message) => {
  const senderNumber = message.key.remoteJid;
  console.log(message);
  if(message.message.conversation == '!menu'){
    
    await sock.sendMessage(senderNumber, { text: '!sticker = membuat sticker dari gambar\n !gif = membuat gif dari video' })
    return;
  }
  
  switch(message.message.conversation){
    case "!sticker":{

      

			if (!message.message.imageMessage || message.message.imageMessage.mimetype != "image/jpeg") {
				sock.sendMessage(senderNumber, {text: "Tidak ada gambar :)"})
				break
			}

			const image = await downloadMediaMessage(message, "buffer");
      console.log(image);
			const sticker = new WSF.Sticker(image, { crop: false, pack: "i hope you fine :)", author: 'Mrtampan' });
			await sticker.build();
      console.log(sticker);
      
			const bufferImage = await sticker.get();
			await sock.sendMessage(senderNumber, {sticker: bufferImage});
      break
    }

  }
}

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

  await sock.sendMessage(groupId, { text });  
}

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
