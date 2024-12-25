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

// Đăng ký user
createUserButton.addEventListener('click', async () => {
    const username = prompt('Enter new username:');
    const response = await fetch('/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username}),
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
socket.on('loginSuccess', ({ username}) => {
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

        addMessageToChat(`You: ${message}`);
        messageInput.value = '';
    } else {
        alert('Please select a user to chat with.');
    }
});

// Hiển thị tin nhắn nhận được
socket.on('message', (data) => {
    const { sender} = data;
    if (currentRecipient === sender) {
        loadChatWithUser(sender);
    }
});

// Cập nhật danh sách user
function updateUserList(users) {
    userListContainer.innerHTML = '';
    users.forEach((user) => {
        if (user !== myUsername) {
            const userElement = document.createElement('button');
            userElement.textContent = user;
            userElement.className = 'user-button';
            userElement.onclick = () => {
                currentRecipient = user;
                loadChatWithUser(user);
            };
            userListContainer.appendChild(userElement);
        }
    });
}

// Tải lịch sử chat
async function loadChatWithUser(user) {
    const response = await fetch(`/messages/${user}`);
    const messages = await response.json();

    chatContainer.innerHTML = '';
    messages
        .filter((msg) => msg.sender === user || msg.recipient === user)
        .forEach((msg) => {
            addMessageToChat(`${msg.sender}: ${msg.ciphertext}`);
        });
}

// Thêm tin nhắn vào chat box
function addMessageToChat(message) {
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    chatContainer.appendChild(messageElement);
}

// // Hiển thị tất cả tin nhắn
// function displayMessages(messages) {
//     chatContainer.innerHTML = '';
//     messages.forEach((msg) => {
//         addMessageToChat(`${msg.sender}: ${msg.ciphertext}`);
//     });
// }

// Toggle các nút đăng nhập/đăng ký và Logout
function toggleLoginButtons(isVisible) {
    createUserButton.style.display = isVisible ? 'inline-block' : 'none';
    loginButton.style.display = isVisible ? 'inline-block' : 'none';
    deleteUserButton.style.display = isVisible ? 'inline-block' : 'none';
    logoutButton.style.display = isVisible ? 'none' : 'inline-block';
}
