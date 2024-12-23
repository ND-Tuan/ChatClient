const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

let onlineUsers = {}; // Danh sách người dùng trực tuyến

// API lấy danh sách user
app.get('/users', async (req, res) => {
    const users = await db.getAllUsers();
    res.json(users);
});

// API lấy lịch sử tin nhắn
app.get('/messages/:username', async (req, res) => {
    const { username } = req.params;
    const messages = await db.getMessagesForUser(username);
    res.json(messages);
});

// API tạo user
app.post('/create-user', async (req, res) => {
    const { username, publicKey } = req.body;
    const userExists = await db.getUser(username);

    if (userExists) {
        return res.status(400).json({ success: false, message: 'User đã tồn tại!' });
    }

    await db.addUser(username, publicKey);
    res.json({ success: true });
});

// API xóa user
app.post('/delete-user', async (req, res) => {
    const { username } = req.body;
    await db.deleteUser(username);
    res.json({ success: true });
});

// Xử lý WebSocket
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Đăng nhập user
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

        // Đánh dấu user là active
        await db.setUserActive(username, true);
        onlineUsers[username] = socket.id;

        const messages = await db.getMessagesForUser(username);
        socket.emit('loginSuccess', { username, messages });
        io.emit('updateUsers', Object.keys(onlineUsers));
    });

    // Gửi tin nhắn
    socket.on('message', async (data) => {
        const { sender, recipient, ciphertext } = data;

        // Lưu tin nhắn vào cơ sở dữ liệu
        await db.addMessage(sender, recipient, ciphertext);

        // Phát tin nhắn đến người nhận nếu họ đang trực tuyến
        const recipientSocketId = onlineUsers[recipient];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('message', { sender, ciphertext });
        }
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', async () => {
        for (const username in onlineUsers) {
            if (onlineUsers[username] === socket.id) {
                console.log(`${username} đã ngắt kết nối.`);
                delete onlineUsers[username];

                // Đánh dấu user là không còn active
                await db.setUserActive(username, false);
                break;
            }
        }
        io.emit('updateUsers', Object.keys(onlineUsers));
    });
});

// Khởi động server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
