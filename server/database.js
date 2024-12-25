const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./chatApp.db');

const {
    BufferToArrayBuffer,
    ArrayBuffertoBuffer
} = require('../lib.js')

// Tạo bảng user và message nếu chưa tồn tại
db.serialize(() => {
    //tạo bảng KeyPairs (gồm caKeyPair và govKeyPair) (type: ca, gov)
    db.run(`CREATE TABLE IF NOT EXISTS KeyPairs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        publicKey TEXT,
        privateKey TEXT
      )`);

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            publicKey TEXT,
            CertSignature BLOB,
            isActive INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT,
            recipient TEXT,
            header TEXT,
            ciphertext TEXT,
            ctinGOV TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    // Kiểm tra và thêm cột isActive nếu chưa tồn tại
    db.all("PRAGMA table_info(users);", (err, rows) => {
        if (err) {
            console.error("Error checking columns:", err);
            return;
        }
        const columns = rows.map((row) => row.name);
        if (!columns.includes("isActive")) {
            console.log("Adding missing column: isActive");
            db.run(`ALTER TABLE users ADD COLUMN isActive INTEGER DEFAULT 0;`, (alterErr) => {
                if (alterErr) {
                    console.error("Error adding column isActive:", alterErr);
                } else {
                    console.log("Column isActive added successfully!");
                }
            });
        }
    });
});

// Lưu keypair vào database
async function saveKeyPair(type, keyPair) { //(type: ca, gov)
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO KeyPairs (type, publicKey, privateKey) VALUES (?, ?, ?)`, 
        [type, JSON.stringify(keyPair.pub), JSON.stringify(keyPair.sec)], 
        function(err) {

            if (err) {
                return reject(err);
            }
                resolve(this.lastID);
        });
    });
}

// Lấy keypair từ database
async function getKeyPair(type) { //(type: ca, gov)
    return new Promise((resolve, reject) => {
        db.get(`SELECT publicKey, privateKey FROM KeyPairs WHERE type = ?`, [type], (err, row) => {
            if (err) {
                return reject(err);
            }
            if (row && row.publicKey && row.privateKey) {
                resolve({
                    pub: JSON.parse(row.publicKey),
                    sec: JSON.parse(row.privateKey)
                });
            } else {
                resolve(null);
            }
        });
    });
}

// Thêm user mới
function addUser(username, publicKey, CertSignature) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO users (username, publicKey, CertSignature) VALUES (?, ?, ?)`,
            [username, JSON.stringify(publicKey), ArrayBuffertoBuffer(CertSignature)],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Xóa user và các tin nhắn liên quan
function deleteUser(username) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`DELETE FROM users WHERE username = ?`, [username]);
            db.run(
                `DELETE FROM messages WHERE sender = ? OR recipient = ?`,
                [username, username],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    });
}

// Lấy danh sách tất cả user
function getAllUsers() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT username FROM users`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map((row) => row.username));
        });
    });
}

function getUser(username) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT username, publicKey, CertSignature FROM users WHERE username = ?`, [username], (err, row) => {
            if (err) {
                reject(err);
            } else {
                if (row) {
                    const certificate = {
                        username: row.username,
                        pubKey: JSON.parse(row.publicKey)
                    };
                    resolve({
                        certificate,
                        Signature: BufferToArrayBuffer(row.CertSignature)
                    });
                } else {
                    resolve(null);
                }
            }
        });
    });
}

// Đánh dấu trạng thái user là active hoặc không active
function setUserActive(username, isActive) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE users SET isActive = ? WHERE username = ?`,
            [isActive ? 1 : 0, username],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Kiểm tra trạng thái active của user
function isUserActive(username) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT isActive FROM users WHERE username = ?`,
            [username],
            (err, row) => {
                if (err) reject(err);
                else resolve(row?.isActive === 1);
            }
        );
    });
}

// Thêm tin nhắn mới
function addMessage(sender, recipient, header, ciphertext, ctinGOV) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO messages (sender, recipient, header, ciphertext, ctinGOV) VALUES (?, ?, ?, ?, ?)`,
            [sender, recipient, JSON.stringify(header), ciphertext, ctinGOV],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Lấy tin nhắn liên quan đến một user
function getMessagesForUser(user1, user2) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT sender, recipient, header, ciphertext, ctinGOV 
             FROM messages 
             WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?) 
             ORDER BY timestamp`,
            [user1, user2, user2, user1],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const messages = rows.map(row => ({
                        sender: row.sender,
                        recipient: row.recipient,
                        ct: [JSON.parse(row.header), row.ciphertext, row.ctinGOV]
                    }));
                    resolve(messages);
                }
            }
        );
    });
}

module.exports = {
    saveKeyPair,
    getKeyPair,
    addUser,
    deleteUser,
    getAllUsers,
    getUser,
    setUserActive,
    isUserActive,
    addMessage,
    getMessagesForUser,
};
