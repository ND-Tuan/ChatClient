const socket = io();
let myUsername = '';
let currentRecipient = '';

// DOM Elements
const RegisterForm = document.getElementById('register-form');
const LoginForm = document.getElementById('login-form');
const ToggleRegisterButton = document.getElementById('register-herf');
const ToggleLoginButton = document.getElementById('login-herf');

const userListContainer = document.getElementById('user-list');
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

// const deleteUserButton = document.getElementById('delete-user-button');
const logoutButton = document.getElementById('logout-button');
const loggedInUserDisplay = document.getElementById('logged-in-user');
const fileInput = document.getElementById('file-input');
const uploadFileButton = document.getElementById('upload-file-button');

const createUserButton = document.getElementById('register-button');
const RegisterNameInput = document.getElementById('register-name');
const RegisterPassInput = document.getElementById('register-pass');

const loginButton = document.getElementById('login-button');
const LoginNameInput = document.getElementById('login-name');
const LoginPassInput = document.getElementById('login-pass');

const accessForm = document.getElementById('access-form');
const appHome = document.getElementById('app');
const userSelecter = document.getElementsByClassName('user-button');

// Toggle giữa form đăng ký và form đăng nhập

ToggleLoginButton.addEventListener('click', () => {
    RegisterForm.style.display = 'none';
    LoginForm.style.display = 'flex';
});

ToggleRegisterButton.addEventListener('click', () => {
    RegisterForm.style.display = 'flex';
    LoginForm.style.display = 'none';
});

// Đăng ký user
createUserButton.addEventListener('click', async () => {
    const username = RegisterNameInput.value;
    const password = RegisterPassInput.value;
    const response = await fetch('/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
        alert('Registered successfully!');
        myUsername = username;
        socket.emit('login', { username, password });
    } else {
        const { message } = await response.json();
        alert(message);
    }
});

// Đăng nhập user
loginButton.addEventListener('click', () => {
    const username = LoginNameInput.value;
    const password = LoginPassInput.value;

    myUsername = username;
    socket.emit('login', {username, password});
});

// Đăng xuất
logoutButton.addEventListener('click', () => {
    location.reload();
});

Array.from(userSelecter).forEach((element) => {
    element.addEventListener('click', function() {
        Array.from(userSelecter).forEach((el) => el.classList.remove('selected'));
        this.classList.add('selected');
    });
});

// // Xóa user
// deleteUserButton.addEventListener('click', async () => {
//     const username = prompt('Enter username to delete:');
//     const response = await fetch('/delete-user', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ username }),
//     });

//     if (response.ok) {
//         alert('User deleted successfully!');
//     } else {
//         alert('Failed to delete user.');
//     }
// });

// Cập nhật danh sách user trực tuyến
socket.on('updateUsers', (users) => {
    updateUserList(users);
});

// Đăng nhập thành công
socket.on('loginSuccess', ({ username }) => {
    myUsername = username;
    loggedInUserDisplay.textContent = `${myUsername}`;
    toggleLoginButtons(false);

});

// Lỗi đăng nhập
socket.on('loginError', (error) => {
    alert(error);
});

// Gửi tin nhắn
sendButton.addEventListener('click', () => {
    let message = ""
    message = messageInput.value;

    if (currentRecipient) {
        socket.emit('message', {
            sender: myUsername,
            recipient: currentRecipient,
            text: message,
            type: 'text'
        });

        addMessageToChat( myUsername, message , 'sent');
        messageInput.value = '';
    } else {
        alert('Please select a user to chat with.');
    }
});

// Xử lý tin nhắn nhận được
socket.on('message', ({sender}) => {
    if (currentRecipient === sender) {
        loadChatWithUser(sender);
    }
});

// Xử lý file upload
uploadFileButton.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async () => {
    if (!currentRecipient) {
        alert('Please select a user to chat with.');
        return;
    }

    const file = fileInput.files[0];
    if (!file || !currentRecipient) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const { url } = await response.json();
            socket.emit('message', {
                sender: myUsername,
                recipient: currentRecipient,
                text: url,
                type: 'file'
            });

            if(isImage(file.name)) {
                message = `<img src="${url}" alt="${file.name}" class="chat-image">`;
            } else {
                message = `<i class="fa-solid fa-file "></i><a href="${url}" target="_blank">${file.name}</a>`;
            }

            addMessageToChat(myUsername, message, 'sent');
            
        } else {
            console.error('Upload failed:', response.statusText);
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

// Hiển thị danh sách user
function updateUserList(users) {
    userListContainer.innerHTML = '';
    users.forEach((user) => {
        if (user !== myUsername) {
            const userButton = document.createElement('div');

            const avatarClass = "avatar fa-solid fa-" + user.charAt(0).toLowerCase();
            userButton.innerHTML = `<i class="${avatarClass}"></i>` + user;
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
async function loadChatWithUser(selectedUser) {
    const response = await fetch(`/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedUser, myUsername})
    });
    const messages = await response.json();

    chatContainer.innerHTML = '';
    messages.forEach((msg) => {
    if (msg.type === 'file') {
        let message = '';
        if(isImage(getFileNameFromPath(msg.decryptedMessage))) {
            message = `<img src="${msg.decryptedMessage}" alt="${getFileNameFromPath(msg.decryptedMessage)}" class="chat-image">`;
        } else {
            message = `<i class="fa-solid fa-file "></i><a href="${msg.decryptedMessage}" target="_blank">${getFileNameFromPath(msg.decryptedMessage)}</a>`;
        }

        addMessageToChat(msg.sender, message, msg.sender === myUsername ? 'sent' : 'received');
    } else {
        addMessageToChat(msg.sender, msg.decryptedMessage, msg.sender === myUsername ? 'sent' : 'received');
    }
});
}

// Hiển thị tin nhắn trong box chat
function addMessageToChat(sender, message, type) {
    const messageElement = document.createElement('div');
    messageElement.innerHTML = message;
    messageElement.className = `chat-message ${type}-message`;

    const messageContainer = document.createElement('div');
    messageContainer.className = 'message-container';

    let avatarClass = "avatar fa-solid fa-" + sender.charAt(0).toLowerCase();

    if(type === 'sent') {
        messageContainer.classList.add('send');
        avatarClass = "avatar inChat fa-solid fa-user"
    } else {
        avatarClass = "avatar inChat fa-solid fa-" + sender.charAt(0).toLowerCase();
    }

    const avatar = document.createElement('i');
    avatar.className = avatarClass;

    messageContainer.appendChild(avatar);
    messageContainer.appendChild(messageElement);

    chatContainer.appendChild(messageContainer);
}

// Toggle các nút đăng nhập/đăng ký và Logout
function toggleLoginButtons(isVisible) {
    accessForm.style.display = isVisible ? 'flex' : 'none';
    appHome.style.display = isVisible ? 'none' : 'flex';
}

function getExtension(filename) {
    var parts = filename.split('.');
    return parts[parts.length - 1];
}

// Hàm để lấy tên tệp từ đường dẫn
function getFileNameFromPath(filePath) {
    return filePath.split('/').pop().split('$$').pop();
}

// Kiểm tra file có phải là ảnh
function isImage(filename) {
    var ext = getExtension(filename);
    switch (ext.toLowerCase()) {
      case 'jpg':
      case 'gif':
      case 'bmp':
      case 'png':
        //etc
        return true;
    }
    return false;
}
