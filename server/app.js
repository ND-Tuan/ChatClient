'use strict'

// This line disables linter errors caused by mocha polluting the global namespace.
/* global describe it before */

const { MessengerClient } = require('../messenger.js')
const {
  generateEG,
  computeDH,
  decryptWithGCM,
  generateECDSA,
  signWithECDSA,
  HMACtoAESKey,
  bufferToString,
  stringToBuffer,
  cryptoKeyToJSON,
  jsonToCryptoKey,
  govEncryptionDataStr
} = require('../lib.js')


const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./database.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

const { subtle } = require('node:crypto').webcrypto

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')

chai.use(chaiAsPromised)
const expect = chai.expect

const stringifyCert = function (cert) {
    if (typeof cert === 'object') {
        return JSON.stringify(cert)
    } else if (typeof cert === 'string') {
        return cert
    } else {
        throw new Error('Certificate is not a JSON or string')
    }
}

// Giải mã cho chính phủ
const govDecrypt = async function (secret, [header, ct, ctGov]) {
    // headers MUST have the field "vGov"!!!
    let govKey = await computeDH(secret, header.vGov)
    govKey = await HMACtoAESKey(govKey, govEncryptionDataStr)

    // headers MUST have the field "cGov" and "ivGov"!!!
    // note that the next line does not have a custom authenticatedData field set
    const mk = await decryptWithGCM(govKey, header.cGov, header.ivGov)
    const subtleMK = await subtle.importKey('raw', mk, 'AES-GCM', true, ['encrypt', 'decrypt'])

    const plaintext = await decryptWithGCM(subtleMK, ctGov, header.receiverIV)
    return bufferToString(plaintext)
}

let onlineUsers = {}; // Danh sách người dùng trực tuyến
let caKeyPair
let govKeyPair
let  myUsername = '';

// Khởi tạo các khóa và MessengerClient
async function initializeKeysAndClient() {
    console.log("Đang khởi tạo khóa và MessengerClient...");
    
    // Lấy hoặc tạo khóa CA
    let caKeyPairJSON = await db.getKeyPair('ca');

    if (!caKeyPairJSON) {
        caKeyPair = await generateECDSA();
        caKeyPairJSON = {
            pub: await cryptoKeyToJSON(caKeyPair.pub),
            sec: await cryptoKeyToJSON(caKeyPair.sec)
        };
        await db.saveKeyPair('ca', caKeyPairJSON);

    } else {
        caKeyPair = {
            pub: await jsonToCryptoKey(caKeyPairJSON.pub, { name: 'ECDSA', namedCurve: 'P-384' }, ['verify']),
            sec: await jsonToCryptoKey(caKeyPairJSON.sec, { name: 'ECDSA', namedCurve: 'P-384' }, ['sign'])
        };
    }

    // Lấy hoặc tạo khóa Chính phủ
    let govKeyPairJSON = await db.getKeyPair('gov');

    if (!govKeyPairJSON) {
        govKeyPair = await generateEG();
        govKeyPairJSON = {
            pub: await cryptoKeyToJSON(govKeyPair.pub),
            sec: await cryptoKeyToJSON(govKeyPair.sec)
        };
        await db.saveKeyPair('gov', govKeyPairJSON);

    }  else {
        govKeyPair = {
            pub: await jsonToCryptoKey(govKeyPairJSON.pub, { name: 'ECDH', namedCurve: 'P-384' }, []),
            sec: await jsonToCryptoKey(govKeyPairJSON.sec, { name: 'ECDH', namedCurve: 'P-384' }, ['deriveKey'])
        };
    }

}
  

