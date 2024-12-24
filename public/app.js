const socket = io();
let myUsername = '';
let currentRecipient = '';

// DOM Elements
const userListContainer = document.getElementById('user-list');
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const createUserButton = document.getElementById('create-user-button');
const loginButton = document.getElementById('login-button');
const deleteUserButton = document.getElementById('delete-user-button');
const logoutButton = document.getElementById('logout-button');
const loggedInUserDisplay = document.getElementById('logged-in-user');
const fileInput = document.getElementById('file-input');
const uploadFileButton = document.getElementById('upload-file-button');

// Đăng ký user
createUserButton.addEventListener('click', async () => {
    const username = prompt('Enter new username:');
    const response = await fetch('/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
    });

    if (response.ok) {
        alert('User created successfully!');
    } else {
        const { message } = await response.json();
        alert(message);
    }
});

// Đăng nhập user
loginButton.addEventListener('click', () => {
    myUsername = prompt('Enter your username:');
    socket.emit('login', myUsername);
});

// Đăng xuất
logoutButton.addEventListener('click', () => {
    location.reload();
});

// Xóa user
deleteUserButton.addEventListener('click', async () => {
    const username = prompt('Enter username to delete:');
    const response = await fetch('/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
    });

    if (response.ok) {
        alert('User deleted successfully!');
    } else {
        alert('Failed to delete user.');
    }
});

// Cập nhật danh sách user trực tuyến
socket.on('updateUsers', (users) => {
    updateUserList(users);
});

// Đăng nhập thành công
socket.on('loginSuccess', ({ username }) => {
    myUsername = username;
    loggedInUserDisplay.textContent = `Logged in as: ${myUsername}`;
    toggleLoginButtons(false); // Ẩn các nút khác, hiển thị Logout
});

// Lỗi đăng nhập
socket.on('loginError', (error) => {
    alert(error);
});

// Gửi tin nhắn
sendButton.addEventListener('click', () => {
    const message = messageInput.value;

    if (currentRecipient) {
        socket.emit('message', {
            sender: myUsername,
            recipient: currentRecipient,
            ciphertext: message,
        });

        addMessageToChat(`You: ${message}`, 'sent');
        messageInput.value = '';
    } else {
        alert('Please select a user to chat with.');
    }
});

// Xử lý tin nhắn nhận được
socket.on('message', ({ sender, ciphertext }) => {
    if (currentRecipient === sender) {
        addMessageToChat(`${sender}: ${ciphertext}`, 'received');
    }
});

// Xử lý file upload
uploadFileButton.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file || !currentRecipient) return;

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
    });

    if (response.ok) {
        const { url } = await response.json();
        socket.emit('fileMessage', { sender: myUsername, recipient: currentRecipient, url, filename: file.name });

        addMessageToChat(`You sent a file: <a href="${url}" target="_blank">${file.name}</a>`, 'sent');
    }
});

// Hiển thị danh sách user
function updateUserList(users) {
    userListContainer.innerHTML = '';
    users.forEach((user) => {
        if (user !== myUsername) {
            const userButton = document.createElement('button');
            userButton.textContent = user;
            userButton.className = 'user-button';
            userButton.onclick = () => {
                currentRecipient = user;
                loadChatWithUser(user);
            };
            userListContainer.appendChild(userButton);
        }
    });
}

// Tải lịch sử chat
async function loadChatWithUser(user) {
    const response = await fetch(`/messages/${myUsername}`);
    const messages = await response.json();

    chatContainer.innerHTML = '';
    messages
        .filter((msg) => msg.sender === user || msg.recipient === user)
        .forEach((msg) => {
            if (msg.url) {
                addMessageToChat(`<a href="${msg.url}" target="_blank">${msg.filename}</a>`, msg.sender === myUsername ? 'sent' : 'received');
            } else {
                addMessageToChat(`${msg.sender}: ${msg.ciphertext}`, msg.sender === myUsername ? 'sent' : 'received');
            }
        });
}

// Hiển thị tin nhắn trong box chat
function addMessageToChat(message, type) {
    const messageElement = document.createElement('div');
    messageElement.innerHTML = message;
    messageElement.className = `chat-message ${type}-message`;
    chatContainer.appendChild(messageElement);
}

// Toggle các nút đăng nhập/đăng ký và Logout
function toggleLoginButtons(isVisible) {
    createUserButton.style.display = isVisible ? 'inline-block' : 'none';
    loginButton.style.display = isVisible ? 'inline-block' : 'none';
    deleteUserButton.style.display = isVisible ? 'inline-block' : 'none';
    logoutButton.style.display = isVisible ? 'none' : 'inline-block';
}
