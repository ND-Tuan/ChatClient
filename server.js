import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { MessengerClient } from './messenger.js';
import { generateEG, cryptoKeyToJSON } from './lib.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const caKeyPair = await generateEG(); // Replace with actual CA key pair
const govKeyPair = await generateEG(); // Replace with actual government key pair
const client = new MessengerClient(caKeyPair.pub, govKeyPair.pub);

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('register', async (username, callback) => {
    const cert = await client.generateCertificate(username);
    const certSignature = await cryptoKeyToJSON(cert.pubKey); // Replace with actual signature
    await client.receiveCertificate(cert, certSignature);
    callback(cert);
  });

  socket.on('send message', async (recipient, message, callback) => {
    try {
      const [header, ciphertext, ctinGOV] = await client.sendMessage(recipient, message);
      io.emit('chat message', { header, ciphertext, ctinGOV });
      callback(null, 'Message sent');
    } catch (error) {
      callback(error.message);
    }
  });

  socket.on('receive message', async (sender, data, callback) => {
    try {
      const message = await client.receiveMessage(sender, data);
      callback(null, message);
    } catch (error) {
      callback(error.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

const PORT = process.env.PORT || 3001; // Changed port number to 3001
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});