// Gọi hàm initializeKeysAndClient ngay khi ứng dụng khởi chạy
initializeKeysAndClient().then(() => {
    console.log("Khởi tạo thành công các khóa và MessengerClient.");

     // Định nghĩa API REST
     app.get('/users', async (req, res) => {
        const users = await db.getAllUsers();
        res.json(users);
    });
    
    // Lấy tin nhắn cho user
    app.get('/messages/:username', async (req, res) => {
        const { username } = req.params;

        const user = await db.getUser(username);
        const messages = await db.getMessagesForUser(username);
        
        //Nhận chứng chỉ từ user
        const {certificate, Signature } = user;

        let arrayBufferSignature;
        if (typeof Signature === 'object' && Signature !== null) {
            // Assuming Signature is an object that needs to be serialized
            const jsonString = JSON.stringify(Signature);
            const buffer = Buffer.from(jsonString);
            arrayBufferSignature = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        }

        console.log('Type of Signature:', typeof arrayBufferSignature);

        //Khởi tạo clientclient
        const receiverClient = new MessengerClient(caKeyPair.pub, govKeyPair.pub);
        await receiverClient.receiveCertificate(certificate, arrayBufferSignature);

        // Giải mã tin nhắn
        const decryptedMessages = await Promise.all(messages.map(async (message) => {
            const { sender, ct } = message;
            const decryptedMessage = await receiverClient.receiveMessage(sender, ct);
            return {
                sender,
                recipient: message.recipient,
                decryptedMessage
            };
        }));
  
        res.json(decryptedMessages);
    });
    
    // Tạo user
    app.post('/create-user', async (req, res) => {
        const { username } = req.body;
        const userExists = await db.getUser(username);
        
        // Kiểm tra xem user đã tồn tại chưa
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User đã tồn tại!' });
        }

        // Khởi tạo MessengerClient với các khóa
        const NewUser = new MessengerClient(caKeyPair.pub, govKeyPair.pub);
        
        // Tạo chứng chỉ cho user
        const Certificate = await NewUser.generateCertificate(username);
        const publicKey = Certificate.pubKey;
        const Signature = await signWithECDSA(caKeyPair.sec, stringifyCert(Certificate));
        
        // Lưu thông tin user vào database
        await db.addUser(username, publicKey, Signature);
        res.json({ success: true });
    });
    
    // Xóa user
    app.post('/delete-user', async (req, res) => {
        const { username } = req.body;
        await db.deleteUser(username);
        res.json({ success: true });
    });
  
      // Xử lý WebSocket
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);
        
        // Xử lý đăng nhập
        socket.on('login', async (username) => {
            const user = await db.getUser(username);
    
            if (!user) {
                socket.emit('loginError', 'User không tồn tại.');
                return;
            }
    
            const isActive = await db.isUserActive(username);
            if (isActive) {
                socket.emit('loginError', 'User đã được đăng nhập trên thiết bị khác.');
                return;
            }
            
            await db.setUserActive(username, true);
            onlineUsers[username] = socket.id;

            myUsername = username;
            
            socket.emit('loginSuccess', { username });
            io.emit('updateUsers', Object.keys(onlineUsers));
        });

        // Xử lý gửi tin nhắn
        socket.on('message', async (data) => {
            const { sender, recipient, plaintext } = data;

            // lấy chứng chỉ của người nhận
            const recipientUser = await db.getUser(recipient);
            const { certificate, Signature } = recipientUser;

            
            let arrayBufferSignature;
            if (typeof Signature === 'object' && Signature !== null) {
                // Assuming Signature is an object that needs to be serialized
                const jsonString = JSON.stringify(Signature);
                const buffer = Buffer.from(jsonString);
                arrayBufferSignature = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            }

            console.log('Type of Signature:', typeof arrayBufferSignature);
            
            // Khởi tạo MessengerClient
            const senderClient = new MessengerClient(caKeyPair.pub, govKeyPair.pub);
            await senderClient.receiveCertificate(certificate, arrayBufferSignature);

            // Mã hóa tin nhắn bằng User.sendMessage
            const [header, ciphertext, ctinGOV] = await senderClient.sendMessage(recipient, plaintext);

            // Lưu tin nhắn vào cơ sở dữ liệu
            await addMessage(sender, recipient, header, ciphertext, ctinGOV);

            // Kiểm tra xem người nhận có trực tuyến không
            const recipientSocketId = onlineUsers[recipient];
            if (recipientSocketId) {
                // Gửi tin nhắn đã mã hóa đến người nhận nếu họ trực tuyến
                io.to(recipientSocketId).emit('message', { sender});
            }
        });

        // Xử lý ngắt kết nối
        socket.on('disconnect', async () => {
            for (const username in onlineUsers) {
                if (onlineUsers[username] === socket.id) {
                    console.log(`${username} đã ngắt kết nối.`);
                    delete onlineUsers[username];
                    myUsername = '';
                    // Đánh dấu user không active
                    await setUserActive(username, false);
                    break;
                }
            }
            io.emit('updateUsers', Object.keys(onlineUsers));
        });
    });

    const PORT = 3001;
    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });

}).catch(err => {
    console.error('Failed to initialize keys and MessengerClient:', err);
    process.exit(1); // Thoát ứng dụng nếu khởi tạo thất bại
});