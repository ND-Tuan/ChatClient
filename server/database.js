const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./chatApp.db');

// Tạo bảng user và message nếu chưa tồn tại
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            publicKey TEXT,
            isActive INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT,
            recipient TEXT,
            ciphertext TEXT,
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

// Thêm user mới
function addUser(username, publicKey) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO users (username, publicKey) VALUES (?, ?)`,
            [username, publicKey],
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

// Lấy thông tin user
function getUser(username) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
            if (err) reject(err);
            else resolve(row);
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
function addMessage(sender, recipient, ciphertext) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO messages (sender, recipient, ciphertext) VALUES (?, ?, ?)`,
            [sender, recipient, ciphertext],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Lấy tin nhắn liên quan đến một user
function getMessagesForUser(username) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM messages WHERE sender = ? OR recipient = ? ORDER BY timestamp`,
            [username, username],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

module.exports = {
    addUser,
    deleteUser,
    getAllUsers,
    getUser,
    setUserActive,
    isUserActive,
    addMessage,
    getMessagesForUser,
};
